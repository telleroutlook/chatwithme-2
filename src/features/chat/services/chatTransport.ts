import { callApi } from "./apiClient";
import type {
  DeleteSessionResult,
  DeleteMessageResult,
  EditMessageResult,
  RegenerateMessageResult,
  ToggleServerResult
} from "./apiContracts";

export interface TransportAgentCaller {
  call: (method: string, args: unknown[]) => Promise<unknown>;
}

export interface PreconfiguredServer {
  config: {
    name: string;
    url: string;
    description: string;
  };
  serverId?: string;
  connected: boolean;
  error?: string;
}

export interface ConnectionPermissions {
  canEdit: boolean;
  readonly: boolean;
}

export interface ChatHistoryItem {
  role: string;
  content: string;
  id?: string;
}

export interface ChatSessionSummary {
  sessionId: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  updatedAt: string;
  health: "healthy" | "stale" | "orphaned";
}

export interface ChatTransport {
  getPermissions: () => Promise<ConnectionPermissions>;
  getHistory: () => Promise<ChatHistoryItem[]>;
  getSessions: (sessionIds: string[]) => Promise<ChatSessionSummary[]>;
  getPreconfiguredServers: () => Promise<Record<string, PreconfiguredServer>>;
  deleteSession: (targetSessionId: string) => Promise<DeleteSessionResult>;
  deleteMessage: (messageId: string) => Promise<DeleteMessageResult>;
  editMessage: (messageId: string, content: string) => Promise<EditMessageResult>;
  regenerateMessage: (messageId: string) => Promise<RegenerateMessageResult>;
  toggleServer: (name: string) => Promise<ToggleServerResult>;
  listApprovals: () => Promise<unknown[]>;
  decideApproval: (approvalId: string, decision: "approve" | "reject", reason?: string) => Promise<boolean>;
}

interface ChatTransportParams {
  agent: TransportAgentCaller;
  sessionId: string;
  readonlyMode: boolean;
}

/**
 * Log fallback event for observability
 */
function logFallbackEvent(
  requestId: string,
  sessionId: string,
  method: string,
  agentError: unknown
): void {
  const event = {
    event: "agent_fallback_triggered",
    requestId,
    sessionId,
    method,
    agentError: agentError instanceof Error ? agentError.message : String(agentError),
    timestamp: new Date().toISOString(),
  };
  // Use console.info for structured logging (can be captured by log aggregation)
  console.info(JSON.stringify(event));
}

async function withAgentFallback<T>(
  agentCall: () => Promise<T>,
  apiCall: () => Promise<T>,
  context?: { requestId?: string; sessionId?: string; method?: string }
): Promise<T> {
  try {
    return await agentCall();
  } catch (error) {
    // Log fallback event for observability
    if (context?.requestId && context?.sessionId && context?.method) {
      logFallbackEvent(context.requestId, context.sessionId, context.method, error);
    }
    return await apiCall();
  }
}

