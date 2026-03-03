/**
 * Chat API routes.
 */

import { Hono } from "hono";
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
import { authMiddleware, buildAgentName } from "../auth";
import { resolveSessionId, parseSessionIds, validateJson, validateQuery } from "../validators";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

export function registerChatRoutes(app: Hono<AppBindings>): void {
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
}
