/**
 * Agent proxy route.
 */

import { Hono } from "hono";
import { routeAgentRequest } from "agents";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

export function registerAgentsRoutes(app: Hono<AppBindings>): void {
  app.all("/agents/*", async (c) => {
    const response = await routeAgentRequest(c.req.raw, c.env, { cors: true });
    return response || c.notFound();
  });
}
