import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { buildSandboxHtml } from "../utils/reactSandboxTemplate";

interface ReactSandboxProps {
  code: string;
}

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

/**
 * Renders arbitrary React component code inside a sandboxed iframe.
 *
 * Security model:
 * - `sandbox="allow-scripts"` (no `allow-same-origin`)
 * - Null origin prevents access to parent cookies, localStorage, DOM
 * - CSP meta tag restricts script/style sources to CDN
 */
export const ReactSandbox = memo(function ReactSandbox({ code }: ReactSandboxProps) {
  const isDark = useThemeDetector();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const srcdoc = useMemo(() => buildSandboxHtml(code, isDark), [code, isDark]);

  // Listen for postMessage from iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Since sandbox has no allow-same-origin, event.origin will be "null"
      // We verify by checking the iframe's contentWindow
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const data = event.data;
        if (data && typeof data === "object") {
          if (data.type === "resize" && typeof data.height === "number") {
            const clampedHeight = Math.max(
              MIN_HEIGHT,
              Math.min(data.height + 2, expanded ? 2000 : MAX_HEIGHT)
            );
            setHeight(clampedHeight);
          } else if (data.type === "error" && typeof data.message === "string") {
            setError(data.message);
          }
        }
      }
    },
    [expanded]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Reset error when code changes
  useEffect(() => {
    setError(null);
  }, [code]);

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-foreground-muted">
          <CodeIcon size={14} weight="bold" />
          <span>React Component</span>
        </div>
        <div className="flex items-center gap-1">
          {error && (
            <span className="text-[10px] text-red-400 mr-2 truncate max-w-[200px]" title={error}>
              Error
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded text-foreground-muted hover:text-foreground hover:bg-muted/80 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            <ArrowsOutIcon size={12} />
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* Error overlay (shown above iframe) */}
      {error && (
        <div className="px-4 py-2 border-b border-red-500/30 bg-red-500/10 text-xs text-red-400 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* Sandboxed iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        title="React Component Sandbox"
        className="w-full border-0"
        style={{
          height: `${height}px`,
          minHeight: `${MIN_HEIGHT}px`,
          backgroundColor: isDark ? "#111827" : "#ffffff",
          colorScheme: isDark ? "dark" : "light",
        }}
      />
    </div>
  );
});
