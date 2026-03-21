import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CodeIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { buildSandboxHtml } from "../utils/reactSandboxTemplate";

interface ReactSandboxProps {
  code: string;
}

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

/**
 * Basic syntax pre-check for React component code.
 * Catches common structural errors before sending to iframe.
 */
function preCheckCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return "Empty component code";

  // Check for matching braces/brackets/parens
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let inString: string | null = null;
  let escaped = false;
  let inTemplate = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }

    if (inString) {
      if (ch === inString && !inTemplate) inString = null;
      if (inTemplate && ch === "`") { inString = null; inTemplate = false; }
      continue;
    }

    if (ch === '"' || ch === "'") { inString = ch; continue; }
    if (ch === "`") { inString = ch; inTemplate = true; continue; }
    if (ch === "/" && i + 1 < trimmed.length) {
      if (trimmed[i + 1] === "/") { while (i < trimmed.length && trimmed[i] !== "\n") i++; continue; }
      if (trimmed[i + 1] === "*") { i += 2; while (i < trimmed.length - 1 && !(trimmed[i] === "*" && trimmed[i + 1] === "/")) i++; i++; continue; }
    }

    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.length === 0 || stack[stack.length - 1] !== pairs[ch]) {
        return `Unmatched '${ch}' at position ${i}`;
      }
      stack.pop();
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1];
    return `Unclosed '${unclosed}' — check your brackets`;
  }

  // Check for component export pattern
  const hasExport = /export\s+default|export\s*\{/.test(trimmed);
  const hasNamedComponent = /function\s+(App|Component|Main)\b|const\s+(App|Component|Main)\s*=/.test(trimmed);
  if (!hasExport && !hasNamedComponent) {
    return "No exported component found. Use 'export default function App()' or name your component App/Component/Main.";
  }

  return null; // no error
}

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
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const srcdoc = useMemo(() => buildSandboxHtml(code, isDark), [code, isDark]);

  // Pre-check for structural errors before iframe load
  const preCheckError = useMemo(() => preCheckCode(code), [code]);

  // Stable message handler — reads expanded from ref to avoid re-registering
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate both source and origin to prevent spoofed messages from other frames/origins.
      // Sandboxed iframes with no allow-same-origin have a null origin — that is expected here.
      if (
        iframeRef.current &&
        event.source === iframeRef.current.contentWindow &&
        (event.origin === "null" || event.origin === window.location.origin)
      ) {
        const data = event.data;
        if (data && typeof data === "object") {
          if (data.type === "resize" && typeof data.height === "number") {
            const clampedHeight = Math.max(
              MIN_HEIGHT,
              Math.min(data.height + 2, expandedRef.current ? 2000 : MAX_HEIGHT)
            );
            setHeight(clampedHeight);
          } else if (data.type === "error" && typeof data.message === "string") {
            setError(data.message);
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
      {(error || preCheckError) && (
        <div className="px-4 py-2 border-b border-red-500/30 bg-red-500/10 text-xs text-red-400 font-mono whitespace-pre-wrap">
          {preCheckError || error}
        </div>
      )}

      {/* Sandboxed iframe — skip loading if pre-check failed */}
      {!preCheckError && (
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
      )}
    </div>
  );
});
