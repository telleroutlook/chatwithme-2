import { memo, useMemo, useState, lazy, Suspense, type ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  LazyMermaidRenderer,
  LazyG2ChartRenderer,
  LazyAntDesignChartsRenderer,
  parseG2SpecFromCode,
  parseAdcSpecFromCode,
} from "./LazyChartRenderer";
import { CitationCards, type CitationCardItem } from "./CitationCards";
import { HtmlDirectRenderer } from "./Renderers/HtmlDirectRenderer";
import {
  SvgRenderer,
  looksLikeSvgMarkup,
  extractFirstSvgMarkup,
} from "./Renderers/SvgRenderer";
import { MarkdownAlert, type AlertType } from "./MarkdownAlert";
import {
  decodeHtmlEntities,
  looksLikeHtmlDocument,
  stripEmptySourceMapDirectives,
} from "../utils/htmlParser";

// Lazy load CodeBlock to avoid loading Shiki highlighter on initial page load
// This reduces the initial bundle by ~800KB (vendor-highlight chunk)
const LazyCodeBlock = lazy(() =>
  import("./CodeBlock").then((mod) => ({ default: mod.CodeBlock }))
);

// Simple loading skeleton for code blocks
function CodeBlockSkeleton() {
  return (
    <div className="my-3 w-full rounded-xl ring ring-kumo-line overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-kumo-control/50 border-b border-kumo-line">
        <div className="h-3 w-16 bg-kumo-control rounded animate-pulse" />
        <div className="h-5 w-14 bg-kumo-control rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-2 bg-[var(--surface-2)]">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-4 bg-kumo-control/50 rounded animate-pulse"
            style={{ width: `${60 + Math.random() * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// Wrapper component that provides Suspense boundary
function SuspenseCodeBlock(props: {
  language: string;
  code: string;
  showCopy?: boolean;
  showLineNumbers?: boolean;
  highlights?: number[];
}) {
  return (
    <Suspense fallback={<CodeBlockSkeleton />}>
      <LazyCodeBlock {...props} />
    </Suspense>
  );
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  enableAlerts?: boolean;
  enableFootnotes?: boolean;
  streamCursor?: boolean;
  citations?: CitationCardItem[];
}

interface MarkdownPreviewRendererProps {
  code: string;
}

const MarkdownPreviewRenderer = memo(function MarkdownPreviewRenderer({
  code,
}: MarkdownPreviewRendererProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-kumo-line overflow-hidden bg-[var(--surface-elevated)]">
      <div className="px-3 py-2 text-xs text-kumo-subtle bg-kumo-control/50 border-b border-kumo-line flex items-center justify-between gap-2">
        <span>Markdown Preview</span>
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
      </div>
      {activeTab === "preview" ? (
        <div className="max-h-[600px] overflow-auto p-3">
          <MarkdownRenderer content={code} />
        </div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <SuspenseCodeBlock language="markdown" code={code} showCopy={false} />
        </div>
      )}
    </div>
  );
});

function preprocessAlerts(content: string): string {
  // Convert GitHub-style alerts to a format we can detect in blockquote
  // [!NOTE] -> **__ALERT_NOTE__** etc.
  return content.replace(
    /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/gim,
    (_match, type: string, rest: string) => `> **__ALERT_${type.toUpperCase()}__** ${rest}`
  );
}

function extractAlertType(children: React.ReactNode): { type: AlertType | null; cleanedChildren: React.ReactNode } {
  // Check if the first child contains an alert marker
  if (!children) return { type: null, cleanedChildren: children };

  const childArray = Array.isArray(children) ? children : [children];
  const firstChild = childArray[0];

  // Look for alert marker in strong element
  if (firstChild && typeof firstChild === "object" && "props" in firstChild) {
    const props = firstChild.props;
    if (props.children) {
      const text = typeof props.children === "string" ? props.children : "";
      const alertMatch = text.match(/^__ALERT_(NOTE|TIP|IMPORTANT|WARNING|CAUTION)__$/);
      if (alertMatch) {
        const alertType = alertMatch[1].toLowerCase() as AlertType;
        // Return remaining children without the alert marker
        const remainingChildren = childArray.slice(1);
        return { type: alertType, cleanedChildren: remainingChildren };
      }
    }
  }

  return { type: null, cleanedChildren: children };
}

function stripFootnotes(content: string): string {
  return content
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/^\[\^[^\]]+\]:.*$/gim, "");
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming,
  enableAlerts = true,
  enableFootnotes = true,
  streamCursor = true,
  citations = [],
}: MarkdownRendererProps) {
  const processedContent = useMemo(() => {
    let normalized = (
      content
        // Strip invisible characters that can break markdown code fence parsing.
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\r\n?/g, "\n")
        // Some model outputs place code fences after punctuation on the same line.
        .replace(/([^\n])(```[a-zA-Z]+)/g, "$1\n$2")
    );
    if (enableAlerts) {
      normalized = preprocessAlerts(normalized);
    }
    if (!enableFootnotes) {
      normalized = stripFootnotes(normalized);
    }
    return normalized;
  }, [content, enableAlerts, enableFootnotes]);

  const looksLikeMermaid = (code: string): boolean => {
    const normalized = code.trim();
    if (!normalized) return false;
    return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i.test(
      normalized
    );
  };

  return (
    <div className="markdown-content prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            return <div className="my-3 w-full">{children}</div>;
          },
          code({ className, children, ...props }) {
            const match = /language-([^\s]+)/.exec(className || "");
            const language = match ? match[1].trim().toLowerCase() : "";
            const codeString = String(children).replace(/\n$/, "");
            const isInline = !match && !codeString.includes("\n");

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-kumo-control text-kumo-default font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            // Mermaid diagrams - lazy loaded
            const isMermaidBlock =
              language === "mermaid" || language === "mmd" || looksLikeMermaid(codeString);
            if (isMermaidBlock) {
              return <LazyMermaidRenderer code={codeString} />;
            }

            // G2 charts - lazy loaded
            if (language === "g2") {
              const spec = parseG2SpecFromCode(codeString);

              if (spec) {
                return <LazyG2ChartRenderer spec={spec} />;
              }
              return <span className="text-xs app-text-danger">Invalid G2 spec</span>;
            }

            // Ant Design Charts - lazy loaded
            if (language === "adc" || language === "ant-design-charts" || language === "antd-charts") {
              const result = parseAdcSpecFromCode(codeString);

              if (result.ok && result.spec) {
                return <LazyAntDesignChartsRenderer spec={result.spec} />;
              }
              const errorMessage =
                result.error === "ADC_PARSE_INVALID_TYPE"
                  ? "Unsupported ADC chart type"
                  : result.error === "ADC_PARSE_UNSUPPORTED_CALLBACK"
                    ? "ADC callbacks are not supported"
                    : result.error === "ADC_PARSE_EMPTY"
                    ? "Empty ADC spec"
                      : "Invalid ADC JSON";
              return <span className="text-xs app-text-danger">{errorMessage}</span>;
            }

            // SVG handling
            const decodedCodeString = decodeHtmlEntities(codeString);
            const svgLikeCode = looksLikeSvgMarkup(codeString)
              ? codeString
              : looksLikeSvgMarkup(decodedCodeString)
                ? decodedCodeString
                : "";

            // HTML document handling - use new HtmlDirectRenderer (no iframe!)
            const isHtmlDocument =
              language === "html" &&
              (looksLikeHtmlDocument(codeString) || looksLikeHtmlDocument(decodedCodeString));

            const firstSvgInCode = extractFirstSvgMarkup(codeString);
            const firstSvgInDecodedCode = extractFirstSvgMarkup(decodedCodeString);
            const svgFromHtmlDocument = firstSvgInCode ?? firstSvgInDecodedCode;

            // SVG XML block
            const isSvgXmlBlock =
              (language === "xml" ||
                language === "xhtml" ||
                (language === "html" && !isHtmlDocument)) &&
              !!svgLikeCode;
            const isRawSvgBlock = language === "svg" || (!language && !!svgLikeCode);

            if (isSvgXmlBlock || isRawSvgBlock) {
              return <SvgRenderer code={svgLikeCode} />;
            }

            // HTML preview - use new Shadow DOM renderer (no iframe, auto height!)
            if (language === "html") {
              // During streaming, show code block to avoid jitter
              if (isStreaming) {
                return <SuspenseCodeBlock language={language} code={codeString} />;
              }
              // If HTML contains SVG, render both
              if (isHtmlDocument && svgFromHtmlDocument) {
                return (
                  <>
                    <HtmlDirectRenderer code={codeString} />
                    <SvgRenderer code={svgFromHtmlDocument} />
                  </>
                );
              }
              return <HtmlDirectRenderer code={codeString} />;
            }

            // Markdown preview
            if (language === "markdown" || language === "md") {
              return <MarkdownPreviewRenderer code={codeString} />;
            }

            // Default code block
            return <SuspenseCodeBlock language={language} code={codeString} />;
          },
          p({ children }) {
            return (
              <p className="mb-3 last:mb-0 leading-relaxed text-sm text-kumo-default">{children}</p>
            );
          },
          h1({ children }) {
            return (
              <h1 className="mb-4 mt-6 first:mt-0 text-xl font-semibold text-kumo-default">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mb-3 mt-5 first:mt-0 text-lg font-semibold text-kumo-default">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mb-2 mt-4 first:mt-0 text-base font-semibold text-kumo-default">
                {children}
              </h3>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm text-kumo-default">{children}</li>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-kumo-accent hover:underline"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            const { type: alertType, cleanedChildren } = extractAlertType(children);

            if (alertType) {
              return <MarkdownAlert type={alertType}>{cleanedChildren}</MarkdownAlert>;
            }

            return (
              <blockquote className="border-l-4 border-kumo-accent/50 pl-4 py-1 my-3 bg-kumo-control/30 rounded-r">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-4 border-kumo-line" />;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border border-kumo-line rounded">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-kumo-control/50">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-4 py-2 text-left text-sm font-semibold border-b border-kumo-line">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-2 text-sm border-b border-kumo-line last:border-b-0">
                {children}
              </td>
            );
          },
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
          del({ children }) {
            return <del className="line-through opacity-70">{children}</del>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
      {isStreaming && streamCursor && (
        <span className="inline-block w-0.5 h-[1em] bg-kumo-brand ml-0.5 animate-blink-cursor" />
      )}
      <CitationCards items={citations} />
    </div>
  );
});
