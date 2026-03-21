/**
 * MarkmapRenderer — interactive mind map powered by markmap-lib + markmap-view.
 *
 * Accepts a markdown-style outline (headings or indented lines) and renders an
 * interactive SVG mind map with collapse/expand, zoom and pan built in.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { TreeStructure } from "@phosphor-icons/react";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { ChartToolbar } from "./ChartToolbar";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { useChatSessionContext } from "../features/chat/context/ChatSessionContext";

interface MarkmapRendererProps {
  code: string;
}

/**
 * Convert an indented plain-text outline into markdown headings that markmap
 * understands. If the input already uses `#` headings, return it as-is.
 *
 * Indented format (spaces or tabs):
 *   Root Topic
 *     Branch 1
 *       Leaf 1a
 *
 * Becomes:
 *   # Root Topic
 *   ## Branch 1
 *   ### Leaf 1a
 */
function normalizeToMarkdownHeadings(code: string): string {
  const trimmed = code.trim();
  // If it already contains markdown headings, return as-is
  if (/^#{1,6}\s/m.test(trimmed)) {
    return trimmed;
  }

  const lines = trimmed.split("\n");
  if (lines.length === 0) return trimmed;

  // Detect indent unit: find smallest non-zero indentation
  let indentUnit = 2; // default
  for (const line of lines) {
    const match = line.match(/^(\s+)\S/);
    if (match) {
      const len = match[1].replace(/\t/g, "  ").length;
      if (len > 0 && len < indentUnit) {
        indentUnit = len;
      }
    }
  }

  const result: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const leadingWhitespace = line.match(/^(\s*)/)?.[1] ?? "";
    const expandedLength = leadingWhitespace.replace(/\t/g, "  ").length;
    const depth = Math.floor(expandedLength / indentUnit) + 1; // 1-based
    const clampedDepth = Math.min(depth, 6);
    const hashes = "#".repeat(clampedDepth);
    result.push(`${hashes} ${line.trim()}`);
  }

  return result.join("\n");
}

export function MarkmapRenderer({ code }: MarkmapRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markmapInstanceRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isDark = useThemeDetector();
  const { currentSessionId } = useChatSessionContext();

  const markdownCode = useMemo(() => normalizeToMarkdownHeadings(code), [code]);

  // Render the markmap
  useEffect(() => {
    let mounted = true;
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const renderMarkmap = async () => {
      try {
        const { Transformer } = await import("markmap-lib");
        const { Markmap } = await import("markmap-view");

        const transformer = new Transformer();
        const { root } = transformer.transform(markdownCode);

        if (!mounted || !svgRef.current) return;

        // Clear any previous instance
        svgRef.current.textContent = "";

        const mm = Markmap.create(svgRef.current, {
          duration: 300,
          autoFit: true,
          color: undefined, // use default rainbow colors
          paddingX: 16,
        }, root);

        markmapInstanceRef.current = mm;

        if (mounted) {
          setIsLoading(false);
          setError(null);
          trackChatEvent("chart_render_success", {
            engine: "markmap",
            sessionId: currentSessionId,
          });
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : "Failed to render mind map";
          setError(errorMessage);
          setIsLoading(false);
          trackChatEvent("chart_render_failure", {
            engine: "markmap",
            errorCode: errorMessage,
            sessionId: currentSessionId,
          });
        }
      }
    };

    renderMarkmap();

    return () => {
      mounted = false;
      // Dispose markmap instance to release SVG event listeners
      const mm = markmapInstanceRef.current;
      if (mm && typeof (mm as { destroy?: () => void }).destroy === "function") {
        (mm as { destroy: () => void }).destroy();
      }
      markmapInstanceRef.current = null;
    };
  }, [markdownCode, currentSessionId]);

  // Update colors when theme changes
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    // Apply theme-appropriate text color to SVG text elements
    const textColor = isDark ? "#e5e7eb" : "#1f2937";
    svgEl.style.setProperty("--markmap-text-color", textColor);

    // Update existing text elements
    const texts = svgEl.querySelectorAll("text");
    texts.forEach((t) => {
      t.setAttribute("fill", textColor);
    });
  }, [isDark]);

  // ResizeObserver for auto-fit on container resize
  const handleResize = useCallback(() => {
    const mm = markmapInstanceRef.current;
    if (mm && typeof (mm as { fit: () => void }).fit === "function") {
      (mm as { fit: () => void }).fit();
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      handleResize();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [handleResize]);

  if (error) {
    return (
      <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <span className="text-xs">
          <span className="app-text-danger">Mind Map Error: {error}</span>
        </span>
        <details className="mt-2">
          <summary className="text-xs text-foreground-muted cursor-pointer">View code</summary>
          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {code}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full p-4 rounded-xl ring ring-border bg-surface-elevated group relative"
    >
      <div className="flex items-center gap-2 mb-2">
        <TreeStructure size={14} className="text-accent" />
        <span className="text-xs text-foreground-muted font-semibold">
          Mind Map
        </span>
        <span className="text-[10px] text-foreground-muted/60">
          Click nodes to collapse/expand
        </span>
      </div>
      <ChartToolbar containerRef={containerRef} engine="mermaid" isDark={isDark} chartType="mindmap" />

      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          minHeight: 400,
          background: isDark ? "#1a1a2e" : "#fafbfc",
        }}
      >
        <svg
          ref={svgRef}
          className="w-full"
          style={{
            minHeight: 400,
            width: "100%",
          }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/85">
            <span className="text-sm text-foreground-muted">Rendering mind map...</span>
          </div>
        )}
      </div>
    </div>
  );
}
