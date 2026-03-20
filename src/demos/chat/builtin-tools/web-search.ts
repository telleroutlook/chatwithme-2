/**
 * Built-in DuckDuckGo web search tool
 *
 * Fetches DuckDuckGo HTML search results and parses them directly in the Worker.
 * No API key needed. Used as the primary search tool, with MCP web-search-prime
 * available as fallback.
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

// ============ DDG HTML Parser ============

const DDG_URL = "https://html.duckduckgo.com/html/";
const MAX_RESULTS = 8;

/**
 * Fetch and parse DuckDuckGo HTML search results.
 *
 * DuckDuckGo's HTML-only endpoint returns a lightweight page that can be
 * parsed with simple regex — no JS rendering required, making it ideal for
 * Cloudflare Workers where there is no headless browser.
 */
export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const url = `${DDG_URL}?${params.toString()}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7"
    },
    redirect: "follow"
  });

  // DDG returns 202 when bot-detected — treat as empty results, not a hard error
  if (resp.status === 202) {
    return [];
  }

  if (!resp.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${resp.status}`);
  }

  const html = await resp.text();
  return deduplicateResults(parseDdgHtml(html));
}

/**
 * Parse DuckDuckGo HTML result page.
 *
 * Each organic result sits in a <div class="result ..."> block containing:
 * - <a class="result__a" href="...">title</a>
 * - <a class="result__snippet">snippet text</a>
 *
 * The href on result__a goes through a DDG redirect (/l/?uddg=ENCODED_URL).
 * We extract the actual URL from the uddg parameter.
 */
function parseDdgHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match each result block
  const resultBlockRegex =
    /<div[^>]*class="[^"]*result\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*result\b|$)/gi;

  let blockMatch: RegExpExecArray | null;
  while (
    (blockMatch = resultBlockRegex.exec(html)) !== null &&
    results.length < MAX_RESULTS
  ) {
    const block = blockMatch[1];

    // Extract title + href from result__a
    const linkMatch = block.match(
      /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const rawHref = linkMatch[1];
    const rawTitle = linkMatch[2];

    // Extract snippet
    const snippetMatch = block.match(
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i
    );
    // Also try <td class="result__snippet"> variant
    const snippetMatch2 = snippetMatch
      ? null
      : block.match(
          /<td[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/td>/i
        );
    const rawSnippet = snippetMatch?.[1] || snippetMatch2?.[1] || "";

    // Resolve URL from DDG redirect
    const url = resolveUrl(rawHref);
    if (!url) continue;

    const title = stripHtml(rawTitle).trim();
    const snippet = stripHtml(rawSnippet).trim();

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * Resolve the actual URL from DDG's redirect href.
 * Format: //duckduckgo.com/l/?uddg=ENCODED_URL&rut=...
 */
function resolveUrl(rawHref: string): string | null {
  try {
    // Some results link directly
    if (
      rawHref.startsWith("http://") ||
      rawHref.startsWith("https://")
    ) {
      return rawHref;
    }
    // DDG redirect format
    const match = rawHref.match(/[?&]uddg=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    // Relative URL with protocol
    if (rawHref.startsWith("//")) {
      return `https:${rawHref}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

// ============ Deduplication ============

/** Remove duplicate search results by URL */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// ============ Format Results ============

function formatResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No search results found for: "${query}". This may be due to rate limiting. Try rephrasing the query with different keywords, or use a more specific/broader search term.`;
  }

  const lines = results.map(
    (r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
  );
  return `Search results for "${query}":\n\n${lines.join("\n\n")}`;
}

// ============ AI Tool Definition ============

export const BUILTIN_TOOL_KEY = "builtin_web_search";

/**
 * Resolve a search query from various possible argument shapes.
 *
 * GLM and other models may use different parameter names when calling the tool,
 * even when the schema specifies `search_query`.  We accept common variants so
 * the search still works.
 */
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
  // Last resort: if the model passed a single string value under any key, use it
  const values = Object.values(args).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (values.length === 1) {
    return values[0].trim();
  }
  return "";
}

export function createWebSearchTool(): ToolSet {
  return {
    [BUILTIN_TOOL_KEY]: tool({
      description:
        "Search the web using DuckDuckGo. Returns titles, URLs, and snippets for up to 8 results. Use for current events, real-time data, fact-checking, or any query that may require up-to-date information. You MUST provide the search_query parameter.",
      inputSchema: z.object({
        search_query: z
          .string()
          .describe("The search query string. This parameter is required.")
      }),
      execute: async (rawArgs: { search_query: string }) => {
        // Normalize: the model may have passed args under unexpected keys
        const query = resolveSearchQuery(rawArgs as unknown as Record<string, unknown>);
        if (!query) {
          return 'Error: No search query provided. Please call this tool with {"search_query": "your query here"}.';
        }
        try {
          const results = await searchDuckDuckGo(query);
          return formatResults(query, results);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return `Search error: ${message}`;
        }
      }
    })
  };
}
