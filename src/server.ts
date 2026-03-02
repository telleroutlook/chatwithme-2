import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { routeAgentRequest, getAgentByName } from "agents";
import {
  chatBodySchema,
  chatHistoryQuerySchema,
  chatSessionsQuerySchema,
  deleteSessionQuerySchema,
  deleteMessageQuerySchema,
  editBodySchema,
  forkBodySchema,
  mcpServerBodySchema,
  regenerateBodySchema,
  toolApprovalDecisionBodySchema
} from "./schema/api";
import { errorJson, successJson, unknownErrorMessage } from "./server/http";
import { ChatAgentV2 } from "./demos/chat/chat-agent";

export { ChatAgentV2 };

// ============ Authentication Middleware ============

/**
 * Authentication result from middleware
 */
interface AuthResult {
  userId: string;
}

/**
 * Validate simple token format.
 * Token should be a UUID format string.
 * Returns user ID derived from token, or "anonymous" if invalid.
 */
function validateSimpleToken(token: string): string {
  // UUID format validation
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    // Derive a stable user ID from token
    return `user-${token.slice(0, 8)}`;
  }
  return "anonymous";
}

/**
 * Extract authentication info from request.
 * Checks: 1) Authorization header, 2) URL query param, 3) Cookie
 */
function authMiddleware(request: Request): AuthResult {
  const url = new URL(request.url);

  // 1. Try Authorization header (Bearer token)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const userId = validateSimpleToken(token);
    if (userId !== "anonymous") {
      return { userId };
    }
  }

  // 2. Try URL query parameter (for WebSocket connections)
  const tokenParam = url.searchParams.get("token");
  if (tokenParam) {
    const userId = validateSimpleToken(tokenParam);
    if (userId !== "anonymous") {
      return { userId };
    }
  }

  // 3. Try Cookie
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    const match = cookie.match(/auth_token=([^;]+)/);
    if (match?.[1]) {
      const userId = validateSimpleToken(match[1]);
      if (userId !== "anonymous") {
        return { userId };
      }
    }
  }

  // Default to anonymous user
  return { userId: "anonymous" };
}

/**
 * Parse composite agent name into userId and sessionId.
 * Format: "userId:sessionId" or legacy "sessionId"
 */
export function parseAgentName(fullName: string): { userId: string; sessionId: string } {
  const parts = fullName.split(":");
  if (parts.length === 2) {
    return { userId: parts[0], sessionId: parts[1] };
  }
  // Backward compatibility: treat as legacy sessionId
  return { userId: "legacy", sessionId: fullName };
}

/**
 * Build composite agent name from userId and sessionId.
 * Format: "userId:sessionId"
 */
export function buildAgentName(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

type ServerVariables = {
  requestId: string;
};

const app = new Hono<{ Bindings: Env; Variables: ServerVariables }>();

app.use("*", cors());
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") || crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("x-request-id", requestId);
});

function resolveSessionId(input: { sessionId: string }): string {
  return input.sessionId.trim();
}

function parseSessionIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 120);
  return ids.filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id));
}

const validateJson = (schema: z.ZodTypeAny) =>
  zValidator("json", schema, (result, c) => {
    if (result.success) return;
    return errorJson(c, 400, "VALIDATION_ERROR", result.error.message);
  });

const validateQuery = (schema: z.ZodTypeAny) =>
  zValidator("query", schema, (result, c) => {
    if (result.success) return;
    return errorJson(c, 400, "VALIDATION_ERROR", result.error.message);
  });

