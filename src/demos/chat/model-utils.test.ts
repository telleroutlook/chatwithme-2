import { describe, expect, it } from "vitest";
import { normalizeToolArguments, resolveToolKind, toFallbackModelMessages } from "./model-utils";

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

  it("trims webSearchPrime search query", () => {
    const result = normalizeToolArguments("webSearchPrime", {
      query: "  cloudflare agents  "
    });
    expect(result).toEqual({
      search_query: "cloudflare agents"
    });
  });

  it("drops empty webSearchPrime query fields", () => {
    const result = normalizeToolArguments("webSearchPrime", {
      search_query: "   ",
      limit: 5
    });
    expect(result).toEqual({
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

  it("normalizes query aliases for web search tools", () => {
    const result = normalizeToolArguments("web_search_prime", {
      q: "workers ai",
      page: 1
    });
    expect(result).toEqual({
      search_query: "workers ai",
      page: 1
    });
  });

  it("normalizes url aliases for web reader tools", () => {
    const result = normalizeToolArguments("read_url", {
      targetUrl: "https://example.com/docs",
      mode: "markdown"
    }, {
      alias: "web-reader.read_url",
      serverId: "web-reader"
    });
    expect(result).toEqual({
      url: "https://example.com/docs",
      mode: "markdown"
    });
  });
});

describe("resolveToolKind", () => {
  it("identifies webSearchPrime by canonical name", () => {
    expect(resolveToolKind("webSearchPrime")).toBe("webSearchPrime");
  });

  it("identifies webReader by alias context", () => {
    expect(resolveToolKind("read_url", { alias: "web-reader.read_url" })).toBe("webReader");
  });

  it("returns unknown for unrelated tools", () => {
    expect(resolveToolKind("zread")).toBe("unknown");
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
