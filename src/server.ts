import { Hono } from "hono";
import { cors } from "hono/cors";
import { routeAgentRequest, getAgentByName } from "agents";
import { ChatAgent } from "./demos/chat/chat-agent";

// Export the ChatAgent for Durable Objects
export { ChatAgent };

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use("*", cors());

// ============ REST API Routes ============

/**
 * POST /api/chat
 * Send a chat message and get AI response
 * Body: { "message": "your message", "sessionId": "optional-session-id" }
 */
app.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json();
    const { message, sessionId = "default" } = body;

    if (!message) {
      return c.json({ success: false, error: "Message is required" }, 400);
    }

    // Get or create agent instance
    const agent = await getAgentByName(c.env.ChatAgent, sessionId);

    // Call the chat method
    const response = await agent.chat(message);

    return c.json({
      success: true,
      response,
      sessionId
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/chat/history
 * Get chat history for a session
 * Query params: sessionId
 */
app.get("/api/chat/history", async (c) => {
  try {
    const sessionId = c.req.query("sessionId") || "default";

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    const history = await agent.getHistory();

    return c.json({
      success: true,
      history,
      sessionId
    });
  } catch (error) {
    console.error("Get history error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * DELETE /api/chat/history
 * Clear chat history for a session
 * Query params: sessionId
 */
app.delete("/api/chat/history", async (c) => {
  try {
    const sessionId = c.req.query("sessionId") || "default";

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    await agent.clearChat();

    return c.json({
      success: true,
      message: "Chat history cleared"
    });
  } catch (error) {
    console.error("Clear history error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/mcp/servers
 * Get list of pre-configured MCP servers
 * Query params: sessionId
 */
app.get("/api/mcp/servers", async (c) => {
  try {
    const sessionId = c.req.query("sessionId") || "default";

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    const servers = await agent.getPreconfiguredServers();

    return c.json({
      success: true,
      servers,
      sessionId
    });
  } catch (error) {
    console.error("Get servers error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * POST /api/mcp/toggle
 * Toggle MCP server activation
 * Body: { "name": "server-name", "sessionId": "optional-session-id" }
 */
app.post("/api/mcp/toggle", async (c) => {
  try {
    const body = await c.req.json();
    const { name, sessionId = "default" } = body;

    if (!name) {
      return c.json({ success: false, error: "Server name is required" }, 400);
    }

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    const result = await agent.toggleServer(name);

    return c.json({
      success: result.success,
      active: result.active,
      error: result.error,
      sessionId
    });
  } catch (error) {
    console.error("Toggle server error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * POST /api/mcp/activate
 * Activate a specific MCP server
 * Body: { "name": "server-name", "sessionId": "optional-session-id" }
 */
app.post("/api/mcp/activate", async (c) => {
  try {
    const body = await c.req.json();
    const { name, sessionId = "default" } = body;

    if (!name) {
      return c.json({ success: false, error: "Server name is required" }, 400);
    }

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    const result = await agent.activateServer(name);

    return c.json({
      ...result,
      sessionId
    });
  } catch (error) {
    console.error("Activate server error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * POST /api/mcp/deactivate
 * Deactivate a specific MCP server
 * Body: { "name": "server-name", "sessionId": "optional-session-id" }
 */
app.post("/api/mcp/deactivate", async (c) => {
  try {
    const body = await c.req.json();
    const { name, sessionId = "default" } = body;

    if (!name) {
      return c.json({ success: false, error: "Server name is required" }, 400);
    }

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    const result = await agent.deactivateServer(name);

    return c.json({
      ...result,
      sessionId
    });
  } catch (error) {
    console.error("Deactivate server error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/tools
 * Get available MCP tools
 * Query params: sessionId
 */
app.get("/api/tools", async (c) => {
  try {
    const sessionId = c.req.query("sessionId") || "default";

    const agent = await getAgentByName(c.env.ChatAgent, sessionId);
    const tools = await agent.getAvailableTools();

    return c.json({
      success: true,
      tools,
      count: tools.length,
      sessionId
    });
  } catch (error) {
    console.error("Get tools error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get("/api/health", (c) => {
  return c.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// ============ Agent Routes (WebSocket + HTTP) ============

// Handle all /agents/* routes for WebSocket connections and agent HTTP requests
app.all("/agents/*", async (c) => {
  const response = await routeAgentRequest(c.req.raw, c.env, { cors: true });
  return response || c.notFound();
});

// ============ Static Assets ============

// Serve static assets (handled by Cloudflare Workers assets binding)
// This is configured in wrangler.jsonc

// Export default handler
export default app;
