/**
 * Tool runtime module for ChatAgent
 *
 * Handles:
 * - Tool execution logic with retry
 * - Tool timeout handling
 * - Error standardization
 * - Tool run record management
 */

import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { classifyRetryableError } from "../retry-policy";
import { buildApprovalSignature, requiresApprovalPolicy } from "../approval-policy";
import { getMessageText, normalizeToolArguments as normalizeArgs } from "../model-utils";
import { validateToolArguments } from "./model-execution";
import {
  type ChatAgentState,
  type ToolRunRecord,
  type ProgressEmitter
} from "./state-runtime";
import {
  appendRuntimeEvent,
  updateLastErrorState,
  updateRetryStatsState,
  upsertToolRunState
} from "./state-runtime";
import {
  hasApprovedSignature,
  queueApproval
} from "./approval-runtime";

// ============ Types ============

export interface ToolExecutionContext {
  getState: () => ChatAgentState;
  setState: (state: ChatAgentState) => void;
  mcp: {
    callTool: (params: { name: string; serverId: string; arguments: Record<string, unknown> }) => Promise<unknown>;
    listTools: () => Array<{ name: string; description?: string; serverId: string }>;
  } | null;
  retry: <T>(fn: (attempt: number) => Promise<T>, options: { maxAttempts: number; shouldRetry: (error: unknown) => boolean }) => Promise<T>;
  getToolTimeoutMs: () => number;
  getToolMaxAttempts: () => number;
}

export interface ToolExecutionResult {
  result: unknown;
  newState: ChatAgentState;
}

// ============ Tool Retry Logic ============

/**
 * Check if a tool error is retryable
 */
export function isRetryableToolError(error: unknown): boolean {
  return classifyRetryableError("tool", error);
}

/**
 * Check if an MCP connection error is retryable
 */
export function isRetryableMcpConnectionError(error: unknown): boolean {
  return classifyRetryableError("mcp_connection", error);
}

// ============ Tool Execution with Retry ============

/**
 * Call MCP tool with retry and timeout
 */
