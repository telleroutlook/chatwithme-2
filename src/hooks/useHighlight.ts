import { useState, useEffect, useMemo, useRef } from 'react';

// ============ Types ============

type BundledLanguage = string;
type BundledTheme = string;
type Highlighter = Awaited<ReturnType<typeof import('shiki').createHighlighter>>;

// ============ Cache Management ============

interface CacheEntry {
  html: string;
  timestamp: number;
}

const highlightCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(code: string, lang: string, theme: string): string {
  // Simple hash function for cache key
  let hash = 0;
  const str = `${lang}:${theme}:${code}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
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

  // If still over limit, remove oldest entries
  if (highlightCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(highlightCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, highlightCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      highlightCache.delete(key);
    }
  }
}

// ============ Singleton Highlighter (Lazy Load) ============

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    throw new Error('Shiki can only be used in browser environment');
  }

  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (highlighterPromise) {
    return highlighterPromise;
  }

  // Dynamic import to avoid bundling shiki in SSR/Worker
  highlighterPromise = import('shiki').then(({ createHighlighter }) =>
    createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'javascript',
        'typescript',
        'jsx',
        'tsx',
        'python',
        'rust',
        'go',
        'java',
        'c',
        'cpp',
        'csharp',
        'ruby',
        'php',
        'swift',
        'kotlin',
        'scala',
        'html',
        'css',
        'scss',
        'json',
        'yaml',
        'markdown',
        'bash',
        'shell',
        'sql',
        'graphql',
        'docker',
        'toml',
        'ini',
        'diff',
      ],
    })
  ).then((highlighter) => {
    highlighterInstance = highlighter;
    return highlighter;
  });

  return highlighterPromise;
}

// ============ Hook ============

interface UseHighlightOptions {
  language?: string;
  theme?: BundledTheme;
  enabled?: boolean;
}

interface UseHighlightResult {
  html: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for syntax highlighting using Shiki with caching
 *
 * Features:
 * - LRU cache with TTL for highlighted code
 * - Singleton highlighter instance for performance
 * - Automatic language detection fallback
 * - Theme support (dark/light)
 */
export function useHighlight(
  code: string,
  options: UseHighlightOptions = {}
): UseHighlightResult {
  const {
    language = 'text',
    theme = 'github-dark',
    enabled = true,
  } = options;

  const [html, setHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const currentCodeRef = useRef(code);

  // Normalize language name
  const normalizedLang = useMemo(() => {
    const langMap: Record<string, BundledLanguage> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'sh': 'shell',
      'yml': 'yaml',
      'md': 'markdown',
      'csharp': 'c#',
      'cs': 'c#',
    };
    return langMap[language.toLowerCase()] || language.toLowerCase() as BundledLanguage;
  }, [language]);

  useEffect(() => {
    if (!enabled || !code) {
      setHtml(null);
      return;
    }

    // Track current code to avoid stale updates
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
      .then((highlighter) => {
        // Check if code has changed while we were loading
        if (currentCodeRef.current !== code) {
          return;
        }

        let result: string;

        try {
          // Try with the specified language
          result = highlighter.codeToHtml(code, {
            lang: normalizedLang as BundledLanguage,
            theme,
          });
        } catch {
          // Fallback to text if language not supported
          try {
            result = highlighter.codeToHtml(code, {
              lang: 'text',
              theme,
            });
          } catch (e) {
            throw new Error(`Failed to highlight code: ${e}`);
          }
        }

        // Cache the result
        highlightCache.set(cacheKey, {
          html: result,
          timestamp: Date.now(),
        });

        // Periodic cleanup
        if (highlightCache.size > MAX_CACHE_SIZE / 2) {
          cleanupCache();
        }

        setHtml(result);
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
  }, [code, normalizedLang, theme, enabled]);

  return { html, isLoading, error };
}

// ============ Utility Functions ============

/**
 * Preload the highlighter for faster first render
 */
export function preloadHighlighter(): Promise<void> {
  return getHighlighter().then(() => {});
}

/**
 * Clear the highlight cache
 */
export function clearHighlightCache(): void {
  highlightCache.clear();
}

/**
 * Get cache statistics
 */
export function getHighlightCacheStats(): { size: number; maxSize: number } {
  return {
    size: highlightCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}
