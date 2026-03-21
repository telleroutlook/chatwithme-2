import { memo, useMemo, useState, lazy, Suspense, type ReactNode, Children, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  LazyMermaidRenderer,
  LazyAntDesignChartsRenderer,
  LazyEChartsRenderer,
  LazyVegaLiteRenderer,
  LazyStatCardRenderer,
  LazyMarkmapRenderer,
  LazyDashboardRenderer,
  LazyExcalidrawRenderer,
  LazyReactSandbox,
  parseAdcSpecFromCode,
  parseEChartsSpecFromCode,
  parseVegaLiteSpecFromCode,
  parseStatCardData,
  parseDashboardSpec,
  parseExcalidrawData,
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
} from "../utils/htmlParser";
import { ErrorBoundary } from "./ErrorBoundary";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { sanitizeMermaidCode, validateMermaidCode } from "../utils/mermaidValidator";
import { InteractiveTable } from "./InteractiveTable";
import { isChartLanguage, detectChartTypeFromPartial, isJsonComplete } from "../utils/streamingChartDetector";
import { ChartTypeSkeleton } from "./skeletons";

// Lazy load CodeBlock to avoid loading Shiki highlighter on initial page load
// This reduces the initial bundle by ~800KB (vendor-highlight chunk)
const LazyCodeBlock = lazy(() =>
  import("./CodeBlock").then((mod) => ({ default: mod.CodeBlock }))
);

