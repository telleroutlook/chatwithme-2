import { useEffect, useMemo, useRef, useState } from "react";

type HighlightEngine = typeof import("highlight.js/lib/common");

interface CacheEntry {
  html: string;
  timestamp: number;
}

interface UseHighlightOptions {
  language?: string;
  theme?: string;
  enabled?: boolean;
}

interface UseHighlightResult {
  html: string | null;
  isLoading: boolean;
  error: Error | null;
}

const highlightCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000;

let engineInstance: HighlightEngine["default"] | null = null;
let enginePromise: Promise<HighlightEngine["default"]> | null = null;

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

async function getHighlighter(): Promise<HighlightEngine["default"]> {
  if (typeof window === "undefined") {
    throw new Error("Highlight engine is only available in browser.");
  }
  if (engineInstance) return engineInstance;
  if (enginePromise) return enginePromise;

  enginePromise = import("highlight.js/lib/common").then((module) => {
    engineInstance = module.default;
    return module.default;
  });
  return enginePromise;
}

function normalizeLanguage(language: string): string {
  const lang = language.trim().toLowerCase();
  if (!lang) return "plaintext";
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    csharp: "cs",
    shell: "bash"
  };
  return map[lang] ?? lang;
}

export function useHighlight(code: string, options: UseHighlightOptions = {}): UseHighlightResult {
  const { language = "plaintext", theme = "github-dark", enabled = true } = options;
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
      .then((hljs) => {
        if (currentCodeRef.current !== code) return;

        let highlighted: string;
        if (hljs.getLanguage(normalizedLang)) {
          highlighted = hljs.highlight(code, {
            language: normalizedLang,
            ignoreIllegals: true
          }).value;
        } else {
          highlighted = hljs.highlightAuto(code).value;
        }

        const wrapped = `<pre class="shiki"><code class="hljs language-${normalizedLang}">${highlighted}</code></pre>`;
        highlightCache.set(cacheKey, { html: wrapped, timestamp: Date.now() });
        if (highlightCache.size > MAX_CACHE_SIZE / 2) {
          cleanupCache();
        }
        setHtml(wrapped);
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

export async function preloadHighlighter(): Promise<void> {
  await getHighlighter();
}

export function clearHighlightCache(): void {
  highlightCache.clear();
}

export function getHighlightCacheStats(): { size: number; maxSize: number } {
  return { size: highlightCache.size, maxSize: MAX_CACHE_SIZE };
}

