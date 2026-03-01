import { memo, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CodeBlock } from "./CodeBlock";
import { MermaidRenderer, G2ChartRenderer, parseG2SpecFromCode } from "./ChartRenderer";
import { CitationCards, type CitationCardItem } from "./CitationCards";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  enableAlerts?: boolean;
  enableFootnotes?: boolean;
  streamCursor?: boolean;
  citations?: CitationCardItem[];
}

interface HtmlPreviewRendererProps {
  code: string;
}
interface SvgPreviewRendererProps {
  code: string;
}
interface MarkdownPreviewRendererProps {
  code: string;
}

const HTML_PREVIEW_HEIGHT = 560;
type HtmlPreviewTab = "preview" | "code";
type MarkdownPreviewTab = "preview" | "code";

function looksLikeSvgMarkup(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith("<svg") || normalized.includes("<svg ");
}

function decodeHtmlEntities(value: string): string {
  if (!value || !value.includes("&")) return value;
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function looksLikeHtmlDocument(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.includes("<html") ||
    normalized.includes("<head") ||
    normalized.includes("<body")
  );
}

function extractFirstSvgMarkup(code: string): string | null {
  if (!code) return null;
  const match = code.match(/<svg\b[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

function stripEmptySourceMapDirectives(code: string): string {
  if (!code || !code.includes("sourceMappingURL")) return code;
  return code
    .replace(/^[\t ]*\/\/[#@]\s*sourceMappingURL=.*$/gim, "")
    .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
    .replace(/<!--\s*[#@]?\s*sourceMappingURL=.*?-->/gim, "");
}

function sanitizeSvgMarkup(raw: string): string {
  if (!raw) return raw;
  let output = raw;
  output = output.replace(
    /\s(stroke-width|height)\s*=\s*["']\s*(?:undefined|null|NaN)?\s*["']/gi,
    ""
  );
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

function createPreviewSrcDoc(code: string): string {
  const sanitizedCode = stripEmptySourceMapDirectives(code);
  if (looksLikeHtmlDocument(sanitizedCode)) {
    return sanitizedCode;
  }
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{margin:0;padding:8px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}</style></head><body>${sanitizedCode}</body></html>`;
}

const HtmlPreviewRenderer = memo(function HtmlPreviewRenderer({ code }: HtmlPreviewRendererProps) {
  const [activeTab, setActiveTab] = useState<HtmlPreviewTab>("preview");
  const [previewReady, setPreviewReady] = useState(false);
  const srcDoc = createPreviewSrcDoc(code);

  useEffect(() => {
    if (activeTab !== "preview") {
      setPreviewReady(false);
      return;
    }

    let timeoutId = 0;
    const rafId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        setPreviewReady(true);
      }, 0);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeTab, srcDoc]);

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-kumo-line overflow-hidden bg-[var(--surface-elevated)]">
      <div className="px-3 py-2 text-xs text-kumo-subtle bg-kumo-control/50 border-b border-kumo-line flex items-center justify-between gap-2">
        <span>HTML Preview</span>
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
        previewReady ? (
          <iframe
            title="HTML Preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            scrolling="auto"
            className="block w-full border-0 bg-[var(--surface-1)]"
            style={{ height: HTML_PREVIEW_HEIGHT }}
          />
        ) : (
          <div
            className="block w-full bg-[var(--surface-1)]"
            style={{ height: HTML_PREVIEW_HEIGHT }}
          />
        )
      ) : (
        <pre className="!m-0 max-h-[560px] overflow-auto bg-[var(--surface-1)] p-3 text-xs text-kumo-default">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});

function SvgPreviewRenderer({ code }: SvgPreviewRendererProps) {
  const sanitizedSvg = useMemo(() => sanitizeSvgMarkup(code), [code]);
  const svgDataUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedSvg)}`,
    [sanitizedSvg]
  );

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-kumo-line overflow-hidden bg-[var(--surface-elevated)]">
      <div className="px-3 py-2 text-xs text-kumo-subtle bg-kumo-control/50 border-b border-kumo-line">
        SVG Preview
      </div>
      <div className="bg-[var(--surface-1)] p-2">
        <img
          src={svgDataUrl}
          alt="SVG Preview"
          className="block h-auto w-full"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}

const MARKDOWN_PREVIEW_HEIGHT = 560;

const MarkdownPreviewRenderer = memo(function MarkdownPreviewRenderer({
  code
}: MarkdownPreviewRendererProps) {
  const [activeTab, setActiveTab] = useState<MarkdownPreviewTab>("preview");

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
        <div className="max-h-[560px] overflow-auto p-3">
          <MarkdownRenderer content={code} />
        </div>
      ) : (
        <pre
          className="!m-0 max-h-[560px] overflow-auto bg-[var(--surface-1)] p-3 text-xs text-kumo-default"
          style={{ minHeight: MARKDOWN_PREVIEW_HEIGHT }}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});

function preprocessAlerts(content: string): string {
  return content.replace(
    /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gim,
    (_match, type: string) => `> **${type.toUpperCase()}**`
  );
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
  citations = []
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

            const isMermaidBlock =
              language === "mermaid" || language === "mmd" || looksLikeMermaid(codeString);
            if (isMermaidBlock) {
              return <MermaidRenderer code={codeString} />;
            }

            if (language === "g2") {
              const spec = parseG2SpecFromCode(codeString);
              if (spec) {
                return <G2ChartRenderer spec={spec} />;
              }
              return <span className="text-xs app-text-danger">Invalid G2 spec</span>;
            }

            const decodedCodeString = decodeHtmlEntities(codeString);
            const svgLikeCode = looksLikeSvgMarkup(codeString)
              ? codeString
              : looksLikeSvgMarkup(decodedCodeString)
                ? decodedCodeString
                : "";
            const isHtmlDocument =
              language === "html" &&
              (looksLikeHtmlDocument(codeString) || looksLikeHtmlDocument(decodedCodeString));
            const firstSvgInCode = extractFirstSvgMarkup(codeString);
            const firstSvgInDecodedCode = extractFirstSvgMarkup(decodedCodeString);
            const svgFromHtmlDocument = firstSvgInCode ?? firstSvgInDecodedCode;
            const isSvgXmlBlock =
              (language === "xml" || language === "xhtml" || (language === "html" && !isHtmlDocument)) &&
              !!svgLikeCode;
            const isRawSvgBlock = language === "svg" || (!language && !!svgLikeCode);
            if (isSvgXmlBlock || isRawSvgBlock) {
              return <SvgPreviewRenderer code={svgLikeCode} />;
            }

            if (language === "html") {
              if (isStreaming) {
                return <CodeBlock language={language} code={codeString} />;
              }
              if (isHtmlDocument && svgFromHtmlDocument) {
                return (
                  <>
                    <HtmlPreviewRenderer code={codeString} />
                    <SvgPreviewRenderer code={svgFromHtmlDocument} />
                  </>
                );
              }
              return <HtmlPreviewRenderer code={codeString} />;
            }

            if (language === "markdown" || language === "md") {
              return <MarkdownPreviewRenderer code={codeString} />;
            }

            return <CodeBlock language={language} code={codeString} />;
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
          }
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
