import { z } from "zod";

export const sessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, "sessionId must use a-z, A-Z, 0-9, _, -");

export const requiredSessionBodySchema = z.object({
  sessionId: sessionIdSchema
});

export const chatBodySchema = requiredSessionBodySchema.extend({
  message: z.string().trim().min(1, "message is required")
});

export const editBodySchema = requiredSessionBodySchema.extend({
  messageId: z.string().trim().min(1, "messageId is required"),
  content: z.string().trim().min(1, "content is required")
});

export const regenerateBodySchema = requiredSessionBodySchema.extend({
  messageId: z.string().trim().min(1, "messageId is required")
});

export const forkBodySchema = requiredSessionBodySchema.extend({
  messageId: z.string().trim().min(1, "messageId is required")
});

export const mcpServerBodySchema = requiredSessionBodySchema.extend({
  name: z.string().trim().min(1, "name is required")
});

export const toolApprovalDecisionBodySchema = requiredSessionBodySchema.extend({
  approvalId: z.string().trim().min(1, "approvalId is required"),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500, "reason too long").optional()
});

export const chatHistoryQuerySchema = z.object({
  sessionId: sessionIdSchema
});

export const chatSessionsQuerySchema = z.object({
  sessionIds: z
    .string()
    .trim()
    .max(4000, "sessionIds too long")
    .optional()
});

export const deleteSessionQuerySchema = chatHistoryQuerySchema;

export const deleteMessageQuerySchema = chatHistoryQuerySchema.extend({
  messageId: z.string().trim().min(1, "messageId is required")
});

export type ChatBody = z.infer<typeof chatBodySchema>;
export type EditBody = z.infer<typeof editBodySchema>;
export type RegenerateBody = z.infer<typeof regenerateBodySchema>;
export type ForkBody = z.infer<typeof forkBodySchema>;
export type McpServerBody = z.infer<typeof mcpServerBodySchema>;
export type ChatHistoryQuery = z.infer<typeof chatHistoryQuerySchema>;
export type ChatSessionsQuery = z.infer<typeof chatSessionsQuerySchema>;
export type DeleteSessionQuery = z.infer<typeof deleteSessionQuerySchema>;
export type DeleteMessageQuery = z.infer<typeof deleteMessageQuerySchema>;
export type ToolApprovalDecisionBody = z.infer<typeof toolApprovalDecisionBodySchema>;