// Simple loading skeleton for code blocks
function CodeBlockSkeleton() {
  return (
    <div className="my-3 w-full rounded-xl ring ring-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
        <div className="h-5 w-14 bg-muted rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-2 bg-surface-secondary">
        {(["85%", "70%", "60%"] as const).map((w, i) => (
          <div
            key={i}
            className="h-4 bg-muted/50 rounded animate-pulse"
            style={{ width: w }}
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

function InvalidChartSpec({ message, code }: { message: string; code: string }) {
  return (
    <div className="my-2 rounded-lg border app-border-danger-soft app-bg-danger-soft p-3 text-xs">
      <span className="app-text-danger">{message}</span>
      <details className="mt-2">
        <summary className="cursor-pointer text-foreground-muted">View original spec</summary>
        <pre className="mt-2 max-h-52 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-foreground">
          {code}
        </pre>
      </details>
    </div>
  );
}

/**
 * Wrapper for Mermaid mindmap diagrams that offers a toggle to switch
 * to the interactive markmap renderer.
 */
function MermaidMindmapWithToggle({ mermaidCode, rawCode }: { mermaidCode: string; rawCode: string }) {
  const [useMarkmap, setUseMarkmap] = useState(false);

  // Convert Mermaid mindmap syntax to markmap-compatible markdown.
  // Mermaid mindmap uses indentation-based hierarchy after the `mindmap` keyword.
  const markmapCode = useMemo(() => {
    const lines = rawCode.split("\n");
    // Strip the leading `mindmap` keyword line
    const contentLines = lines.filter((l) => !/^\s*mindmap\b/i.test(l));
    return contentLines.join("\n");
  }, [rawCode]);

  if (useMarkmap) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setUseMarkmap(false)}
          className="absolute top-2 left-2 z-20 px-2 py-1 text-[10px] font-medium rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
        >
          Switch to static Mermaid
        </button>
        <ErrorBoundary
          level="chart"
          fallback={<InvalidChartSpec message="Invalid mind map" code={rawCode} />}
          onError={(error) =>
            trackChatEvent("chart_render_failure", { engine: "markmap", errorCode: error.message })
          }
        >
          <LazyMarkmapRenderer code={markmapCode} />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setUseMarkmap(true)}
        className="absolute top-2 left-24 z-20 px-2 py-1 text-[10px] font-medium rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
      >
        Switch to interactive mindmap
      </button>
      <ErrorBoundary
        level="chart"
        fallback={<InvalidChartSpec message="Invalid Mermaid spec" code={rawCode} />}
        onError={(error) =>
          trackChatEvent("chart_render_failure", { engine: "mermaid", errorCode: error.message })
        }
      >
        <LazyMermaidRenderer code={mermaidCode} />
      </ErrorBoundary>
    </div>
  );
}

const MarkdownPreviewRenderer = memo(function MarkdownPreviewRenderer({
  code,
}: MarkdownPreviewRendererProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      <div className="px-3 py-2 text-xs text-foreground-muted bg-muted/50 border-b border-border flex items-center justify-between gap-2">
        <span>Markdown Preview</span>
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

function looksLikeMermaid(code: string): boolean {
  const normalized = code.trim();
  if (!normalized) return false;
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i.test(
    normalized
  );
}

// ---------------------------------------------------------------------------
// Table data extraction helpers — used to convert react-markdown's nested
// React element tree (table > thead/tbody > tr > th/td) into plain arrays
// that <InteractiveTable> can consume.
// ---------------------------------------------------------------------------

/** Shape of props we expect on react-markdown table elements. */
interface WithChildren {
  children?: ReactNode;
}

/** Type-safe accessor for element props in React 19 (where props are `unknown`). */
function getChildren(element: React.ReactElement): ReactNode {
  return (element.props as WithChildren).children;
}

/** Recursively extract text content from a React node tree. */
function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    return extractText(getChildren(node));
  }
  return "";
}

/** Walk the React element children of a <table> and pull out header + row data. */
function extractTableData(children: ReactNode): { headers: string[]; rows: string[][] } {
  const headers: string[] = [];
  const rows: string[][] = [];

  // children of <table> should be <thead> and <tbody> (or direct <tr>s)
  Children.forEach(children, (section) => {
    if (!isValidElement(section)) return;
    const sectionType = section.type;
    const isThead =
      sectionType === "thead" || (typeof sectionType === "function" && (sectionType as { displayName?: string }).displayName === "thead");
    const isTbody =
      sectionType === "tbody" || (typeof sectionType === "function" && (sectionType as { displayName?: string }).displayName === "tbody");

    Children.forEach(getChildren(section), (tr) => {
      if (!isValidElement(tr)) return;
      const cells: string[] = [];
      Children.forEach(getChildren(tr), (cell) => {
        if (!isValidElement(cell)) return;
        cells.push(extractText(getChildren(cell)).trim());
      });

      if (isThead || (!isTbody && headers.length === 0 && cells.length > 0)) {
        // First row goes to headers if we haven't collected headers yet
        if (headers.length === 0) {
          headers.push(...cells);
        }
      } else {
        rows.push(cells);
      }
    });
  });

  return { headers, rows };
}

/** Smart table: upgrades to InteractiveTable for large tables. */
function SmartTable({ children }: { children?: ReactNode }) {
  const { headers, rows } = useMemo(
    () => extractTableData(children),
    [children],
  );

  // For small tables (<=3 data rows), render the original markdown table
  if (rows.length <= 3 || headers.length === 0) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-border rounded">{children}</table>
      </div>
    );
  }

  return <InteractiveTable headers={headers} rows={rows} />;
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

  return (
    <div className="markdown-content max-w-none">
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
                  className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            // -----------------------------------------------------------------
            // Streaming chart guard: while the AI is still generating a
            // chart code block, the content is incomplete. Rendering
            // incomplete markup causes errors and flicker.
            //
            // Strategy:
            //  - Mermaid / mindmap: show the raw code block so users can see
            //    progress in real time. The chart renders once streaming ends.
            //  - JSON-based blocks (adc, echarts, etc.): show a type-aware
            //    skeleton until JSON.parse succeeds.
            // -----------------------------------------------------------------
            if (isStreaming && isChartLanguage(language)) {
              const isMermaidLang = language === "mermaid" || language === "mmd";
              const isMindmapLang = language === "mindmap";

              if (isMermaidLang || isMindmapLang) {
                // Show raw code during streaming so user sees progress;
                // chart will render once streaming completes.
                return <SuspenseCodeBlock language={isMermaidLang ? "mermaid" : "markdown"} code={codeString} />;
              } else {
                // JSON-based chart blocks (adc, echarts, stat, dashboard, excalidraw)
                if (!isJsonComplete(codeString)) {
                  const detected = detectChartTypeFromPartial(language, codeString);
                  return <ChartTypeSkeleton type={detected.subtype} />;
                }
                // JSON is complete — fall through to normal chart rendering
              }
            }

            // Interactive mind map via markmap (```mindmap code blocks)
            if (language === "mindmap") {
              return (
                <ErrorBoundary
                  level="chart"
                  fallback={<InvalidChartSpec message="Invalid mind map" code={codeString} />}
                  onError={(error) =>
                    trackChatEvent("chart_render_failure", { engine: "markmap", errorCode: error.message })
                  }
                >
                  <LazyMarkmapRenderer code={codeString} />
                </ErrorBoundary>
              );
            }

            // Mermaid diagrams - lazy loaded
            const isMermaidBlock =
              language === "mermaid" || language === "mmd" || looksLikeMermaid(codeString);
            if (isMermaidBlock) {
              const sanitized = sanitizeMermaidCode(codeString);
              const validation = validateMermaidCode(sanitized.sanitized);
              if (!validation.valid) {
                return (
                  <InvalidChartSpec
                    message={`Invalid Mermaid spec: ${validation.error ?? "Unknown error"}`}
                    code={codeString}
                  />
                );
              }

              // Detect Mermaid mindmap and offer toggle to interactive markmap
              const isMermaidMindmap = /^\s*mindmap\b/i.test(sanitized.sanitized.trim());

              if (isMermaidMindmap) {
                return (
                  <MermaidMindmapWithToggle
                    mermaidCode={sanitized.sanitized}
                    rawCode={codeString}
                  />
                );
              }

              return (
                <ErrorBoundary
                  level="chart"
                  fallback={<InvalidChartSpec message="Invalid Mermaid spec" code={codeString} />}
                  onError={(error) =>
                    trackChatEvent("chart_render_failure", { engine: "mermaid", errorCode: error.message })
                  }
                >
                  <LazyMermaidRenderer code={sanitized.sanitized} />
                </ErrorBoundary>
              );
            }

            // G2 charts — engine removed; fall back to code block for old conversations
            if (language === "g2") {
              return <SuspenseCodeBlock language="json" code={codeString} />;
            }

            // Ant Design Charts - lazy loaded
            if (language === "adc" || language === "ant-design-charts" || language === "antd-charts") {
              const result = parseAdcSpecFromCode(codeString);

              if (result.ok && result.spec) {
                return (
                  <ErrorBoundary
                    level="chart"
                    fallback={<InvalidChartSpec message="Invalid ADC spec" code={codeString} />}
                    onError={(error) =>
                      trackChatEvent("chart_render_failure", { engine: "adc", errorCode: error.message })
                    }
                  >
                    <LazyAntDesignChartsRenderer spec={result.spec} />
                  </ErrorBoundary>
                );
              }
              const errorMessage =
                result.error === "ADC_PARSE_INVALID_TYPE"
                  ? "Unsupported ADC chart type"
                  : result.error === "ADC_PARSE_UNSUPPORTED_CALLBACK"
                    ? "ADC callbacks are not supported"
                    : result.error === "ADC_PARSE_EMPTY"
                    ? "Empty ADC spec"
                      : "Invalid ADC JSON";
              return <InvalidChartSpec message={errorMessage} code={codeString} />;
            }

            // ECharts - lazy loaded
            if (language === "echarts" || language === "echart") {
              const ecResult = parseEChartsSpecFromCode(codeString);

              if (ecResult.ok) {
                return (
                  <ErrorBoundary
                    level="chart"
                    fallback={<InvalidChartSpec message="Invalid ECharts spec" code={codeString} />}
                    onError={(error) =>
                      trackChatEvent("chart_render_failure", { engine: "echarts", errorCode: error.message })
                    }
                  >
                    <LazyEChartsRenderer spec={ecResult.spec} />
                  </ErrorBoundary>
                );
              }
              return <InvalidChartSpec message={ecResult.error} code={codeString} />;
            }

            // Vega-Lite - lazy loaded
            if (language === "vega-lite" || language === "vegalite" || language === "vl") {
              const vlResult = parseVegaLiteSpecFromCode(codeString);

              if (vlResult.ok) {
                return (
                  <ErrorBoundary
                    level="chart"
                    fallback={<InvalidChartSpec message="Invalid Vega-Lite spec" code={codeString} />}
                    onError={(error) =>
                      trackChatEvent("chart_render_failure", { engine: "vega-lite", errorCode: error.message })
                    }
                  >
                    <LazyVegaLiteRenderer spec={vlResult.spec} />
                  </ErrorBoundary>
                );
              }
              return <InvalidChartSpec message={vlResult.error} code={codeString} />;
            }

            // Stat cards (KPI metrics) - lazy loaded
            if (language === "stat" || language === "stats" || language === "kpi") {
              const statData = parseStatCardData(codeString);
              if (statData) {
                return (
                  <ErrorBoundary
                    level="chart"
                    fallback={<InvalidChartSpec message="Invalid stat card data" code={codeString} />}
                    onError={(error) =>
                      trackChatEvent("chart_render_failure", { engine: "stat", errorCode: error.message })
                    }
                  >
                    <LazyStatCardRenderer data={statData} />
                  </ErrorBoundary>
                );
              }
              return <InvalidChartSpec message="Invalid stat card JSON" code={codeString} />;
            }

            // Dashboard (composite layout) - lazy loaded
            if (language === "dashboard") {
              const dashResult = parseDashboardSpec(codeString);
              if (dashResult.ok) {
                return (
                  <ErrorBoundary
                    level="chart"
                    fallback={<InvalidChartSpec message="Invalid dashboard spec" code={codeString} />}
                    onError={(error) =>
                      trackChatEvent("chart_render_failure", { engine: "dashboard", errorCode: error.message })
                    }
                  >
                    <LazyDashboardRenderer spec={dashResult.spec} />
                  </ErrorBoundary>
                );
              }
              return <InvalidChartSpec message={dashResult.error} code={codeString} />;
            }

            // Excalidraw hand-drawn diagrams - lazy loaded
            if (language === "excalidraw") {
              const excalidrawResult = parseExcalidrawData(codeString);
              if (excalidrawResult.ok) {
                return (
                  <ErrorBoundary
                    level="chart"
                    fallback={<InvalidChartSpec message="Invalid Excalidraw spec" code={codeString} />}
                    onError={(error) =>
                      trackChatEvent("chart_render_failure", { engine: "excalidraw", errorCode: error.message })
                    }
                  >
                    <LazyExcalidrawRenderer data={excalidrawResult.data} />
                  </ErrorBoundary>
                );
              }
              return <InvalidChartSpec message={excalidrawResult.error} code={codeString} />;
            }

            // React component sandbox - renders in a secure iframe
            if (language === "react" || language === "jsx" || language === "tsx") {
              // During streaming, show code block to avoid jitter
              if (isStreaming) {
                return <SuspenseCodeBlock language={language} code={codeString} />;
              }
              return (
                <ErrorBoundary
                  level="chart"
                  fallback={<InvalidChartSpec message="React component render failed" code={codeString} />}
                  onError={(error) =>
                    trackChatEvent("chart_render_failure", { engine: "react-sandbox", errorCode: error.message })
                  }
                >
                  <LazyReactSandbox code={codeString} />
                </ErrorBoundary>
              );
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
              <p className="mb-3 last:mb-0 leading-relaxed text-sm text-foreground">{children}</p>
            );
          },
          h1({ children }) {
            return (
              <h1 className="mb-4 mt-6 first:mt-0 text-xl font-semibold text-foreground">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mb-3 mt-5 first:mt-0 text-lg font-semibold text-foreground">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mb-2 mt-4 first:mt-0 text-base font-semibold text-foreground">
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
            return <li className="text-sm text-foreground">{children}</li>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
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
              <blockquote className="border-l-4 border-accent/50 pl-4 py-1 my-3 bg-muted/30 rounded-r">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-4 border-border" />;
          },
          table({ children }) {
            return <SmartTable>{children}</SmartTable>;
          },
          thead({ children }) {
            return <thead className="bg-muted/50">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-4 py-2 text-left text-sm font-semibold text-foreground border-b border-border">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-2 text-sm text-foreground border-b border-border last:border-b-0">
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
        <span className="inline-block w-0.5 h-[1em] bg-accent ml-0.5 animate-blink-cursor" />
      )}
      <CitationCards items={citations} />
    </div>
  );
});
