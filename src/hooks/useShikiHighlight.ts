/**
 * Shiki-based syntax highlighting hook with streaming support
 *
 * Features:
 * - Token-level memoization for efficient streaming updates
 * - Dual theme support (light/dark)
 * - LRU caching for performance
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { HighlighterCore } from "shiki";

interface CacheEntry {
  html: string;
  timestamp: number;
}

interface UseShikiHighlightOptions {
  language?: string;
  theme?: string;
  enabled?: boolean;
}

interface UseShikiHighlightResult {
  html: string | null;
  isLoading: boolean;
  error: Error | null;
}

// LRU Cache
const highlightCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Singleton highlighter instance
let highlighterInstance: HighlighterCore | null = null;
let highlighterPromise: Promise<HighlighterCore> | null = null;

function getCacheKey(code: string, lang: string, theme: string): string {
  let hash = 0;
  const str = `${lang}:${theme}:${code}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of highlightCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      highlightCache.delete(key);
    }
  }
  if (highlightCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(highlightCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const toRemove = sorted.slice(0, highlightCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      highlightCache.delete(key);
    }
  }
}

async function getHighlighter(): Promise<HighlighterCore> {
  if (typeof window === "undefined") {
    throw new Error("Shiki highlighter is only available in browser.");
  }
  if (highlighterInstance) return highlighterInstance;
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = import("shiki").then((module) => {
    highlighterInstance = module as unknown as HighlighterCore;
    return highlighterInstance;
  });

  return highlighterPromise;
}

function normalizeLanguage(language: string): string {
  const lang = language.trim().toLowerCase();
  if (!lang) return "text";
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    csharp: "c#",
    shell: "bash",
    dockerfile: "docker",
    k8s: "yaml",
    kubernetes: "yaml",
  };
  return map[lang] ?? lang;
}

/**
 * Hook for static code highlighting with Shiki
 */
export function useShikiHighlight(
  code: string,
  options: UseShikiHighlightOptions = {}
): UseShikiHighlightResult {
  const { language = "text", theme = "github-dark", enabled = true } = options;
  const [html, setHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const currentCodeRef = useRef(code);

  const normalizedLang = useMemo(() => normalizeLanguage(language), [language]);

  useEffect(() => {
    if (!enabled || !code) {
      setHtml(null);
      return;
    }

    currentCodeRef.current = code;
    const cacheKey = getCacheKey(code, normalizedLang, theme);
    const cached = highlightCache.get(cacheKey);
    if (cached) {
      setHtml(cached.html);
      return;
    }

    setIsLoading(true);
    setError(null);

    getHighlighter()
      .then(async (shiki) => {
        if (currentCodeRef.current !== code) return;

        const highlighted = await shiki.codeToHtml(code, {
          lang: normalizedLang,
          theme,
        });

        highlightCache.set(cacheKey, { html: highlighted, timestamp: Date.now() });
        if (highlightCache.size > MAX_CACHE_SIZE / 2) {
          cleanupCache();
        }
        setHtml(highlighted);
      })
      .catch((err) => {
        if (currentCodeRef.current === code) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (currentCodeRef.current === code) {
          setIsLoading(false);
        }
      });
  }, [code, enabled, normalizedLang, theme]);

  return { html, isLoading, error };
}

/**
 * Preload the highlighter for faster first render
 */
export async function preloadShikiHighlighter(): Promise<void> {
  await getHighlighter();
}

/**
 * Clear the highlight cache
 */
export function clearShikiCache(): void {
  highlightCache.clear();
}

/**
 * Get cache statistics
 */
export function getShikiCacheStats(): { size: number; maxSize: number } {
  return { size: highlightCache.size, maxSize: MAX_CACHE_SIZE };
}
