/**
 * State runtime module for ChatAgent
 *
 * Handles:
 * - Runtime events management
 * - State version increments
 * - Retry stats tracking
 * - Snapshot generation
 */

import type { McpServerConfig } from "../../../mcp-config";

// ============ Types ============

export interface McpServerConnectionState {
  preconfiguredServers: Record<
    string,
    {
      config: McpServerConfig;
      serverId?: string;
      connected: boolean;
      error?: string;
    }
  >;
}

export interface ToolRunRecord {
  id: string;
  toolName: string;
  serverId?: string;
  status: "running" | "success" | "error" | "blocked";
  startedAt: string;
  finishedAt?: string;
  argsSnippet?: string;
  resultSnippet?: string;
  error?: string;
}

export interface AgentRuntimeEvent {
  id: string;
  level: "info" | "success" | "error";
  source: "chat" | "mcp" | "tool" | "system";
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface RetryStats {
  tool: {
    attempts: number;
    success: number;
    exhausted: number;
  };
  mcpConnection: {
    attempts: number;
    success: number;
    exhausted: number;
  };
}

export interface ToolApprovalRequest {
  id: string;
  signature: string;
  toolName: string;
  serverId?: string;
  argsSnippet: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string;
  reason?: string;
}

export interface ChatAgentState {
  mcp: McpServerConnectionState;
  runtime: {
    toolRuns: ToolRunRecord[];
    lastError?: string;
    events: AgentRuntimeEvent[];
    approvals: ToolApprovalRequest[];
    approvedSignatures: Array<{ signature: string; expiresAt: string }>;
    retryStats: RetryStats;
    stateVersion: number;
  };
}

export type ProgressPhase = "context" | "model" | "thinking" | "tool" | "heartbeat" | "result" | "error";

export interface LiveProgressEvent {
  phase: ProgressPhase;
  message: string;
  status?: "start" | "success" | "error" | "info";
  toolName?: string;
  snippet?: string;
}

export type ProgressEmitter = (event: LiveProgressEvent) => void;

// ============ State Helpers ============

/**
 * Create initial runtime state
 */
export function createInitialRuntimeState(): ChatAgentState["runtime"] {
  return {
    toolRuns: [],
    events: [],
    approvals: [],
    approvedSignatures: [],
    retryStats: {
      tool: { attempts: 0, success: 0, exhausted: 0 },
      mcpConnection: { attempts: 0, success: 0, exhausted: 0 }
    },
    stateVersion: 0
  };
}

/**
 * Append a runtime event and return updated state
 */
export function appendRuntimeEvent(
  state: ChatAgentState,
  event: Omit<AgentRuntimeEvent, "id" | "timestamp">
): ChatAgentState {
  const runtimeEvent: AgentRuntimeEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event
  };
  const nextEvents = [...state.runtime.events, runtimeEvent].slice(-120);
  return {
    ...state,
    runtime: {
      ...state.runtime,
      events: nextEvents,
      stateVersion: state.runtime.stateVersion + 1
    }
  };
}

/**
 * Update last error in state
 */
export function updateLastErrorState(
  state: ChatAgentState,
  message?: string
): ChatAgentState {
  if (!message) return state;
  return {
    ...state,
    runtime: {
      ...state.runtime,
      lastError: message,
      stateVersion: state.runtime.stateVersion + 1
    }
  };
}

/**
 * Update retry stats
 */
export function updateRetryStatsState(
  state: ChatAgentState,
  kind: "tool" | "mcpConnection",
  mutation: (target: RetryStats["tool"]) => RetryStats["tool"]
): ChatAgentState {
  const nextStats = {
    ...state.runtime.retryStats,
    [kind]: mutation(state.runtime.retryStats[kind])
  };
  return {
    ...state,
    runtime: {
      ...state.runtime,
      retryStats: nextStats,
      stateVersion: state.runtime.stateVersion + 1
    }
  };
}

/**
 * Upsert a tool run record
 */
export function upsertToolRunState(
  state: ChatAgentState,
  run: ToolRunRecord
): ChatAgentState {
  const withoutCurrent = state.runtime.toolRuns.filter((item) => item.id !== run.id);
  const nextRuns = [...withoutCurrent, run].slice(-80);
  return {
    ...state,
    runtime: {
      ...state.runtime,
      toolRuns: nextRuns,
      stateVersion: state.runtime.stateVersion + 1
    }
  };
}

/**
 * Update MCP server connection state
 */
export function setServerConnectionState(
  state: ChatAgentState,
  name: string,
  next: Partial<{
    serverId?: string;
    connected: boolean;
    error?: string;
  }>
): ChatAgentState {
  const current = state.mcp.preconfiguredServers[name];
  if (!current) return state;
  return {
    ...state,
    mcp: {
      preconfiguredServers: {
        ...state.mcp.preconfiguredServers,
        [name]: {
          ...current,
          ...next
        }
      }
    },
    runtime: {
      ...state.runtime,
      stateVersion: state.runtime.stateVersion + 1
    }
  };
}

/**
 * Get runtime snapshot
 */
export function getRuntimeSnapshot(state: ChatAgentState): {
  toolRuns: ToolRunRecord[];
  lastError?: string;
  events: AgentRuntimeEvent[];
  approvals: ToolApprovalRequest[];
  retryStats: RetryStats;
  stateVersion: number;
} {
  return {
    toolRuns: state.runtime.toolRuns,
    lastError: state.runtime.lastError,
    events: state.runtime.events,
    approvals: state.runtime.approvals,
    retryStats: state.runtime.retryStats,
    stateVersion: state.runtime.stateVersion
  };
}
