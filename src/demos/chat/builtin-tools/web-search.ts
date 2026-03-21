/**
 * Built-in web search tool — backed by Serper.dev (Google Search API).
 *
 * Single HTTP POST, no session management, no content filtering, works
 * reliably from Cloudflare Workers. DuckDuckGo was dropped because its HTML
 * endpoint blocks Cloudflare Worker IPs. BigModel web_search_prime was dropped
 * because it applies strict content filtering that blocks news queries.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

// ============ Types ============

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ============ Serper.dev ============

const SERPER_URL = "https://google.serper.dev/search";
const MAX_RESULTS = 5;

interface SerperOrganicItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperOrganicItem[];
}

/**
 * Search via Serper.dev Google Search API.
 * Single HTTP POST — no session, no bot detection, no content filtering.
 */
export async function searchSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let resp: Response;
  try {
    resp = await fetch(SERPER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: query, num: MAX_RESULTS }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    throw new Error(`Serper search failed: HTTP ${resp.status}`);
  }

  const data = await resp.json() as SerperResponse;

  return (data.organic ?? []).slice(0, MAX_RESULTS).map((item) => ({
    title: item.title ?? "",
    url: item.link ?? "",
    snippet: item.snippet ?? "",
  }));
}

// ============ Format Results ============

function formatResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No search results found for: "${query}". Try rephrasing with different keywords.`;
  }
  const lines = results.map(
    (r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
  );
  return `Search results for "${query}":\n\n${lines.join("\n\n")}`;
}

// ============ AI Tool Definition ============

export const BUILTIN_TOOL_KEY = "builtin_web_search";

function resolveSearchQuery(args: Record<string, unknown>): string {
  const candidates = [
    "search_query", "searchQuery", "query", "q",
    "keyword", "keywords", "search", "text", "input"
  ];
  for (const key of candidates) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  const values = Object.values(args).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (values.length === 1) return values[0].trim();
  return "";
}

export function createWebSearchTool(serperApiKey: string): ToolSet {
  return {
    [BUILTIN_TOOL_KEY]: tool({
      description:
        "Search the web. Returns titles, URLs, and snippets for up to 5 results. Use for current events, real-time data, fact-checking, or any query that may require up-to-date information. You MUST provide the search_query parameter.",
      inputSchema: z.object({
        search_query: z
          .string()
          .describe("The search query string. This parameter is required.")
      }),
      execute: async (rawArgs: { search_query: string }) => {
        const query = resolveSearchQuery(rawArgs as unknown as Record<string, unknown>);
        if (!query) {
          return 'Error: No search query provided. Please call this tool with {"search_query": "your query here"}.';
        }
        try {
          const results = await searchSerper(query, serperApiKey);
          return formatResults(query, results);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return `Search error: ${message}`;
        }
      }
    })
  };
}
