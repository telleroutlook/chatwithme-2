import { useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CodeBlock } from "./CodeBlock";
import { MermaidRenderer, G2ChartRenderer } from "./ChartRenderer";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

interface HtmlPreviewRendererProps {
  code: string;
}

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

function HtmlPreviewRenderer({ code }: HtmlPreviewRendererProps) {
  const frameId = useId();
  const [frameHeight, setFrameHeight] = useState(420);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.type !== "chatwithme-html-preview-resize" ||
        data.frameId !== frameId
      ) {
        return;
      }

      if (typeof data.height !== "number" || Number.isNaN(data.height)) {
        return;
      }

      const nextHeight = Math.max(220, Math.min(1400, Math.ceil(data.height)));
      setFrameHeight((prev) => (Math.abs(prev - nextHeight) >= 2 ? nextHeight : prev));
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameId]);

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{margin:0;padding:8px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}</style></head><body>${code}<script>(function(){var frameId=${JSON.stringify(
    frameId
  )};function height(){var b=document.body;var d=document.documentElement;return Math.max(b?b.scrollHeight:0,b?b.offsetHeight:0,d?d.scrollHeight:0,d?d.offsetHeight:0,220);}function report(){parent.postMessage({type:"chatwithme-html-preview-resize",frameId:frameId,height:height()},"*");}window.addEventListener("load",report);window.addEventListener("resize",report);var observer=new MutationObserver(report);observer.observe(document.documentElement,{attributes:true,childList:true,subtree:true,characterData:true});setInterval(report,500);report();})();</script></body></html>`;

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-kumo-line overflow-hidden bg-[var(--surface-elevated)]">
      <div className="px-3 py-2 text-xs text-kumo-subtle bg-kumo-control/50 border-b border-kumo-line">
        HTML Preview
      </div>
      <iframe
        title="HTML Preview"
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className="w-full border-0 bg-[var(--surface-1)]"
        style={{ height: frameHeight }}
      />
    </div>
  );
}

export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  const processedContent = useMemo(() => {
    return (
      content
        // Strip invisible characters that can break markdown code fence parsing.
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\r\n?/g, "\n")
        // Some model outputs place code fences after punctuation on the same line.
        .replace(/([^\n])(```[a-zA-Z]+)/g, "$1\n$2")
    );
  }, [content]);

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
              try {
                const spec = JSON.parse(codeString);
                return <G2ChartRenderer spec={spec} />;
              } catch {
                return <span className="text-xs app-text-danger">Invalid G2 spec</span>;
              }
            }

            const decodedCodeString = decodeHtmlEntities(codeString);
            const svgLikeCode = looksLikeSvgMarkup(codeString)
              ? codeString
              : looksLikeSvgMarkup(decodedCodeString)
                ? decodedCodeString
                : "";
            const isSvgXmlBlock =
              (language === "xml" || language === "xhtml" || language === "html") && !!svgLikeCode;
            const isRawSvgBlock = language === "svg" || (!language && !!svgLikeCode);
            if (language === "html" || isSvgXmlBlock || isRawSvgBlock) {
              return <HtmlPreviewRenderer code={svgLikeCode || codeString} />;
            }

            if (language === "markdown" || language === "md") {
              return (
                <div className="my-3 w-full not-prose rounded-xl ring ring-kumo-line overflow-hidden bg-[var(--surface-elevated)]">
                  <div className="px-3 py-2 text-xs text-kumo-subtle bg-kumo-control/50 border-b border-kumo-line">
                    Markdown Preview
                  </div>
                  <div className="p-3">
                    <MarkdownRenderer content={codeString} />
                  </div>
                </div>
              );
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
      {isStreaming && (
        <span className="inline-block w-0.5 h-[1em] bg-kumo-brand ml-0.5 animate-blink-cursor" />
      )}
    </div>
  );
}