/**
 * Generate a simple unique request ID for client-side tracking
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createChatTransport({
  agent,
  sessionId,
  readonlyMode
}: ChatTransportParams): ChatTransport {
  const encodedSessionId = encodeURIComponent(sessionId);
  let historyInFlight: Promise<ChatHistoryItem[]> | null = null;
  let historyCache: { at: number; value: ChatHistoryItem[] } | null = null;
  const invalidateHistoryCache = () => {
    historyCache = null;
    historyInFlight = null;
  };

  return {
    async getPermissions() {
      const requestId = generateRequestId();
      return await withAgentFallback(
        async () => (await agent.call("getPermissions", [])) as ConnectionPermissions,
        async () => {
          const response = await callApi<ConnectionPermissions>(
            `/api/chat/permissions?sessionId=${encodedSessionId}${readonlyMode ? "&mode=view" : ""}`
          );
          return {
            canEdit: Boolean(response.canEdit),
            readonly: Boolean(response.readonly)
          };
        },
        { requestId, sessionId, method: "getPermissions" }
      );
    },

    async getHistory() {
      if (historyCache && Date.now() - historyCache.at < 2000) {
        return historyCache.value;
      }
      if (historyInFlight) {
        return await historyInFlight;
      }
      const requestId = generateRequestId();
      historyInFlight = withAgentFallback(
        async () => (await agent.call("getHistory", [])) as ChatHistoryItem[],
        async () => {
          const response = await callApi<{ history: ChatHistoryItem[] }>(
            `/api/chat/history?sessionId=${encodedSessionId}`
          );
          return Array.isArray(response.history) ? response.history : [];
        },
        { requestId, sessionId, method: "getHistory" }
      );
      try {
        const history = await historyInFlight;
        historyCache = {
          at: Date.now(),
          value: history
        };
        return history;
      } finally {
        historyInFlight = null;
      }
    },

    async getSessions(sessionIds: string[]) {
      const deduped = Array.from(new Set(sessionIds.map((item) => item.trim()).filter(Boolean)));
      if (deduped.length === 0) return [];
      const response = await callApi<{ sessions: ChatSessionSummary[] }>(
        `/api/chat/sessions?sessionIds=${encodeURIComponent(deduped.join(","))}`
      );
      return Array.isArray(response.sessions) ? response.sessions : [];
    },

    async getPreconfiguredServers() {
      const requestId = generateRequestId();
      return await withAgentFallback(
        async () =>
          (await agent.call("getPreconfiguredServers", [])) as Record<string, PreconfiguredServer>,
        async () => {
          const response = await callApi<{ servers: Record<string, PreconfiguredServer> }>(
            `/api/mcp/servers?sessionId=${encodedSessionId}`
          );
          return response.servers;
        },
        { requestId, sessionId, method: "getPreconfiguredServers" }
      );
    },

    async deleteSession(targetSessionId: string) {
      const normalizedSessionId = targetSessionId.trim();
      if (!normalizedSessionId) {
        throw new Error("Session ID is required");
      }

      const encodedTargetSessionId = encodeURIComponent(normalizedSessionId);
      // Always delete via REST with explicit sessionId to avoid websocket identity drift.
      const response = await callApi<DeleteSessionResult & { sessionId: string }>(
        `/api/chat/session?sessionId=${encodedTargetSessionId}`,
        {
          method: "DELETE"
        }
      );
      return {
        success: response.success,
        destroyed: response.destroyed,
        pendingDestroy: response.pendingDestroy,
        error: response.error
      } as DeleteSessionResult;
    },

    async deleteMessage(messageId: string) {
      const requestId = generateRequestId();
      const result = await withAgentFallback(
        async () => (await agent.call("deleteMessage", [messageId])) as DeleteMessageResult,
        async () => {
          const response = await callApi<DeleteMessageResult>(
            `/api/chat/message?sessionId=${encodedSessionId}&messageId=${encodeURIComponent(messageId)}`,
            {
              method: "DELETE"
            }
          );
          return {
            success: response.success,
            deleted: response.deleted,
            error: response.error
          } as DeleteMessageResult;
        },
        { requestId, sessionId, method: "deleteMessage" }
      );
      if (result.success && result.deleted) {
        invalidateHistoryCache();
      }
      return result;
    },

    async editMessage(messageId: string, content: string) {
      const requestId = generateRequestId();
      const result = await withAgentFallback(
        async () => (await agent.call("editUserMessage", [messageId, content])) as EditMessageResult,
        async () => {
          const response = await callApi<EditMessageResult>("/api/chat/edit", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId,
              messageId,
              content
            })
          });
          return {
            success: response.success,
            updated: response.updated,
            error: response.error
          } as EditMessageResult;
        },
        { requestId, sessionId, method: "editMessage" }
      );
      if (result.success && result.updated) {
        invalidateHistoryCache();
      }
      return result;
    },

    async regenerateMessage(messageId: string) {
      const requestId = generateRequestId();
      const result = await withAgentFallback(
        async () => (await agent.call("regenerateFrom", [messageId])) as RegenerateMessageResult,
        async () => {
          const response = await callApi<RegenerateMessageResult>("/api/chat/regenerate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId,
              messageId
            })
          });
          return {
            success: response.success,
            response: response.response,
            error: response.error
          } as RegenerateMessageResult;
        },
        { requestId, sessionId, method: "regenerateMessage" }
      );
      if (result.success) {
        invalidateHistoryCache();
      }
      return result;
    },

    async toggleServer(name: string) {
      const requestId = generateRequestId();
      return await withAgentFallback(
        async () => (await agent.call("toggleServer", [name])) as ToggleServerResult,
        async () => {
          const response = await callApi<ToggleServerResult>("/api/mcp/toggle", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId,
              name
            })
          });
          return {
            success: response.success,
            active: response.active,
            error: response.error,
            stateVersion: response.stateVersion
          } as ToggleServerResult;
        },
        { requestId, sessionId, method: "toggleServer" }
      );
    },

    async listApprovals() {
      const requestId = generateRequestId();
      return await withAgentFallback(
        async () => (await agent.call("listToolApprovals", [])) as unknown[],
        async () => {
          const response = await callApi<{ approvals: unknown[] }>(
            `/api/runtime/approvals?sessionId=${encodedSessionId}`
          );
          return Array.isArray(response.approvals) ? response.approvals : [];
        },
        { requestId, sessionId, method: "listApprovals" }
      );
    },

    async decideApproval(approvalId: string, decision: "approve" | "reject", reason?: string) {
      const requestId = generateRequestId();
      return await withAgentFallback(
        async () => {
          const result =
            decision === "approve"
              ? await agent.call("approveToolCall", [approvalId])
              : await agent.call("rejectToolCall", [approvalId, reason]);
          if (!result || typeof result !== "object") return false;
          const candidate = result as { success?: unknown };
          return candidate.success === true;
        },
        async () => {
          const response = await callApi<{ stateVersion: number; success: boolean }>("/api/runtime/approvals/decision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId,
              approvalId,
              decision,
              ...(reason ? { reason } : {})
            })
          });
          return response.success === true;
        },
        { requestId, sessionId, method: "decideApproval" }
      );
    }
  };
}
