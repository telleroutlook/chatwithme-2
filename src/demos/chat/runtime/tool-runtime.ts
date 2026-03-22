/**
 * Tool runtime module for ChatAgent
 *
 * Handles:
 * - Tool execution logic with retry
 * - Tool timeout handling
 * - Error standardization
 * - Tool run record management
 */

import type { ToolSet } from "ai";
import { classifyRetryableError } from "../retry-policy";
import { buildApprovalSignature, requiresApprovalPolicy } from "../approval-policy";
import { normalizeToolArguments as normalizeArgs } from "../model-utils";
import { validateToolArguments } from "./model-execution";
import { createWebSearchTool, BUILTIN_TOOL_KEY } from "../builtin-tools/web-search";
import { createWebReaderTool, BUILTIN_WEB_READER_KEY } from "../builtin-tools/web-reader";
import { createDataAnalyzerTool, BUILTIN_DATA_ANALYZER_KEY } from "../builtin-tools/data-analyzer";
import { createChartTemplateTool, BUILTIN_CHART_TEMPLATE_KEY } from "../builtin-tools/chart-template";
import { createMathEvalTool, BUILTIN_MATH_EVAL_KEY } from "../builtin-tools/math-eval";
import { createWeatherTool, BUILTIN_WEATHER_KEY } from "../builtin-tools/weather";
import { createWikipediaTool, BUILTIN_WIKIPEDIA_KEY } from "../builtin-tools/wikipedia";
import { createCurrencyTool, BUILTIN_CURRENCY_KEY } from "../builtin-tools/currency";
import { createDictionaryTool, BUILTIN_DICTIONARY_KEY } from "../builtin-tools/dictionary";
import { createDatetimeTool, BUILTIN_DATETIME_KEY } from "../builtin-tools/datetime";
import { createGithubTool, BUILTIN_GITHUB_KEY } from "../builtin-tools/github";
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

// ============ Helpers ============

/** Sensitive field names that should be redacted from logs. */
const SENSITIVE_KEYS = new Set(["password", "passwd", "secret", "token", "apikey", "api_key", "key", "authorization", "credential", "credentials"]);

/**
 * Serialize args for logging, redacting sensitive fields and handling circular refs.
 */
function safeStringify(args: unknown, maxLength = 320): string {
  try {
    const str = JSON.stringify(args, (k, v) => {
      if (typeof k === "string" && SENSITIVE_KEYS.has(k.toLowerCase())) return "[REDACTED]";
      return v;
    });
    return str.slice(0, maxLength);
  } catch {
    return "[unserializable]";
  }
}

// ============ Types ============

