/**
 * MCP Server management runtime module for ChatAgent
 *
 * Handles:
 * - Server activation/deactivation logic
 * - Server connection state management
 * - Server configuration building
 */

import type { McpServerConfig } from "../../../mcp-config";
import { getApiKey } from "../../../mcp-config";
import { isRetryableMcpConnectionError } from "./tool-runtime";
import type { ChatAgentState, McpServerConnectionState } from "./state-runtime";

// ============ Types ============

export interface McpServerContext {
  state: ChatAgentState;
  runtimeEnv: Env;
  mcp: {
    listTools: () => Array<{ name: string; description?: string; serverId: string }>;
  } | null;
  addMcpServer: (name: string, url: string, options?: {
    callbackHost?: string;
    transport?: { type?: "streamable-http"; headers?: HeadersInit };
  }) => Promise<{ id: string }>;
  removeMcpServer: (serverId: string) => Promise<void>;
  retry: <T>(fn: (attempt: number) => Promise<T>, options: {
    maxAttempts: number;
    shouldRetry: (error: unknown) => boolean;
  }) => Promise<T>;
  getToolMaxAttempts: () => number;
  updateRetryStats: (kind: "tool" | "mcpConnection", mutation: (stats: {
    attempts: number;
    success: number;
    exhausted: number;
  }) => { attempts: number; success: number; exhausted: number }) => void;
  setServerConnectionState: (name: string, next: Partial<{
    serverId?: string;
    connected: boolean;
    error?: string;
  }>) => void;
  updateLastError: (message: string) => void;
  appendRuntimeEvent: (event: {
    level: "info" | "success" | "error";
    source: "chat" | "mcp" | "tool" | "system";
    type: string;
    message: string;
    data?: Record<string, unknown>;
  }) => void;
}

// ============ Server Activation ============

/**
 * Activate an MCP server
 */
export async function activateMcpServer(
  name: string,
  context: McpServerContext
): Promise<{ success: boolean; error?: string; stateVersion: number; result?: { id: string } }> {
  const serverEntry = context.state.mcp.preconfiguredServers[name];
  if (!serverEntry) {
    return {
      success: false,
      error: `Server "${name}" not found`,
      stateVersion: context.state.runtime.stateVersion
    };
  }

  const config = serverEntry.config;
  const apiKey = getApiKey(config, context.runtimeEnv);

  try {
    const options: {
      callbackHost?: string;
      transport?: { type?: "streamable-http"; headers?: HeadersInit };
    } = {};

    if (context.runtimeEnv.HOST) {
      options.callbackHost = context.runtimeEnv.HOST;
    }

    if (apiKey) {
      options.transport = {
        type: "streamable-http",
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      };
    }

    const result = await context.retry(
      async () => {
        context.updateRetryStats("mcpConnection", (stats) => ({
          ...stats,
          attempts: stats.attempts + 1
        }));
        return await context.addMcpServer(name, config.url, options);
      },
      {
        maxAttempts: context.getToolMaxAttempts(),
        shouldRetry: (error) => isRetryableMcpConnectionError(error)
      }
    );
    context.updateRetryStats("mcpConnection", (stats) => ({
      ...stats,
      success: stats.success + 1
    }));
    context.setServerConnectionState(name, {
      serverId: result.id,
      connected: true,
      error: undefined
    });
    context.appendRuntimeEvent({
      level: "success",
      source: "mcp",
      type: "activate_server",
      message: `MCP server ${name} activated.`,
      data: { serverId: result.id }
    });

    return { success: true, stateVersion: context.state.runtime.stateVersion, result };
  } catch (error) {
    context.updateRetryStats("mcpConnection", (stats) => ({
      ...stats,
      exhausted: stats.exhausted + 1
    }));
    const message = error instanceof Error ? error.message : String(error);
    context.setServerConnectionState(name, {
      connected: false,
      error: message
    });
    context.updateLastError(message);
    context.appendRuntimeEvent({
      level: "error",
      source: "mcp",
      type: "activate_server_error",
      message: `MCP server ${name} activation failed.`,
      data: { error: message }
    });
    return { success: false, error: message, stateVersion: context.state.runtime.stateVersion };
  }
}

/**
 * Deactivate an MCP server
 */
export async function deactivateMcpServer(
  name: string,
  context: McpServerContext
): Promise<{ success: boolean; stateVersion: number }> {
  const serverEntry = context.state.mcp.preconfiguredServers[name];
  if (!serverEntry || !serverEntry.serverId) {
    return { success: false, stateVersion: context.state.runtime.stateVersion };
  }

  try {
    await context.retry(
      async () => {
        context.updateRetryStats("mcpConnection", (stats) => ({
          ...stats,
          attempts: stats.attempts + 1
        }));
        return await context.removeMcpServer(serverEntry.serverId as string);
      },
      {
        maxAttempts: context.getToolMaxAttempts(),
        shouldRetry: (error) => isRetryableMcpConnectionError(error)
      }
    );
    context.updateRetryStats("mcpConnection", (stats) => ({
      ...stats,
      success: stats.success + 1
    }));
    context.setServerConnectionState(name, {
      serverId: undefined,
      connected: false,
      error: undefined
    });
    context.appendRuntimeEvent({
      level: "info",
      source: "mcp",
      type: "deactivate_server",
      message: `MCP server ${name} deactivated.`,
      data: { serverId: serverEntry.serverId }
    });
    return { success: true, stateVersion: context.state.runtime.stateVersion };
  } catch (error) {
    context.updateRetryStats("mcpConnection", (stats) => ({
      ...stats,
      exhausted: stats.exhausted + 1
    }));
    console.error(`Failed to deactivate server ${name}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    context.updateLastError(message);
    context.appendRuntimeEvent({
      level: "error",
      source: "mcp",
      type: "deactivate_server_error",
      message: `MCP server ${name} deactivation failed.`,
      data: { error: message }
    });
    return { success: false, stateVersion: context.state.runtime.stateVersion };
  }
}

/**
 * Toggle an MCP server on/off
 */
export async function toggleMcpServer(
  name: string,
  context: McpServerContext
): Promise<{ success: boolean; active?: boolean; error?: string; stateVersion: number }> {
  const serverEntry = context.state.mcp.preconfiguredServers[name];
  if (!serverEntry) {
    return {
      success: false,
      error: `Server "${name}" not found`,
      stateVersion: context.state.runtime.stateVersion
    };
  }

  if (serverEntry.connected) {
    const result = await deactivateMcpServer(name, context);
    return { ...result, active: false };
  } else {
    const result = await activateMcpServer(name, context);
    return { ...result, active: result.success };
  }
}

/**
 * Get available MCP tools
 */
export async function getMcpTools(
  context: Pick<McpServerContext, "mcp" | "updateLastError">
): Promise<Array<{ name: string; description?: string; serverId: string }>> {
  try {
    if (!context.mcp) {
      return [];
    }
    return context.mcp.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      serverId: tool.name.includes(".") ? tool.name.split(".")[0] : tool.serverId
    }));
  } catch (error) {
    console.error("Failed to get MCP tools:", error);
    context.updateLastError(error instanceof Error ? error.message : String(error));
    return [];
  }
}
