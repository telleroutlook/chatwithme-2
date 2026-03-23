/**
 * Main server entry point.
 * Sets up Hono app with middleware and registers all routes.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorJson, unknownErrorMessage } from "./server/http";
import { ChatAgentV2 } from "./demos/chat/chat-agent";

// Route registrations
import { registerChatRoutes } from "./server/routes/chat";
import { registerMcpRoutes } from "./server/routes/mcp";
import { registerRuntimeRoutes } from "./server/routes/runtime";
import { registerHealthRoutes } from "./server/routes/health";
import { registerAgentsRoutes } from "./server/routes/agents";
import { registerAuthRoutes } from "./server/routes/auth";
import { registerChatSyncRoutes } from "./server/routes/chat-sync";
import { registerDebugRoutes } from "./server/routes/debug";
import { registerChatStreamRoute } from "./server/routes/chat-stream";

// Exports required by Cloudflare Workers / agents framework
export { ChatAgentV2 };
export { parseAgentName, buildAgentName } from "./server/auth";

// Server variable types
type ServerVariables = {
  requestId: string;
};

// App initialization with typed bindings
const app = new Hono<{ Bindings: Env; Variables: ServerVariables }>();

// ============ CORS Configuration ============

/**
 * Detect whether this is a production deployment.
 * Heuristic: presence of a non-localhost HOST env var.
 */
function isProduction(env: Env): boolean {
  const host = env.HOST ?? "";
  return host.length > 0 && !host.includes("localhost") && !host.includes("127.0.0.1");
}

/**
 * Get allowed CORS origins from environment.
 * - If ALLOWED_ORIGINS is set, use that (comma-separated).
 * - In production without ALLOWED_ORIGINS, log a warning and deny all cross-origin requests.
 * - In development (no HOST or localhost HOST), allow common local origins.
 */
const getAllowedOrigins = (env: Env): string[] => {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  if (isProduction(env)) {
    // Fail-safe: deny all cross-origin requests in production when ALLOWED_ORIGINS is not set.
    console.warn("[cors] ALLOWED_ORIGINS not set in production — all cross-origin requests will be denied. Set ALLOWED_ORIGINS to fix this.");
    return [];
  }
  // Dev default: allow common local origins
  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8787',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8787',
  ];
};

// CORS middleware with origin whitelist
app.use("*", cors({
  origin: (origin, c) => {
    const allowed = getAllowedOrigins(c.env);
    // Allow requests without origin (mobile apps, curl, server-to-server)
    // only for safe (non-mutating) methods
    if (!origin) return null;
    // Allow if origin is in whitelist
    if (allowed.includes(origin)) return origin;
    // Block other origins
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 86400,
  credentials: true,
}));

// Request ID middleware
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") || crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("x-request-id", requestId);
});

// ============ Route Registration ============

registerAuthRoutes(app);
registerChatSyncRoutes(app);
registerChatStreamRoute(app);
registerChatRoutes(app);
registerMcpRoutes(app);
registerRuntimeRoutes(app);
registerHealthRoutes(app);
registerDebugRoutes(app);
registerAgentsRoutes(app);

// ============ Error Handler ============

app.onError((error, c) => {
  return errorJson(c, 500, "UNHANDLED_ERROR", unknownErrorMessage(error));
});

// ============ Export ============

export default app;
