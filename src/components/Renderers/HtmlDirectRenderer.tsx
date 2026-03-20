import { memo, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { CopyIcon, CheckIcon, CodeIcon } from "@phosphor-icons/react";
import {
  parseHtmlDocument,
  looksLikeHtmlDocument,
  sanitizeHtmlContent,
  stripEmptySourceMapDirectives,
} from "../../utils/htmlParser";

// Lazy load CodeBlock to avoid loading Shiki on initial page load
const LazyCodeBlock = lazy(() =>
  import("../CodeBlock").then((mod) => ({ default: mod.CodeBlock }))
);

// Simple loading skeleton for code blocks
function CodeBlockSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted/50 rounded animate-pulse"
          style={{ width: `${60 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  );
}

interface HtmlDirectRendererProps {
  code: string;
  showCodeToggle?: boolean;
  isStreaming?: boolean;
}

type TabType = "preview" | "code";

/**
 * HtmlDirectRenderer - Renders HTML content with Shadow DOM isolation
 *
 * Key features:
 * - Shadow DOM for style isolation
 * - Auto height (no fixed height)
 * - Safe rendering (sanitizes dangerous elements)
 * - Preview/Code toggle
 */
export const HtmlDirectRenderer = memo(function HtmlDirectRenderer({
  code,
  showCodeToggle = true,
  isStreaming = false,
}: HtmlDirectRendererProps) {
  const [activeTab, setActiveTab] = useState<TabType>("preview");
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const [copied, setCopied] = useState(false);

  // Parse and sanitize HTML document
  const parsed = useMemo(() => {
    const sanitizedCode = stripEmptySourceMapDirectives(code);
    const isFullDocument = looksLikeHtmlDocument(sanitizedCode);

    let styles: string[] = [];
    let externalStyles: string[] = [];
    let bodyContent: string;

    if (isFullDocument) {
      const parsedDoc = parseHtmlDocument(sanitizedCode);
      styles = parsedDoc.styles;
      externalStyles = parsedDoc.externalStyles;
      bodyContent = parsedDoc.bodyContent;
    } else {
      // For partial HTML, use the content directly
      bodyContent = sanitizedCode;
    }

    // Sanitize the body content
    const sanitizedBody = sanitizeHtmlContent(bodyContent);

    return { styles, externalStyles, sanitizedBody, isFullDocument };
  }, [code]);

  // Inject styles and content into Shadow DOM
  useEffect(() => {
    if (!containerRef.current || activeTab !== "preview") return;

    // Create Shadow DOM if it doesn't exist
    if (!shadowRootRef.current) {
      shadowRootRef.current = containerRef.current.attachShadow({ mode: "open" });
    }

    const shadow = shadowRootRef.current;

    // Build the shadow DOM content
    const styleContent = parsed.styles.join("\n");
    const externalStyleLinks = parsed.externalStyles
      .filter((href) => {
        try {
          const url = new URL(href);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      })
      .map((href) => `<link rel="stylesheet" href="${href.replace(/"/g, "&quot;")}">`)
      .join("\n");

    shadow.innerHTML = `
      <style>
        /* Reset and base styles */
        :host {
          all: initial;
          display: block;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color-scheme: light dark;
        }

        /* Container styling */
        .html-content {
          padding: 16px;
          min-height: 100px;
          line-height: 1.6;
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .html-content {
            background: #1a1a1a;
            color: #e5e5e5;
          }
        }

        @media (prefers-color-scheme: light) {
          .html-content {
            background: #ffffff;
            color: #1a1a1a;
          }
        }

        /* User styles */
        ${styleContent}
      </style>
      ${externalStyleLinks}
      <div class="html-content">${parsed.sanitizedBody}</div>
    `;
  }, [parsed, activeTab]);

  // Copy handler
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // During streaming, show code block to avoid jitter
  if (isStreaming && activeTab === "preview") {
    return (
      <Suspense fallback={<CodeBlockSkeleton />}>
        <LazyCodeBlock language="html" code={code} />
      </Suspense>
    );
  }

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="px-3 py-2 text-xs text-foreground-muted bg-muted/50 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CodeIcon size={14} />
          <span>HTML Preview</span>
          {parsed.isFullDocument && (
            <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px]">
              Full Document
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showCodeToggle && (
            <div className="inline-flex items-center rounded-md border border-border p-0.5">
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] ${
                  activeTab === "code" ? "bg-muted text-foreground" : "text-foreground-muted"
                }`}
                onClick={() => setActiveTab("code")}
              >
                Code
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] ${
                  activeTab === "preview" ? "bg-muted text-foreground" : "text-foreground-muted"
                }`}
                onClick={() => setActiveTab("preview")}
              >
                Preview
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground-muted border border-border bg-muted/50 hover:bg-muted transition-colors"
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "preview" ? (
        <div
          ref={containerRef}
          className="html-preview-content bg-surface"
          style={{ minHeight: 100 }}
        />
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <Suspense fallback={<CodeBlockSkeleton />}>
            <LazyCodeBlock language="html" code={code} showCopy={false} />
          </Suspense>
        </div>
      )}
    </div>
  );
});
