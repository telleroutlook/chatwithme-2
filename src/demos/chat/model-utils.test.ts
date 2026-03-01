import { describe, expect, it } from "vitest";
import { normalizeToolArguments, toFallbackModelMessages } from "./model-utils";

describe("normalizeToolArguments", () => {
  it("maps webSearchPrime query -> search_query", () => {
    const result = normalizeToolArguments("webSearchPrime", {
      query: "cloudflare agents",
      limit: 5
    });
    expect(result).toEqual({
      search_query: "cloudflare agents",
      limit: 5
    });
  });

  it("maps webReader link -> url", () => {
    const result = normalizeToolArguments("webReader", {
      link: "https://example.com"
    });
    expect(result).toEqual({
      url: "https://example.com"
    });
  });
});

describe("toFallbackModelMessages", () => {
  it("converts text parts and drops empty messages", () => {
    const result = toFallbackModelMessages([
      {
        role: "user",
        parts: [{ type: "text", text: "hello" }]
      },
      {
        role: "assistant",
        parts: [{ type: "tool-call" }]
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "world" }]
      }
    ]);

    expect(result).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "hello" }]
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "world" }]
      }
    ]);
  });
});
