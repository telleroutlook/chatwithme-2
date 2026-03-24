import { useState, useCallback, useEffect, memo, useMemo } from "react";
import { cn } from "./ui/utils";
import { CopyIcon, CheckIcon, CodeIcon } from "@phosphor-icons/react";
import { useShikiHighlight } from "../hooks/useShikiHighlight";

interface CodeBlockProps {
  language: string;
  code: string;
  showCopy?: boolean;
  showLineNumbers?: boolean;
  highlights?: number[];
}

// Detect if dark mode is active
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const checkDark = () => {
      const html = document.documentElement;
      const explicitMode = html.getAttribute("data-mode");
      if (explicitMode === "dark") {
        return true;
      }
      if (explicitMode === "light") {
        return false;
      }
      return mediaQuery.matches;
    };

    setIsDark(checkDark());

    const observer = new MutationObserver(() => {
      setIsDark(checkDark());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });

    const onChange = () => setIsDark(checkDark());
    mediaQuery.addEventListener("change", onChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  return isDark;
}

// Stable skeleton widths — avoids non-deterministic re-renders from Math.random()
const SKELETON_WIDTHS = ["90%", "75%", "85%", "65%", "80%"] as const;

// Loading skeleton for code block
function CodeSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted/50 rounded animate-pulse"
          style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}

export const CodeBlock = memo(function CodeBlock({
  language,
  code,
  showCopy = true,
  showLineNumbers = false,
  highlights: _highlights = [],
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isDark = useIsDarkMode();
  const theme = isDark ? "github-dark" : "github-light";

  const { html, isLoading, error } = useShikiHighlight(code, {
    language,
    theme,
    enabled: !!code,
  });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  // Line numbers generation
  const lineNumbers = useMemo(() => {
    if (!showLineNumbers || !code) return null;
    const lines = code.split("\n");
    return lines.map((_, i) => i + 1).join("\n");
  }, [code, showLineNumbers]);

  // Display language name
  const displayLanguage = language || "text";

  return (
    <div className="my-3 w-full rounded-xl border border-border bg-surface-elevated ring ring-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <CodeIcon size={14} className="text-foreground-muted" />
          <span className="text-xs text-foreground-muted font-mono">{displayLanguage}</span>
        </div>
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
              "border border-border bg-surface-elevated hover:bg-muted text-foreground h-6 px-2",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <span className="shrink-0">{copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}</span>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {/* Code content */}
      <div className="overflow-x-auto bg-surface-secondary">
        {/* Loading state */}
        {isLoading && <CodeSkeleton lines={Math.min(code.split("\n").length, 10)} />}

        {/* Error state - fallback to plain text */}
        {error && (
          <pre className="!mt-0 !mb-0 p-4 text-sm text-foreground">
            <code>{code}</code>
          </pre>
        )}

        {/* Highlighted code from Shiki */}
        {html && !isLoading && !error && (
          <div
            className="shiki-container p-4 [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!bg-transparent [&_code]:!bg-transparent [&_.shiki]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {/* Fallback for empty state */}
        {!html && !isLoading && !error && (
          <pre className="!mt-0 !mb-0 p-4 text-sm text-foreground">
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* Line numbers sidebar (optional) */}
      {showLineNumbers && lineNumbers && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-muted/30 border-r border-border overflow-hidden pointer-events-none">
          <pre className="p-4 text-xs text-foreground-muted text-right">{lineNumbers}</pre>
        </div>
      )}
    </div>
  );
});
