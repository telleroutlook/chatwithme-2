/**
 * Health check route.
 */

import { Hono } from "hono";
import { successJson } from "../http";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

export function registerHealthRoutes(app: Hono<AppBindings>): void {
  app.get("/api/health", (c) => {
    return successJson(c, {
      status: "healthy",
      timestamp: new Date().toISOString()
    });
  });
}
