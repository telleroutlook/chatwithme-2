import { describe, expect, it } from "vitest";
import {
  chatBodySchema,
  chatSessionsQuerySchema,
  deleteSessionQuerySchema,
  deleteMessageQuerySchema,
  editBodySchema,
  mcpServerBodySchema
} from "./api";

describe("api schemas", () => {
  it("validates chat body", () => {
    const parsed = chatBodySchema.parse({
      sessionId: "session_1",
      message: "hello",
      responseProfile: "compact",
      softToolBudget: 2,
      toolMode: "off"
    });
    expect(parsed.message).toBe("hello");
    expect(parsed.responseProfile).toBe("compact");
    expect(parsed.softToolBudget).toBe(2);
    expect(parsed.toolMode).toBe("off");
  });

  it("rejects empty edit content", () => {
    const result = editBodySchema.safeParse({ messageId: "m1", content: "   " });
    expect(result.success).toBe(false);
  });

  it("validates delete message query", () => {
    const parsed = deleteMessageQuerySchema.parse({ sessionId: "abc", messageId: "mid" });
    expect(parsed.messageId).toBe("mid");
  });

  it("validates delete session query", () => {
    const parsed = deleteSessionQuerySchema.parse({ sessionId: "abc_123" });
    expect(parsed.sessionId).toBe("abc_123");
  });

  it("rejects empty mcp server name", () => {
    const result = mcpServerBodySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("validates sessions query", () => {
    const parsed = chatSessionsQuerySchema.parse({ sessionIds: "s1,s2,s3" });
    expect(parsed.sessionIds).toBe("s1,s2,s3");
  });
});
