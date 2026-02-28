import { useState, useCallback, useMemo, useEffect } from "react";
import { Surface, Button } from "@cloudflare/kumo";
import { CopyIcon, CheckIcon, CodeIcon } from "@phosphor-icons/react";
import { useHighlight, preloadHighlighter } from "../hooks/useHighlight";

interface CodeBlockProps {
  language: string;
  code: string;
  showCopy?: boolean;
  showLineNumbers?: boolean;
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

export function CodeBlock({
  language,
  code,
  showCopy = true,
  showLineNumbers = false
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isDark = useIsDarkMode();
  const theme = isDark ? "github-dark" : "github-light";

  // Preload highlighter on mount
  useEffect(() => {
    preloadHighlighter();
  }, []);

  const { html, isLoading, error } = useHighlight(code, {
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
    <Surface className="my-3 w-full rounded-xl ring ring-kumo-line overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-kumo-control/50 border-b border-kumo-line">
        <div className="flex items-center gap-2">
          <CodeIcon size={14} className="text-kumo-subtle" />
          <span className="text-xs text-kumo-subtle font-mono">
            {displayLanguage}
          </span>
        </div>
        {showCopy && (
          <Button
            variant="secondary"
            size="xs"
            onClick={handleCopy}
            icon={copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto bg-[var(--surface-2)]">
        {isLoading && (
          <div className="p-4 text-sm text-kumo-subtle">
            Loading syntax highlight...
          </div>
        )}
        {error && (
          <pre className="!mt-0 !mb-0 p-4 text-sm app-text-danger">
            {code}
          </pre>
        )}
        {html && !isLoading && !error && (
          <div
            className="shiki-container p-4 [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!bg-transparent [&_code]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {!html && !isLoading && !error && (
          <pre className="!mt-0 !mb-0 p-4 text-sm">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </Surface>
  );
}
