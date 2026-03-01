import { callApi } from "./apiClient";
import type {
  DeleteSessionResult,
  DeleteMessageResult,
  EditMessageResult,
  ForkSessionResult,
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

export interface ChatTransport {
  getPermissions: () => Promise<ConnectionPermissions>;
  getHistory: () => Promise<ChatHistoryItem[]>;
  getPreconfiguredServers: () => Promise<Record<string, PreconfiguredServer>>;
  deleteSession: (targetSessionId: string) => Promise<DeleteSessionResult>;
  deleteMessage: (messageId: string) => Promise<DeleteMessageResult>;
  editMessage: (messageId: string, content: string) => Promise<EditMessageResult>;
  regenerateMessage: (messageId: string) => Promise<RegenerateMessageResult>;
  forkSession: (messageId: string) => Promise<ForkSessionResult>;
  toggleServer: (name: string) => Promise<ToggleServerResult>;
  listApprovals: () => Promise<unknown[]>;
  decideApproval: (approvalId: string, decision: "approve" | "reject", reason?: string) => Promise<boolean>;
}

interface ChatTransportParams {
  agent: TransportAgentCaller;
  sessionId: string;
  readonlyMode: boolean;
}

async function withAgentFallback<T>(
  agentCall: () => Promise<T>,
  apiCall: () => Promise<T>
): Promise<T> {
  try {
    return await agentCall();
  } catch {
    return await apiCall();
  }
}

export function createChatTransport({
  agent,
  sessionId,
  readonlyMode
}: ChatTransportParams): ChatTransport {
  const encodedSessionId = encodeURIComponent(sessionId);

  return {
    async getPermissions() {
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
        }
      );
    },

    async getHistory() {
      return await withAgentFallback(
        async () => (await agent.call("getHistory", [])) as ChatHistoryItem[],
        async () => {
          const response = await callApi<{ history: ChatHistoryItem[] }>(
            `/api/chat/history?sessionId=${encodedSessionId}`
          );
          return Array.isArray(response.history) ? response.history : [];
        }
      );
    },

    async getPreconfiguredServers() {
      return await withAgentFallback(
        async () =>
          (await agent.call("getPreconfiguredServers", [])) as Record<string, PreconfiguredServer>,
        async () => {
          const response = await callApi<{ servers: Record<string, PreconfiguredServer> }>(
            `/api/mcp/servers?sessionId=${encodedSessionId}`
          );
          return response.servers;
        }
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
      return await withAgentFallback(
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
        }
      );
    },

    async editMessage(messageId: string, content: string) {
      return await withAgentFallback(
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
        }
      );
    },

    async regenerateMessage(messageId: string) {
      return await withAgentFallback(
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
        }
      );
    },

    async forkSession(messageId: string) {
      return await withAgentFallback(
        async () => (await agent.call("forkSession", [messageId])) as ForkSessionResult,
        async () => {
          const response = await callApi<ForkSessionResult>("/api/chat/fork", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId,
              messageId
            })
          });
          return {
            success: response.success,
            newSessionId: response.newSessionId,
            error: response.error
          } as ForkSessionResult;
        }
      );
    },

    async toggleServer(name: string) {
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
        }
      );
    },

    async listApprovals() {
      return await withAgentFallback(
        async () => (await agent.call("listToolApprovals", [])) as unknown[],
        async () => {
          const response = await callApi<{ approvals: unknown[] }>(
            `/api/runtime/approvals?sessionId=${encodedSessionId}`
          );
          return Array.isArray(response.approvals) ? response.approvals : [];
        }
      );
    },

    async decideApproval(approvalId: string, decision: "approve" | "reject", reason?: string) {
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
          const response = await callApi<{ stateVersion: number }>("/api/runtime/approvals/decision", {
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
        }
      );
    }
  };
}
