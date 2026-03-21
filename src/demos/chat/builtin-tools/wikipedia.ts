/**
 * Built-in Wikipedia summary tool — uses the Wikipedia REST API (free, no key).
 *
 * Fetches the summary (lead paragraph + key facts) for any Wikipedia article.
 * Supports multiple languages. Fast: single HTTP GET, ~200ms typical.
 * Cloudflare Workers compatible.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_WIKIPEDIA_KEY = "builtin_wikipedia";

// ============ Wikipedia REST API ============

interface WikipediaSummary {
  title: string;
  displaytitle?: string;
  description?: string;
  extract: string;
  content_urls?: {
    desktop?: { page?: string };
  };
}

const LANG_TO_WIKI: Record<string, string> = {
  zh: "zh",
  "zh-cn": "zh",
  "zh-tw": "zh",
  "zh-hk": "zh",
  ja: "ja",
  ko: "ko",
  de: "de",
  fr: "fr",
  es: "es",
  pt: "pt",
  ru: "ru",
  ar: "ar",
  en: "en",
};

function detectWikiLang(lang?: string): string {
  if (!lang) return "en";
  const lower = lang.toLowerCase();
  return LANG_TO_WIKI[lower] ?? "en";
}

async function fetchWikipediaSummary(
  title: string,
  lang: string
): Promise<WikipediaSummary> {
  const encoded = encodeURIComponent(title.trim().replace(/\s+/g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "ChatWithMe/2.0 (wikipedia tool)" },
  });
  if (resp.status === 404) {
    throw new Error(
      `No Wikipedia article found for "${title}" (${lang} Wikipedia).`
    );
  }
  if (!resp.ok) {
    throw new Error(`Wikipedia API failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) as WikipediaSummary;
}

async function searchWikipedia(
  query: string,
  lang: string
): Promise<string[]> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json&origin=*`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = (await resp.json()) as [string, string[]];
  return data[1] ?? [];
}

function formatSummary(summary: WikipediaSummary): string {
  const lines: string[] = [];
  lines.push(`**${summary.title}**`);
  if (summary.description) {
    lines.push(`*${summary.description}*`);
  }
  lines.push("");
  lines.push(summary.extract);
  const pageUrl = summary.content_urls?.desktop?.page;
  if (pageUrl) {
    lines.push("");
    lines.push(`Source: ${pageUrl}`);
  }
  return lines.join("\n");
}

// ============ AI Tool Definition ============

export function createWikipediaTool(): ToolSet {
  return {
    [BUILTIN_WIKIPEDIA_KEY]: tool({
      description:
        "Look up factual information from Wikipedia. Returns the article summary (lead paragraph + description). Use for biographical info, historical events, scientific concepts, geography, and any encyclopedic knowledge. Supports multiple languages — set lang to 'zh' for Chinese Wikipedia, 'ja' for Japanese, etc.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The topic or person to look up on Wikipedia. Use the most canonical/official name for best results. Examples: 'Albert Einstein', '巴黎铁塔', 'Photosynthesis', '东京奥运会'."
          ),
        lang: z
          .string()
          .optional()
          .describe(
            "Wikipedia language code. Use 'zh' for Chinese, 'en' for English (default), 'ja' for Japanese, 'de' for German, etc."
          ),
      }),
      execute: async ({
        query,
        lang,
      }: {
        query: string;
        lang?: string;
      }) => {
        if (!query?.trim()) return "Error: No query provided.";
        const wikiLang = detectWikiLang(lang);
        try {
          // Try direct lookup first
          const summary = await fetchWikipediaSummary(query.trim(), wikiLang);
          return formatSummary(summary);
        } catch (err) {
          // If not found, try search fallback
          if (
            err instanceof Error &&
            err.message.includes("No Wikipedia article")
          ) {
            try {
              const titles = await searchWikipedia(query.trim(), wikiLang);
              if (titles.length > 0) {
                const summary = await fetchWikipediaSummary(
                  titles[0],
                  wikiLang
                );
                return formatSummary(summary);
              }
            } catch {
              // ignore search fallback errors
            }
          }
          const msg = err instanceof Error ? err.message : String(err);
          return `Wikipedia error: ${msg}`;
        }
      },
    }),
  };
}