export async function callMcpToolWithRetry(
  params: {
    name: string;
    serverId: string;
    arguments: Record<string, unknown>;
    emitProgress?: ProgressEmitter;
  },
  context: ToolExecutionContext
): Promise<{ result: unknown; newState: ChatAgentState }> {
  const timeoutMs = context.getToolTimeoutMs();
  const maxAttempts = context.getToolMaxAttempts();
  const retryEnabled = maxAttempts > 1;

  const runner = async (attempt: number) => {
    context.setState(updateRetryStatsState(context.getState(), "tool", (stats) => ({
      ...stats,
      attempts: stats.attempts + 1
    })));
    if (attempt > 1) {
      params.emitProgress?.({
        phase: "tool",
        status: "info",
        toolName: params.name,
        message: `Retrying "${params.name}" (attempt ${attempt}/${maxAttempts})`
      });
    }

    return await Promise.race([
      context.mcp!.callTool({
        name: params.name,
        serverId: params.serverId,
        arguments: params.arguments
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  };

  if (!retryEnabled) {
    try {
      const result = await runner(1);
      context.setState(updateRetryStatsState(context.getState(), "tool", (stats) => ({
        ...stats,
        success: stats.success + 1
      })));
      return { result, newState: context.getState() };
    } catch (error) {
      context.setState(updateRetryStatsState(context.getState(), "tool", (stats) => ({
        ...stats,
        exhausted: stats.exhausted + 1
      })));
      throw error;
    }
  }

  try {
    const result = await context.retry(runner, {
      maxAttempts,
      shouldRetry: (error) => isRetryableToolError(error)
    });
    context.setState(updateRetryStatsState(context.getState(), "tool", (stats) => ({
      ...stats,
      success: stats.success + 1
    })));
    return { result, newState: context.getState() };
  } catch (error) {
    context.setState(updateRetryStatsState(context.getState(), "tool", (stats) => ({
      ...stats,
      exhausted: stats.exhausted + 1
    })));
    throw error;
  }
}

// ============ Tool List Builder ============

/**
 * Build AI tools from MCP server tools
 */
export async function buildAiTools(
  mcp: ToolExecutionContext["mcp"],
  context: Omit<ToolExecutionContext, "mcp">,
  emitProgress?: ProgressEmitter
): Promise<{
  tools: ToolSet;
  toolList: string[];
}> {
  if (!mcp) {
    return { tools: {}, toolList: [] };
  }

  const availableTools = mcp.listTools();
  const shortNameCounts = new Map<string, number>();

  for (const item of availableTools) {
    const shortName = item.name.includes(".") ? item.name.split(".").slice(1).join(".") : item.name;
    shortNameCounts.set(shortName, (shortNameCounts.get(shortName) || 0) + 1);
  }

  const tools: ToolSet = {};
  const toolList: string[] = [];

  for (const item of availableTools) {
    const rawName = item.name.includes(".") ? item.name.split(".").slice(1).join(".") : item.name;
    const serverId = item.name.includes(".") ? item.name.split(".")[0] : item.serverId;
    const shortName = rawName;

    const aliases = shortNameCounts.get(shortName) === 1 ? [shortName, item.name] : [item.name];

    for (const alias of aliases) {
      if (tools[alias]) continue;

      const toolDef = tool({
        description: item.description || `MCP tool ${rawName}`,
        inputSchema: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
          return executeToolCallInternal(rawName, serverId, alias, args, {
            ...context,
            mcp
          }, emitProgress);
        }
      });
      tools[alias] = toolDef;
    }
    toolList.push(`${item.name}: ${item.description || "No description"}`);
  }

  return { tools, toolList };
}

/**
 * Internal implementation for tool execution with full state management.
 * Handles: validation, approval, retry, runtime state/events, and progress emission.
 */
async function executeToolCallInternal(
  rawName: string,
  serverId: string | undefined,
  alias: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  emitProgress?: ProgressEmitter
): Promise<unknown> {
  const normalizedArgs = normalizeArgs(rawName, args, { alias, serverId });
  const runId = crypto.randomUUID();
  const runStart = new Date().toISOString();

  const baseRun: ToolRunRecord = {
    id: runId,
    toolName: alias,
    serverId,
    status: "running",
    startedAt: runStart,
    argsSnippet: JSON.stringify(normalizedArgs).slice(0, 320)
  };

  // Validate input
  const inputValidationError = validateToolArguments(rawName, normalizedArgs, { alias, serverId });
  if (inputValidationError) {
    context.setState(updateLastErrorState(appendRuntimeEvent(upsertToolRunState(context.getState(), {
      ...baseRun,
      status: "error",
      finishedAt: new Date().toISOString(),
      error: inputValidationError
    }), {
      level: "error",
      source: "tool",
      type: "tool_input_error",
      message: `Tool ${alias} input validation failed`,
      data: { toolName: alias }
    }), inputValidationError));
    emitProgress?.({
      phase: "tool",
      status: "error",
      toolName: alias,
      message: `Tool "${alias}" input validation failed`,
      snippet: inputValidationError
    });
    return { error: inputValidationError };
  }

  context.setState(appendRuntimeEvent(upsertToolRunState(context.getState(), baseRun), {
    level: "info",
    source: "tool",
    type: "tool_start",
    message: `Tool ${alias} started`,
    data: { toolName: alias, serverId }
  }));
  emitProgress?.({
    phase: "tool",
    status: "start",
    toolName: alias,
    message: `Executing tool "${alias}"`,
    snippet: JSON.stringify(normalizedArgs).slice(0, 240)
  });

  try {
    if (!context.mcp) {
      const error = "MCP unavailable";
      context.setState(updateLastErrorState(upsertToolRunState(context.getState(), {
        ...baseRun,
        status: "error",
        finishedAt: new Date().toISOString(),
        error
      }), error));
      return { error };
    }

    // Check approval
    const approvalSignature = buildApprovalSignature(rawName, serverId, normalizedArgs);
    if (requiresApprovalPolicy(rawName, normalizedArgs)) {
      const { found, nextState } = hasApprovedSignature(context.getState(), approvalSignature);
      context.setState(nextState);
      if (!found) {
        const { approval, nextState: queuedState } = queueApproval(context.getState(), {
          signature: approvalSignature,
          toolName: alias,
          serverId,
          argsSnippet: JSON.stringify(normalizedArgs).slice(0, 320)
        });
        const error = `Tool "${alias}" requires approval (id: ${approval.id}).`;
        context.setState(updateLastErrorState(appendRuntimeEvent(upsertToolRunState(queuedState, {
          ...baseRun,
          status: "blocked",
          finishedAt: new Date().toISOString(),
          error
        }), {
          level: "info",
          source: "tool",
          type: "tool_approval_required",
          message: `Tool ${alias} pending approval`,
          data: { toolName: alias, approvalId: approval.id }
        }), error));
        emitProgress?.({
          phase: "tool",
          status: "info",
          toolName: alias,
          message: `Tool "${alias}" is waiting for approval`,
          snippet: error
        });
        return { error, approvalId: approval.id, status: "pending_approval" };
      }
    }

    // Execute tool with retry
    const { result } = await callMcpToolWithRetry(
      {
        name: rawName,
        serverId: serverId!,
        arguments: normalizedArgs,
        emitProgress
      },
      context
    );

    const resultSnippet =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
    context.setState(appendRuntimeEvent(upsertToolRunState(context.getState(), {
      ...baseRun,
      status: "success",
      finishedAt: new Date().toISOString(),
      resultSnippet: resultSnippet.slice(0, 480)
    }), {
      level: "success",
      source: "tool",
      type: "tool_success",
      message: `Tool ${alias} completed`,
      data: { toolName: alias }
    }));
    emitProgress?.({
      phase: "tool",
      status: "success",
      toolName: alias,
      message: `Tool "${alias}" completed`,
      snippet: resultSnippet.slice(0, 320)
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.setState(updateLastErrorState(appendRuntimeEvent(upsertToolRunState(context.getState(), {
      ...baseRun,
      status: "error",
      finishedAt: new Date().toISOString(),
      error: message
    }), {
      level: "error",
      source: "tool",
      type: "tool_error",
      message: `Tool ${alias} failed`,
      data: { toolName: alias }
    }), message));
    emitProgress?.({
      phase: "tool",
      status: "error",
      toolName: alias,
      message: `Tool "${alias}" failed`,
      snippet: message.slice(0, 240)
    });
    return { error: message };
  }
}

// Re-export for convenience
export { getMessageText };
