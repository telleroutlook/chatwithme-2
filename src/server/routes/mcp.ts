/**
 * MCP (Model Context Protocol) API routes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getAgentByName } from "agents";
import { chatHistoryQuerySchema, mcpServerBodySchema } from "../../schema/api";
import { errorJson, successJson, unknownErrorMessage } from "../http";
import { authMiddleware, buildAgentName } from "../auth";
import { resolveSessionId, validateJson, validateQuery } from "../validators";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

export function registerMcpRoutes(app: Hono<AppBindings>): void {
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
}