app.post("/api/chat", validateJson(chatBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof chatBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const response = await agent.chat(body.message);

    return successJson(c, {
      response,
      sessionId,
      traceId: c.get("requestId")
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_GENERATION_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/chat/history", validateQuery(chatHistoryQuerySchema), async (c) => {
  const start = Date.now();
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);

    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const history = await agent.getHistory();

    return successJson(c, {
      history,
      sessionId,
      traceId: c.get("requestId"),
      tookMs: Date.now() - start
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_HISTORY_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/chat/sessions", validateQuery(chatSessionsQuerySchema), async (c) => {
  const start = Date.now();
  try {
    const query = c.req.valid("query") as z.infer<typeof chatSessionsQuerySchema>;
    const requestedSessionIds = parseSessionIds(query.sessionIds);
    const { userId } = authMiddleware(c.req.raw);

    const sessions = await Promise.all(
      requestedSessionIds.map(async (sessionId) => {
        try {
          const agentName = buildAgentName(userId, sessionId);
          const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
          const history = await agent.getHistory();
          const normalized = Array.isArray(history) ? history : [];
          const last = normalized[normalized.length - 1];
          const now = new Date().toISOString();
          return {
            sessionId,
            title:
              normalized.find((item) => item.role === "user")?.content?.slice(0, 30) ||
              "New Chat",
            lastMessage: last?.content?.slice(0, 200) || "",
            messageCount: normalized.length,
            updatedAt: now,
            health: normalized.length > 0 ? ("healthy" as const) : ("stale" as const)
          };
        } catch (error) {
          console.error("[chat_sessions_item_failed]", {
            sessionId,
            requestId: c.get("requestId"),
            error: unknownErrorMessage(error)
          });
          return {
            sessionId,
            title: "New Chat",
            lastMessage: "",
            messageCount: 0,
            updatedAt: new Date().toISOString(),
            health: "stale" as const
          };
        }
      })
    );

    return successJson(c, {
      sessions,
      traceId: c.get("requestId"),
      tookMs: Date.now() - start
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_SESSIONS_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/chat/permissions", validateQuery(chatHistoryQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const mode = c.req.query("mode");
    const readonly = mode === "view";

    return successJson(c, {
      canEdit: !readonly,
      readonly,
      sessionId,
      userId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_PERMISSIONS_FAILED", unknownErrorMessage(error));
  }
});

app.delete("/api/chat/history", validateQuery(chatHistoryQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);

    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.clearChat();
    if (!result?.success) {
      return errorJson(c, 500, "CHAT_CLEAR_FAILED", "Failed to clear chat history");
    }

    return successJson(c, {
      message: "Chat history cleared",
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_CLEAR_FAILED", unknownErrorMessage(error));
  }
});

app.delete("/api/chat/session", validateQuery(deleteSessionQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof deleteSessionQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);

    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.deleteSession();
    if (!result?.success) {
      return errorJson(c, 500, "CHAT_DELETE_SESSION_FAILED", result?.error || "Failed to delete session");
    }

    return successJson(c, {
      destroyed: result.destroyed,
      pendingDestroy: result.pendingDestroy,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_DELETE_SESSION_FAILED", unknownErrorMessage(error));
  }
});

app.delete("/api/chat/message", validateQuery(deleteMessageQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof deleteMessageQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.deleteMessage(query.messageId);

    if (!result.success) {
      return errorJson(c, 400, "CHAT_DELETE_MESSAGE_FAILED", result.error || "Delete failed");
    }

    return successJson(c, {
      deleted: result.deleted,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_DELETE_MESSAGE_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/chat/edit", validateJson(editBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof editBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.editUserMessage(body.messageId, body.content);

    if (!result.success) {
      return errorJson(c, 400, "CHAT_EDIT_MESSAGE_FAILED", result.error || "Edit failed");
    }

    return successJson(c, {
      updated: result.updated,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_EDIT_MESSAGE_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/chat/regenerate", validateJson(regenerateBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof regenerateBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.regenerateFrom(body.messageId);

    if (!result.success) {
      return errorJson(c, 400, "CHAT_REGENERATE_FAILED", result.error || "Regenerate failed");
    }

    return successJson(c, {
      response: result.response,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_REGENERATE_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/chat/fork", validateJson(forkBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof forkBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.forkSession(body.messageId);

    if (!result.success || !result.newSessionId) {
      return errorJson(c, 400, "CHAT_FORK_FAILED", result.error || "Fork failed");
    }

    return successJson(c, {
      newSessionId: result.newSessionId,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "CHAT_FORK_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/mcp/servers", validateQuery(chatHistoryQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const servers = await agent.getPreconfiguredServers();

    return successJson(c, {
      servers,
      sessionId,
      stateVersion: (await agent.getRuntimeSnapshot()).stateVersion
    });
  } catch (error) {
    return errorJson(c, 500, "MCP_SERVERS_LIST_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/mcp/toggle", validateJson(mcpServerBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof mcpServerBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.toggleServer(body.name);

    if (!result.success) {
      return errorJson(c, 400, "MCP_SERVER_TOGGLE_FAILED", result.error || "Toggle failed");
    }

    return successJson(c, {
      active: result.active,
      sessionId,
      stateVersion: result.stateVersion
    });
  } catch (error) {
    return errorJson(c, 500, "MCP_SERVER_TOGGLE_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/mcp/activate", validateJson(mcpServerBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof mcpServerBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.activateServer(body.name);

    if (!result.success) {
      return errorJson(c, 400, "MCP_SERVER_ACTIVATE_FAILED", result.error || "Activate failed");
    }

    return successJson(c, {
      sessionId,
      stateVersion: result.stateVersion
    });
  } catch (error) {
    return errorJson(c, 500, "MCP_SERVER_ACTIVATE_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/mcp/deactivate", validateJson(mcpServerBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof mcpServerBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const result = await agent.deactivateServer(body.name);

    if (!result.success) {
      return errorJson(c, 400, "MCP_SERVER_DEACTIVATE_FAILED", "Deactivate failed");
    }

    return successJson(c, {
      sessionId,
      stateVersion: result.stateVersion
    });
  } catch (error) {
    return errorJson(c, 500, "MCP_SERVER_DEACTIVATE_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/tools", validateQuery(chatHistoryQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const tools = await agent.getAvailableTools();

    return successJson(c, {
      tools,
      count: tools.length,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "MCP_TOOLS_LIST_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/runtime/snapshot", validateQuery(chatHistoryQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const snapshot = await agent.getRuntimeSnapshot();

    return successJson(c, {
      ...snapshot,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "RUNTIME_SNAPSHOT_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/runtime/approvals", validateQuery(chatHistoryQuerySchema), async (c) => {
  try {
    const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
    const sessionId = resolveSessionId(query);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
    const approvals = await agent.listToolApprovals();

    return successJson(c, {
      approvals,
      sessionId
    });
  } catch (error) {
    return errorJson(c, 500, "RUNTIME_APPROVALS_FAILED", unknownErrorMessage(error));
  }
});

app.post("/api/runtime/approvals/decision", validateJson(toolApprovalDecisionBodySchema), async (c) => {
  try {
    const body = c.req.valid("json") as z.infer<typeof toolApprovalDecisionBodySchema>;
    const sessionId = resolveSessionId(body);
    const { userId } = authMiddleware(c.req.raw);
    const agentName = buildAgentName(userId, sessionId);
    const agent = await getAgentByName(c.env.ChatAgentV2, agentName);

    const result =
      body.decision === "approve"
        ? await agent.approveToolCall(body.approvalId)
        : await agent.rejectToolCall(body.approvalId, body.reason);

    if (!result.success) {
      return errorJson(
        c,
        400,
        "RUNTIME_APPROVAL_DECISION_FAILED",
        result.error || "Approval decision failed"
      );
    }

    return successJson(c, {
      sessionId,
      stateVersion: result.stateVersion
    });
  } catch (error) {
    return errorJson(c, 500, "RUNTIME_APPROVAL_DECISION_FAILED", unknownErrorMessage(error));
  }
});

app.get("/api/health", (c) => {
  return successJson(c, {
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

app.all("/agents/*", async (c) => {
  const response = await routeAgentRequest(c.req.raw, c.env, { cors: true });
  return response || c.notFound();
});

app.onError((error, c) => {
  return errorJson(c, 500, "UNHANDLED_ERROR", unknownErrorMessage(error));
});

export default app;
