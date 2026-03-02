import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Surface, Button } from "@cloudflare/kumo";
import { CopyIcon, CheckIcon, CodeIcon } from "@phosphor-icons/react";
import {
  parseHtmlDocument,
  looksLikeHtmlDocument,
  sanitizeHtmlContent,
  stripEmptySourceMapDirectives,
} from "../../utils/htmlParser";
import { CodeBlock } from "../CodeBlock";

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
      .map((href) => `<link rel="stylesheet" href="${href}">`)
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
    return <CodeBlock language="html" code={code} />;
  }

  return (
    <Surface className="my-3 w-full not-prose rounded-xl ring ring-kumo-line overflow-hidden bg-[var(--surface-elevated)]">
      {/* Header */}
      <div className="px-3 py-2 text-xs text-kumo-subtle bg-kumo-control/50 border-b border-kumo-line flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CodeIcon size={14} />
          <span>HTML Preview</span>
          {parsed.isFullDocument && (
            <span className="px-1.5 py-0.5 rounded bg-kumo-brand/20 text-kumo-brand text-[10px]">
              Full Document
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showCodeToggle && (
            <div className="inline-flex items-center rounded-md border border-kumo-line p-0.5">
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] ${
                  activeTab === "code" ? "bg-kumo-control text-kumo-default" : "text-kumo-subtle"
                }`}
                onClick={() => setActiveTab("code")}
              >
                Code
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] ${
                  activeTab === "preview" ? "bg-kumo-control text-kumo-default" : "text-kumo-subtle"
                }`}
                onClick={() => setActiveTab("preview")}
              >
                Preview
              </button>
            </div>
          )}
          <Button
            variant="secondary"
            size="xs"
            onClick={handleCopy}
            icon={copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "preview" ? (
        <div
          ref={containerRef}
          className="html-preview-content bg-[var(--surface-1)]"
          style={{ minHeight: 100 }}
        />
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <CodeBlock language="html" code={code} showCopy={false} />
        </div>
      )}
    </Surface>
  );
});
