/**
 * Snippet extraction utilities for live progress feed.
 */

export const SNIPPET_MAX_LENGTH = 72;
export const SNIPPET_THROTTLE_MS = 700;
export const SNIPPET_MIN_LENGTH_TO_EMIT = 8;

/**
 * Extract readable snippet from accumulated text, cleaning markdown noise.
 * - Removes code blocks and inline code
 * - Preserves link text while removing URL syntax
 * - Compresses whitespace and truncates to max length
 */
export function extractSnippet(text: string, maxLength = SNIPPET_MAX_LENGTH): string {
  if (!text || !text.trim()) return "";

  const snippet = text
    // Remove fenced code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`[^`]+`/g, "")
    // Remove link syntax, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Compress multiple whitespace to single space
    .replace(/\s+/g, " ")
    .trim();

  if (snippet.length <= maxLength) return snippet;
  return snippet.slice(0, maxLength - 3) + "...";
}
