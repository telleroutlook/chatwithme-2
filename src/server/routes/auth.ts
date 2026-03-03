/**
 * Authentication API routes.
 * Provides register, login, logout, and me endpoints.
 */

import { Hono } from "hono";
import { z } from "zod";
import { errorJson, successJson, unknownErrorMessage } from "../http";
import {
  resolveAuthContext,
  logAuthContext,
} from "../auth";
import { signJwt } from "../jwt";
import { hashPassword, verifyPassword } from "../password";
import { validateJson } from "../validators";
import { ensureAuthSchema } from "../auth-db";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

// D1Database type alias for better readability
type D1Database = Env["DB"];

// ============ Schemas ============

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscore, and hyphen"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// ============ Database Operations ============

interface DbUser {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

interface DbSessionBinding {
  user_id: string;
  session_id: string;
  updated_at: string;
}

/**
 * Generate unique user ID.
 */
function generateUserId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new user in D1.
 */
async function createUser(
  db: D1Database,
  username: string,
  passwordHash: string
): Promise<DbUser> {
  const id = generateUserId();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(id, username, passwordHash, now)
    .run();

  return {
    id,
    username,
    password_hash: passwordHash,
    created_at: now,
  };
}

/**
 * Find user by username.
 */
async function findUserByUsername(db: D1Database, username: string): Promise<DbUser | null> {
  const result = await db
    .prepare("SELECT id, username, password_hash, created_at FROM users WHERE username = ?")
    .bind(username)
    .first<DbUser>();

  return result || null;
}

/**
 * Find user by ID.
 */
async function findUserById(db: D1Database, id: string): Promise<DbUser | null> {
  const result = await db
    .prepare("SELECT id, username, password_hash, created_at FROM users WHERE id = ?")
    .bind(id)
    .first<DbUser>();

  return result || null;
}

/**
 * Bind session to user.
 */
async function bindSessionToUser(
  db: D1Database,
  userId: string,
  sessionId: string
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO user_session_bindings (user_id, session_id, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id, session_id) DO UPDATE SET updated_at = ?"
    )
    .bind(userId, sessionId, now, now)
    .run();
}

/**
 * Get all sessions bound to a user.
 */
async function getUserSessions(db: D1Database, userId: string): Promise<DbSessionBinding[]> {
  const result = await db
    .prepare("SELECT user_id, session_id, updated_at FROM user_session_bindings WHERE user_id = ?")
    .bind(userId)
    .all<DbSessionBinding>();

  return result.results || [];
}

// ============ Route Handlers ============

export function registerAuthRoutes(app: Hono<AppBindings>): void {
  /**
   * POST /api/auth/register
   * Create a new user account.
   */
  app.post("/api/auth/register", validateJson(registerSchema), async (c) => {
    try {
      const body = c.req.valid("json") as z.infer<typeof registerSchema>;
      const db = c.env.DB;

      if (!db) {
        return errorJson(c, 500, "DB_NOT_CONFIGURED", "Database not configured");
      }
      await ensureAuthSchema(db);

      // Check if username already exists
      const existing = await findUserByUsername(db, body.username);
      if (existing) {
        return errorJson(c, 409, "USERNAME_EXISTS", "Username already exists");
      }

      // Hash password and create user
      const passwordHash = await hashPassword(body.password);
      const user = await createUser(db, body.username, passwordHash);

      // Generate JWT token
      const jwtSecret = c.env.AUTH_JWT_SECRET;
      if (!jwtSecret) {
        return errorJson(c, 500, "JWT_SECRET_MISSING", "JWT secret not configured");
      }

      const token = await signJwt({ sub: user.id }, jwtSecret);

      return successJson(c, {
        message: "Registration successful",
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.created_at,
        },
        token,
      });
    } catch (error) {
      console.error("[auth_register_error]", {
        requestId: c.get("requestId"),
        error: unknownErrorMessage(error),
      });
      return errorJson(c, 500, "REGISTRATION_FAILED", unknownErrorMessage(error));
    }
  });

  /**
   * POST /api/auth/login
   * Authenticate user and return JWT token.
   */
  app.post("/api/auth/login", validateJson(loginSchema), async (c) => {
    try {
      const body = c.req.valid("json") as z.infer<typeof loginSchema>;
      const db = c.env.DB;

      if (!db) {
        return errorJson(c, 500, "DB_NOT_CONFIGURED", "Database not configured");
      }
      await ensureAuthSchema(db);

      // Find user
      const user = await findUserByUsername(db, body.username);
      if (!user) {
        return errorJson(c, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      }

      // Verify password
      const isValid = await verifyPassword(body.password, user.password_hash);
      if (!isValid) {
        return errorJson(c, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      }

      // Generate JWT token
      const jwtSecret = c.env.AUTH_JWT_SECRET;
      if (!jwtSecret) {
        return errorJson(c, 500, "JWT_SECRET_MISSING", "JWT secret not configured");
      }

      const token = await signJwt({ sub: user.id }, jwtSecret);

      return successJson(c, {
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.created_at,
        },
        token,
      });
    } catch (error) {
      console.error("[auth_login_error]", {
        requestId: c.get("requestId"),
        error: unknownErrorMessage(error),
      });
      return errorJson(c, 500, "LOGIN_FAILED", unknownErrorMessage(error));
    }
  });

  /**
   * POST /api/auth/logout
   * Logout user (client-side token removal).
   */
  app.post("/api/auth/logout", async (c) => {
    try {
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      // Log logout for audit
      if (authCtx.authMode === "authenticated") {
        console.log("[auth_logout]", {
          requestId: c.get("requestId"),
          userId: authCtx.userId,
        });
      }

      return successJson(c, {
        message: "Logout successful",
      });
    } catch (error) {
      return errorJson(c, 500, "LOGOUT_FAILED", unknownErrorMessage(error));
    }
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user info.
   */
  app.get("/api/auth/me", async (c) => {
    try {
      const authCtx = await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

      logAuthContext(c.get("requestId"), authCtx, "/api/auth/me");

      // Not authenticated
      if (authCtx.authMode !== "authenticated") {
        return successJson(c, {
          authenticated: false,
          guest: true,
          userId: authCtx.userId === "anonymous" ? null : authCtx.userId,
        });
      }

      const db = c.env.DB;
      if (!db) {
        return errorJson(c, 500, "DB_NOT_CONFIGURED", "Database not configured");
      }
      await ensureAuthSchema(db);

      // Get user from database
      const user = await findUserById(db, authCtx.userId);
      if (!user) {
        return successJson(c, {
          authenticated: false,
          guest: true,
          userId: null,
          error: "User not found",
        });
      }

      return successJson(c, {
        authenticated: true,
        guest: false,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.created_at,
        },
      });
    } catch (error) {
      console.error("[auth_me_error]", {
        requestId: c.get("requestId"),
        error: unknownErrorMessage(error),
      });
      return errorJson(c, 500, "AUTH_CHECK_FAILED", unknownErrorMessage(error));
    }
  });
}