export interface ToolExecutionContext {
  getState: () => ChatAgentState;
  setState: (state: ChatAgentState) => void;
  mcp: {
    callTool: (params: { name: string; serverId: string; arguments: Record<string, unknown> }) => Promise<unknown>;
    listTools: () => Array<{ name: string; description?: string; serverId: string; inputSchema?: Record<string, unknown> }>;
    getAITools: () => ToolSet;
    ensureJsonSchema: () => Promise<void>;
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
  if (!context.mcp) throw new Error("MCP context is not available");
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

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Tool timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        context.mcp!.callTool({
          name: params.name,
          serverId: params.serverId,
          arguments: params.arguments
        }),
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
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

// ============ Cached Builtin Tools ============

/** Singleton cache: keyed by apiKey to handle env changes across DO restarts. */
let cachedApiKey: string | null = null;
let cachedBuiltinToolsRaw: ToolSet | null = null;

function getBuiltinToolsRaw(serperApiKey: string): ToolSet {
  if (!cachedBuiltinToolsRaw || cachedApiKey !== serperApiKey) {
    cachedApiKey = serperApiKey;
    cachedBuiltinToolsRaw = {
      ...createWebSearchTool(serperApiKey),
      ...createWebReaderTool(),
      ...createDataAnalyzerTool(),
      ...createChartTemplateTool(),
      ...createMathEvalTool(),
      ...createWeatherTool(),
      ...createWikipediaTool(),
      ...createCurrencyTool(),
      ...createDictionaryTool(),
      ...createDatetimeTool(),
      ...createGithubTool()
    };
  }
  return cachedBuiltinToolsRaw;
}

const BUILTIN_TOOL_LIST: string[] = [
  `${BUILTIN_TOOL_KEY}: Search the web. Returns titles, URLs, and snippets. Use for current events, fact-checking, or up-to-date information.`,
  `${BUILTIN_WEB_READER_KEY}: Read and extract the main content from a web page URL. Returns the page title and clean markdown content.`,
  `${BUILTIN_DATA_ANALYZER_KEY}: Analyze CSV or JSON tabular data — detect column types, compute statistics, and recommend chart types with pre-built specs. Use when user provides raw data or a table.`,
  `${BUILTIN_CHART_TEMPLATE_KEY}: Get the exact format spec and example for a specific chart engine and type. Call this BEFORE generating any adc/echarts/vega-lite/mermaid code block.`,
  `${BUILTIN_MATH_EVAL_KEY}: Evaluate mathematical expressions with full precision (arithmetic, algebra, unit conversions, statistics). Use instead of mental math.`,
  `${BUILTIN_WEATHER_KEY}: Get current weather and 5-day forecast for any city worldwide. Real-time data, no API key needed.`,
  `${BUILTIN_WIKIPEDIA_KEY}: Look up encyclopedic information from Wikipedia. Supports multiple languages (en, zh, ja, etc.).`,
  `${BUILTIN_CURRENCY_KEY}: Convert between 166 currencies using real-time exchange rates.`,
  `${BUILTIN_DICTIONARY_KEY}: Look up an English word's definition, pronunciation, part of speech, examples, and synonyms.`,
  `${BUILTIN_DATETIME_KEY}: Timezone conversion, date arithmetic (add/subtract days/hours/months), and date difference. Zero latency.`,
  `${BUILTIN_GITHUB_KEY}: Look up GitHub repository info (stars, latest release/version, description) or search repos by keyword.`
];

// ============ Tool List Builder ============

/**
 * Build AI tools from built-in tools + MCP server tools.
 *
 * Built-in tools (e.g. DuckDuckGo search) are added first and take priority.
 * MCP tools are added after, with their execute functions wrapped with
 * approval/retry/state-tracking logic.
 */
export async function buildAiTools(
  mcp: ToolExecutionContext["mcp"],
  context: Omit<ToolExecutionContext, "mcp">,
  serperApiKey: string,
  emitProgress?: ProgressEmitter
): Promise<{
  tools: ToolSet;
  toolList: string[];
}> {
  // 1. Always inject built-in tools (cached singleton — recreated only if apiKey changes)
  const builtinToolsRaw = getBuiltinToolsRaw(serperApiKey);
  const toolList: string[] = [...BUILTIN_TOOL_LIST];

  // Wrap built-in tool execute with state tracking and progress emission
  const tools: ToolSet = {};
  for (const [key, builtinTool] of Object.entries(builtinToolsRaw)) {
    const originalExecute = builtinTool.execute;
    if (!originalExecute) {
      tools[key] = builtinTool;
      continue;
    }
    tools[key] = {
      ...builtinTool,
      execute: async (args: Record<string, unknown>) => {
        const runId = crypto.randomUUID();
        const runStart = new Date().toISOString();
        const baseRun: ToolRunRecord = {
          id: runId,
          toolName: key,
          serverId: "builtin",
          status: "running",
          startedAt: runStart,
          argsSnippet: safeStringify(args, 320)
        };

        context.setState(
          appendRuntimeEvent(upsertToolRunState(context.getState(), baseRun), {
            level: "info",
            source: "tool",
            type: "tool_start",
            message: `Tool ${key} started`,
            data: { toolName: key, serverId: "builtin" }
          })
        );
        emitProgress?.({
          phase: "tool",
          status: "start",
          toolName: key,
          message: `Executing built-in tool "${key}"`,
          snippet: safeStringify(args, 240)
        });

        try {
          const result = await originalExecute(args, { toolCallId: runId, messages: [], abortSignal: undefined as unknown as AbortSignal });
          const resultSnippet = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          context.setState(
            appendRuntimeEvent(upsertToolRunState(context.getState(), {
              ...baseRun,
              status: "success",
              finishedAt: new Date().toISOString(),
              resultSnippet: resultSnippet.slice(0, 480)
            }), {
              level: "success",
              source: "tool",
              type: "tool_success",
              message: `Tool ${key} completed`,
              data: { toolName: key }
            })
          );
          emitProgress?.({
            phase: "tool",
            status: "success",
            toolName: key,
            message: `Tool "${key}" completed`,
            snippet: resultSnippet.slice(0, 320)
          });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          context.setState(
            updateLastErrorState(
              appendRuntimeEvent(upsertToolRunState(context.getState(), {
                ...baseRun,
                status: "error",
                finishedAt: new Date().toISOString(),
                error: message
              }), {
                level: "error",
                source: "tool",
                type: "tool_error",
                message: `Tool ${key} failed`,
                data: { toolName: key }
              }),
              message
            )
          );
          emitProgress?.({
            phase: "tool",
            status: "error",
            toolName: key,
            message: `Tool "${key}" failed`,
            snippet: message.slice(0, 240)
          });
          return { error: message };
        }
      }
    };
  }

  // 2. Add MCP tools if available (web-search-prime serves as fallback)
  if (mcp) {
    // Ensure jsonSchema is loaded before calling getAITools() — required when
    // entering via @callable methods (e.g. chat()) which skip AIChatAgent's
    // built-in onChatMessage path that normally initializes jsonSchema.
    await mcp.ensureJsonSchema();

    const aiTools = mcp.getAITools();
    const availableTools = mcp.listTools();

    for (const item of availableTools) {
      toolList.push(`${item.name}: ${item.description || "No description"}`);
    }

    // Build a lookup: namespacedKey -> { rawName, serverId } from listTools
    const toolMeta = new Map<string, { rawName: string; serverId: string }>();
    for (const item of availableTools) {
      const dotIdx = item.name.indexOf(".");
      const rawName = dotIdx >= 0 ? item.name.slice(dotIdx + 1) : item.name;
      const serverId = dotIdx >= 0 ? item.name.slice(0, dotIdx) : item.serverId;
      const aiToolKey = `tool_${serverId.replace(/-/g, "")}_${rawName}`;
      toolMeta.set(aiToolKey, { rawName, serverId });
    }

    // Wrap each MCP tool's execute with our approval/retry/state-tracking logic
    for (const [key, aiTool] of Object.entries(aiTools)) {
      const meta = toolMeta.get(key);
      if (!meta) {
        tools[key] = aiTool;
        continue;
      }

      tools[key] = {
        ...aiTool,
        execute: async (args: Record<string, unknown>) => {
          return executeToolCallInternal(
            meta.rawName, meta.serverId, key, args,
            { ...context, mcp },
            emitProgress
          );
        }
      };
    }
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
    argsSnippet: safeStringify(normalizedArgs, 320)
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
    snippet: safeStringify(normalizedArgs, 240)
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

    // Validate serverId before calling MCP
    if (!serverId) {
      const error = `Cannot execute tool "${alias}": no serverId resolved`;
      context.setState(updateLastErrorState(upsertToolRunState(context.getState(), {
        ...baseRun,
        status: "error",
        finishedAt: new Date().toISOString(),
        error
      }), error));
      emitProgress?.({
        phase: "tool",
        status: "error",
        toolName: alias,
        message: `Tool "${alias}" has no serverId`,
        snippet: error
      });
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
          argsSnippet: safeStringify(normalizedArgs, 320)
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
        serverId: serverId,
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
