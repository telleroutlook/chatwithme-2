/**
 * Chat sync API routes for session binding.
 * Allows authenticated users to sync their sessions across devices.
 */

import { Hono } from "hono";
import { z } from "zod";
import { errorJson, successJson, unknownErrorMessage } from "../http";
import { requireAuth, logAuthContext, type AuthContext } from "../auth";
import { validateJson } from "../validators";
import { ensureAuthSchema } from "../auth-db";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

// D1Database type from Cloudflare
type D1Database = Env["DB"];

// ============ Schemas ============

const sessionSyncSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.string().min(1).max(128),
      title: z.string().optional(),
      messageCount: z.number().int().min(0).optional(),
      updatedAt: z.string().optional(),
    })
  ).max(100, "Maximum 100 sessions per sync"),
});

type SessionSyncRequest = z.infer<typeof sessionSyncSchema>;

interface SessionBinding {
  session_id: string;
  updated_at: string;
}

// ============ Database Operations ============

/**
 * Bind sessions to a user.
 * Uses upsert to handle conflicts.
 */
async function bindSessionsToUser(
  db: D1Database,
  userId: string,
  sessionIds: string[]
): Promise<void> {
  const now = new Date().toISOString();

  // Use batch insert with ON CONFLICT handling
  for (const sessionId of sessionIds) {
    await db
      .prepare(
        `INSERT INTO user_session_bindings (user_id, session_id, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, session_id) DO UPDATE SET updated_at = excluded.updated_at`
      )
      .bind(userId, sessionId, now)
      .run();
  }
}

/**
 * Get all sessions bound to a user.
 */
async function getUserSessionBindings(
  db: D1Database,
  userId: string
): Promise<SessionBinding[]> {
  const result = await db
    .prepare(
      "SELECT session_id, updated_at FROM user_session_bindings WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .bind(userId)
    .all<SessionBinding>();

  return result.results || [];
}

// ============ Route Handlers ============

export function registerChatSyncRoutes(app: Hono<AppBindings>): void {
  /**
   * POST /api/chat/sync
   * Sync local sessions to server and bind them to the authenticated user.
   * Returns all sessions bound to the user.
   */
  app.post("/api/chat/sync", validateJson(sessionSyncSchema), async (c) => {
    try {
      // Require authentication
      let authCtx: AuthContext;
      try {
        authCtx = await requireAuth(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });
      } catch {
        return errorJson(c, 401, "AUTHENTICATION_REQUIRED", "Authentication required for session sync");
      }

      logAuthContext(c.get("requestId"), authCtx, "/api/chat/sync");

      const db = c.env.DB;
      if (!db) {
        return errorJson(c, 500, "DB_NOT_CONFIGURED", "Database not configured");
      }
      await ensureAuthSchema(db);

      const body = c.req.valid("json") as SessionSyncRequest;
      const sessionIds = body.sessions.map((s) => s.sessionId);

      // Bind all provided sessions to the user
      if (sessionIds.length > 0) {
        await bindSessionsToUser(db, authCtx.userId, sessionIds);
      }

      // Get all user's bound sessions
      const bindings = await getUserSessionBindings(db, authCtx.userId);

      // Build response with session summaries
      const syncedSessions = bindings.map((b) => ({
        sessionId: b.session_id,
        syncedAt: b.updated_at,
      }));

      return successJson(c, {
        message: "Sessions synced successfully",
        syncedCount: sessionIds.length,
        totalBoundSessions: bindings.length,
        sessions: syncedSessions,
        userId: authCtx.userId,
      });
    } catch (error) {
      console.error("[chat_sync_error]", {
        requestId: c.get("requestId"),
        error: unknownErrorMessage(error),
      });
      return errorJson(c, 500, "SYNC_FAILED", unknownErrorMessage(error));
    }
  });

  /**
   * GET /api/chat/bindings
   * Get all sessions bound to the authenticated user.
   */
  app.get("/api/chat/bindings", async (c) => {
    try {
      // Require authentication
      let authCtx: AuthContext;
      try {
        authCtx = await requireAuth(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });
      } catch {
        return errorJson(c, 401, "AUTHENTICATION_REQUIRED", "Authentication required");
      }

      const db = c.env.DB;
      if (!db) {
        return errorJson(c, 500, "DB_NOT_CONFIGURED", "Database not configured");
      }
      await ensureAuthSchema(db);

      const bindings = await getUserSessionBindings(db, authCtx.userId);

      return successJson(c, {
        sessions: bindings.map((b) => ({
          sessionId: b.session_id,
          updatedAt: b.updated_at,
        })),
        userId: authCtx.userId,
      });
    } catch (error) {
      return errorJson(c, 500, "GET_BINDINGS_FAILED", unknownErrorMessage(error));
    }
  });
}
