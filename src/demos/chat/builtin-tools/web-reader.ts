/**
 * Built-in web reader tool using Jina Reader API
 *
 * Fetches clean, LLM-friendly content from any URL via r.jina.ai.
 * No API key needed for basic usage (20 RPM). Used as the primary
 * web reader, with MCP web-reader available as fallback.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

// ============ Constants ============

const JINA_READER_BASE = "https://r.jina.ai/";
const MAX_CONTENT_LENGTH = 4000;
const FETCH_TIMEOUT_MS = 20_000;

// ============ Jina Reader ============

interface JinaReaderResult {
  title: string;
  url: string;
  content: string;
}

/**
 * Fetch clean content from a URL via Jina Reader API.
 *
 * Jina handles JS rendering, anti-bot bypass, and content extraction
 * server-side, returning LLM-friendly markdown. The target site sees
 * Jina's headless browser, not our Worker.
 */
/**
 * Block private/internal IP ranges to prevent SSRF attacks.
 * Rejects loopback, link-local, private RFC-1918 ranges, and metadata endpoints.
 */
function assertPublicUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject non-http(s) schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL scheme not allowed: ${parsed.protocol}`);
  }

  // Block loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    throw new Error("Requests to loopback addresses are not allowed");
  }

  // Block link-local (169.254.x.x) — AWS/GCP metadata endpoints
  if (/^169\.254\./.test(hostname)) {
    throw new Error("Requests to link-local addresses are not allowed");
  }

  // Block private RFC-1918 ranges
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  ) {
    throw new Error("Requests to private network addresses are not allowed");
  }

  // Block common internal hostnames
  if (hostname === "metadata.google.internal" || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    throw new Error("Requests to internal hostnames are not allowed");
  }
}

export async function readUrlViaJina(targetUrl: string): Promise<JinaReaderResult> {
  assertPublicUrl(targetUrl);

  const jinaUrl = `${JINA_READER_BASE}${targetUrl}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Return-Format": "markdown"
      },
      signal: controller.signal
    });

    if (!resp.ok) {
      throw new Error(`Jina Reader failed: HTTP ${resp.status}`);
    }

    const data = await resp.json() as {
      code?: number;
      data?: { title?: string; url?: string; content?: string };
    };

    if (data.code !== 200 || !data.data) {
      throw new Error(`Jina Reader returned unexpected response (code: ${data.code ?? "unknown"})`);
    }

    const content = data.data.content ?? "";
    return {
      title: data.data.title ?? "",
      url: data.data.url ?? targetUrl,
      content: content.length > MAX_CONTENT_LENGTH
        ? content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]"
        : content
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============ Format Result ============

function formatResult(result: JinaReaderResult): string {
  const header = result.title
    ? `# ${result.title}\nSource: ${result.url}\n\n`
    : `Source: ${result.url}\n\n`;

  if (!result.content) {
    return `${header}No readable content could be extracted from this page.`;
  }
  return `${header}${result.content}`;
}

// ============ AI Tool Definition ============

export const BUILTIN_WEB_READER_KEY = "builtin_web_reader";

/**
 * Resolve URL from various possible argument shapes.
 *
 * GLM and other models may use different parameter names.
 */
function resolveUrl(args: Record<string, unknown>): string {
  const candidates = [
    "url", "link", "uri", "target_url", "targetUrl",
    "webpage_url", "webpageUrl", "page_url", "pageUrl",
    "website", "address"
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

export function createWebReaderTool(): ToolSet {
  return {
    [BUILTIN_WEB_READER_KEY]: tool({
      description:
        "Read and extract the main content from a web page URL. Returns the page title and clean text/markdown content. Use when you need to read a specific URL the user provided or that appeared in search results. You MUST provide the url parameter.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("The URL of the web page to read. This parameter is required.")
      }),
      execute: async (rawArgs: { url: string }) => {
        const url = resolveUrl(rawArgs as unknown as Record<string, unknown>);
        if (!url) {
          return 'Error: No URL provided. Please call this tool with {"url": "https://example.com"}.';
        }
        // Basic URL validation
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return `Error: Invalid URL "${url}". URL must start with http:// or https://.`;
        }
        try {
          // assertPublicUrl is called inside readUrlViaJina — SSRF protection
          const result = await readUrlViaJina(url);
          return formatResult(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return `Web reader error: ${message}`;
        }
      }
    })
  };
}
