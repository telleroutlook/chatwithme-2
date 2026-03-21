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
 * Get allowed CORS origins from environment
 * - If ALLOWED_ORIGINS is set, use that (comma-separated)
 * - Otherwise, allow common local origins for development
 */
const getAllowedOrigins = (env: Env): string[] => {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
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
