/**
 * Runtime API routes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getAgentByName } from "agents";
import { chatHistoryQuerySchema, toolApprovalDecisionBodySchema } from "../../schema/api";
import { errorJson, successJson, unknownErrorMessage } from "../http";
import { authMiddleware, buildAgentName } from "../auth";
import { resolveSessionId, validateJson, validateQuery } from "../validators";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

export function registerRuntimeRoutes(app: Hono<AppBindings>): void {
  app.get("/api/runtime/snapshot", validateQuery(chatHistoryQuerySchema), async (c) => {
    try {
      const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
      const sessionId = resolveSessionId(query);
      const { userId } = await authMiddleware(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });
      const agentName = buildAgentName(userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const snapshot = await agent.getRuntimeSnapshot();

      return successJson(c, {
        ...snapshot,
        sessionId
      });
    } catch (error) {
      return errorJson(c, 500, "RUNTIME_SNAPSHOT_FAILED", unknownErrorMessage(error));
    }
  });

  app.get("/api/runtime/approvals", validateQuery(chatHistoryQuerySchema), async (c) => {
    try {
      const query = c.req.valid("query") as z.infer<typeof chatHistoryQuerySchema>;
      const sessionId = resolveSessionId(query);
      const { userId } = await authMiddleware(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });
      const agentName = buildAgentName(userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const approvals = await agent.listToolApprovals();

      return successJson(c, {
        approvals,
        sessionId
      });
    } catch (error) {
      return errorJson(c, 500, "RUNTIME_APPROVALS_FAILED", unknownErrorMessage(error));
    }
  });

  app.post("/api/runtime/approvals/decision", validateJson(toolApprovalDecisionBodySchema), async (c) => {
    try {
      const body = c.req.valid("json") as z.infer<typeof toolApprovalDecisionBodySchema>;
      const sessionId = resolveSessionId(body);
      const { userId } = await authMiddleware(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });
      const agentName = buildAgentName(userId, sessionId);
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);

      const result =
        body.decision === "approve"
          ? await agent.approveToolCall(body.approvalId)
          : await agent.rejectToolCall(body.approvalId, body.reason);

      if (!result.success) {
        return errorJson(
          c,
          400,
          "RUNTIME_APPROVAL_DECISION_FAILED",
          result.error || "Approval decision failed"
        );
      }

      return successJson(c, {
        sessionId,
        stateVersion: result.stateVersion
      });
    } catch (error) {
      return errorJson(c, 500, "RUNTIME_APPROVAL_DECISION_FAILED", unknownErrorMessage(error));
    }
  });
}
