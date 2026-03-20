import { memo, useMemo } from "react";

interface SvgRendererProps {
  code: string;
  showControls?: boolean;
}

/**
 * Sanitize SVG markup by removing invalid attributes
 */
function sanitizeSvgMarkup(raw: string): string {
  if (!raw) return raw;
  let output = raw;
  // Remove invalid stroke-width and height attributes
  output = output.replace(
    /\s(stroke-width|height)\s*=\s*["']\s*(?:undefined|null|NaN)?\s*["']/gi,
    ""
  );
  // Clean up style attributes with invalid values
  output = output.replace(
    /\sstyle\s*=\s*["']([^"']*)["']/gi,
    (_match, styleContent: string) => {
      const cleaned = styleContent
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry) => {
          if (!/^(stroke-width|height)\s*:/i.test(entry)) return true;
          const value = entry.split(":").slice(1).join(":").trim();
          if (!value) return false;
          if (/^(undefined|null|NaN)$/i.test(value)) return false;
          return true;
        })
        .join("; ");
      return cleaned ? ` style="${cleaned}"` : "";
    }
  );
  return output;
}

/**
 * Check if content looks like SVG markup
 */
export function looksLikeSvgMarkup(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith("<svg") || normalized.includes("<svg ");
}

/**
 * Extract first SVG markup from HTML content
 */
export function extractFirstSvgMarkup(code: string): string | null {
  if (!code) return null;
  const match = code.match(/<svg\b[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

/**
 * SvgRenderer - Renders SVG content as inline image
 *
 * Key features:
 * - Auto height (no fixed height)
 * - Responsive width
 * - Safe rendering
 */
export const SvgRenderer = memo(function SvgRenderer({
  code,
  showControls = true,
}: SvgRendererProps) {
  const sanitizedSvg = useMemo(() => sanitizeSvgMarkup(code), [code]);

  const svgDataUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedSvg)}`,
    [sanitizedSvg]
  );

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      {showControls && (
        <div className="px-3 py-2 text-xs text-foreground-muted bg-muted/50 border-b border-border flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span>SVG Preview</span>
        </div>
      )}
      <div className="bg-surface p-4 flex items-center justify-center overflow-x-auto">
        <img
          src={svgDataUrl}
          alt="SVG Preview"
          className="block h-auto max-w-full object-contain"
          style={{ maxHeight: 600 }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
});
