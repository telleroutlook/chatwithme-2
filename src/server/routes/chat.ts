/**
 * Chat API routes with authentication context.
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { getAgentByName } from "agents";
import {
  chatBodySchema,
  chatHistoryQuerySchema,
  chatSessionsQuerySchema,
  deleteSessionQuerySchema,
  deleteMessageQuerySchema,
  editBodySchema,
  regenerateBodySchema
} from "../../schema/api";
import { errorJson, successJson, unknownErrorMessage } from "../http";
import { resolveAuthContext, buildAgentName, logAuthContext, type AuthContext } from "../auth";
import { resolveSessionId, parseSessionIds, validateJson, validateQuery } from "../validators";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

/**
 * Helper to build response with auth context info.
 */
function buildResponse<T>(
  c: Context,
  data: T,
  authCtx: AuthContext
): T & { traceId: string; authMode: "guest" | "authenticated" } {
  const requestId = c.get("requestId");
  return {
    ...data,
    traceId: typeof requestId === "string" ? requestId : "",
    authMode: authCtx.authMode,
  };
}

export function registerChatRoutes(app: Hono<AppBindings>): void {
  app.post("/api/chat", validateJson(chatBodySchema), async (c) => {
    try {
      const body = c.req.valid("json") as z.infer<typeof chatBodySchema>;
      const sessionId = resolveSessionId(body);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      // Log auth context for observability
      logAuthContext(c.get("requestId"), authCtx, "/api/chat");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const response = await agent.chat(body.message);

      return successJson(c, buildResponse(c, { response, sessionId }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_GENERATION_FAILED", unknownErrorMessage(error));
    }
  });

  app.get("/api/chat/history", validateQuery(chatHistoryQuerySchema), async (c) => {
    const start = Date.now();
    try {
      const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
      const sessionId = resolveSessionId(query);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/history");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const history = await agent.getHistory();

      return successJson(c, buildResponse(c, {
        history,
        sessionId,
        tookMs: Date.now() - start
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_HISTORY_FAILED", unknownErrorMessage(error));
    }
  });

  app.get("/api/chat/sessions", validateQuery(chatSessionsQuerySchema), async (c) => {
    const start = Date.now();
    try {
      const query = c.req.valid("query") as z.infer<typeof chatSessionsQuerySchema>;
      const requestedSessionIds = parseSessionIds(query.sessionIds);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/sessions");

      const sessions = await Promise.all(
        requestedSessionIds.map(async (sessionId) => {
          try {
            const agentName = buildAgentName(authCtx.userId, sessionId);
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
              authMode: authCtx.authMode,
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

      return successJson(c, buildResponse(c, {
        sessions,
        tookMs: Date.now() - start
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_SESSIONS_FAILED", unknownErrorMessage(error));
    }
  });

  app.get("/api/chat/permissions", validateQuery(chatHistoryQuerySchema), async (c) => {
    try {
      const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
      const sessionId = resolveSessionId(query);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });
      const mode = c.req.query("mode");
      const readonly = mode === "view";

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/permissions");

      return successJson(c, buildResponse(c, {
        canEdit: !readonly,
        readonly,
        sessionId,
        userId: authCtx.userId
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_PERMISSIONS_FAILED", unknownErrorMessage(error));
    }
  });

  app.delete("/api/chat/history", validateQuery(chatHistoryQuerySchema), async (c) => {
    try {
      const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
      const sessionId = resolveSessionId(query);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/history:delete");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const result = await agent.clearChat();
      if (!result?.success) {
        return errorJson(c, 500, "CHAT_CLEAR_FAILED", "Failed to clear chat history");
      }

      return successJson(c, buildResponse(c, {
        message: "Chat history cleared",
        sessionId
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_CLEAR_FAILED", unknownErrorMessage(error));
    }
  });

  app.delete("/api/chat/session", validateQuery(deleteSessionQuerySchema), async (c) => {
    try {
      const query = c.req.valid("query") as z.infer<typeof deleteSessionQuerySchema>;
      const sessionId = resolveSessionId(query);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/session:delete");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const result = await agent.deleteSession();
      if (!result?.success) {
        return errorJson(c, 500, "CHAT_DELETE_SESSION_FAILED", result?.error || "Failed to delete session");
      }

      return successJson(c, buildResponse(c, {
        destroyed: result.destroyed,
        pendingDestroy: result.pendingDestroy,
        sessionId
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_DELETE_SESSION_FAILED", unknownErrorMessage(error));
    }
  });

  app.delete("/api/chat/message", validateQuery(deleteMessageQuerySchema), async (c) => {
    try {
      const query = c.req.valid("query") as z.infer<typeof deleteMessageQuerySchema>;
      const sessionId = resolveSessionId(query);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/message:delete");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const result = await agent.deleteMessage(query.messageId);

      if (!result.success) {
        return errorJson(c, 400, "CHAT_DELETE_MESSAGE_FAILED", result.error || "Delete failed");
      }

      return successJson(c, buildResponse(c, {
        deleted: result.deleted,
        sessionId
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_DELETE_MESSAGE_FAILED", unknownErrorMessage(error));
    }
  });

  app.post("/api/chat/edit", validateJson(editBodySchema), async (c) => {
    try {
      const body = c.req.valid("json") as z.infer<typeof editBodySchema>;
      const sessionId = resolveSessionId(body);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/edit");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const result = await agent.editUserMessage(body.messageId, body.content);

      if (!result.success) {
        return errorJson(c, 400, "CHAT_EDIT_MESSAGE_FAILED", result.error || "Edit failed");
      }

      return successJson(c, buildResponse(c, {
        updated: result.updated,
        sessionId
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_EDIT_MESSAGE_FAILED", unknownErrorMessage(error));
    }
  });

  app.post("/api/chat/regenerate", validateJson(regenerateBodySchema), async (c) => {
    try {
      const body = c.req.valid("json") as z.infer<typeof regenerateBodySchema>;
      const sessionId = resolveSessionId(body);
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/regenerate");

      const agentName = buildAgentName(authCtx.userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const result = await agent.regenerateFrom(body.messageId);

      if (!result.success) {
        return errorJson(c, 400, "CHAT_REGENERATE_FAILED", result.error || "Regenerate failed");
      }

      return successJson(c, buildResponse(c, {
        response: result.response,
        sessionId
      }, authCtx));
    } catch (error) {
      return errorJson(c, 500, "CHAT_REGENERATE_FAILED", unknownErrorMessage(error));
    }
  });
}
