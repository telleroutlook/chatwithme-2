import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { collectMessageTextParts, getMessageText, joinMessageTextParts } from "./message-text";

describe("message-text", () => {
  it("collects only text parts", () => {
    const parts: unknown = [
      { type: "text", text: "hello" },
      { type: "source", text: "ignored" },
      { type: "text", text: " world" },
      null
    ];

    expect(collectMessageTextParts(parts)).toEqual(["hello", " world"]);
  });

  it("joins normal chunks without injecting extra newlines", () => {
    expect(joinMessageTextParts(["Hello", " world", "!"])).toBe("Hello world!");
  });

  it("injects newline after fenced-code language header split across chunks", () => {
    expect(joinMessageTextParts(["```xml", "<svg></svg>\n```"])).toBe("```xml\n<svg></svg>\n```");
  });

  it("injects newline before closing fence when split", () => {
    expect(joinMessageTextParts(["<svg></svg>", "```"])).toBe("<svg></svg>\n```");
  });

  it("prefers message.content when available", () => {
    const message = {
      id: "1",
      role: "assistant",
      content: "from-content",
      parts: [{ type: "text", text: "from-parts" }]
    } as unknown as UIMessage;

    expect(getMessageText(message)).toBe("from-content");
  });

  it("builds content from parts when content is not present", () => {
    const message = {
      id: "2",
      role: "assistant",
      parts: [{ type: "text", text: "```xml" }, { type: "text", text: "<svg />\n```" }]
    } as unknown as UIMessage;

    expect(getMessageText(message)).toBe("```xml\n<svg />\n```");
  });
});
