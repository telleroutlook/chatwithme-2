import { describe, expect, it } from "vitest";
import { validateToolArguments } from "./model-execution";

describe("validateToolArguments", () => {
  it("accepts normalized webSearchPrime arguments", () => {
    const error = validateToolArguments("webSearchPrime", {
      search_query: "cloudflare"
    });
    expect(error).toBeNull();
  });

  it("validates web search aliases by context", () => {
    const error = validateToolArguments("search", { limit: 5 }, {
      alias: "web-search-prime.search",
      serverId: "web-search-prime"
    });
    expect(error).toBe('Tool "search" requires a non-empty "search_query" field.');
  });

  it("skips validation for unknown tools", () => {
    const error = validateToolArguments("zread", {});
    expect(error).toBeNull();
  });
});
