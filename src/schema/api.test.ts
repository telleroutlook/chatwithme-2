import { describe, expect, it } from "vitest";
import {
  chatBodySchema,
  deleteMessageQuerySchema,
  editBodySchema,
  mcpServerBodySchema
} from "./api";

describe("api schemas", () => {
  it("validates chat body", () => {
    const parsed = chatBodySchema.parse({ sessionId: "session_1", message: "hello" });
    expect(parsed.message).toBe("hello");
  });

  it("rejects empty edit content", () => {
    const result = editBodySchema.safeParse({ messageId: "m1", content: "   " });
    expect(result.success).toBe(false);
  });

  it("validates delete message query", () => {
    const parsed = deleteMessageQuerySchema.parse({ sessionId: "abc", messageId: "mid" });
    expect(parsed.messageId).toBe("mid");
  });

  it("rejects empty mcp server name", () => {
    const result = mcpServerBodySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
