/**
 * ChartToolbar — floating export toolbar for chart containers.
 *
 * Appears on hover over the parent chart area with fade-in animation.
 * Supports PNG, SVG, PDF and JSON/CSV export for both Mermaid and ADC charts.
 */

import { useState, useCallback, type RefObject } from "react";
import { exportToPng, downloadTextFile } from "../utils/exporters/image";
import { exportToPdf } from "../utils/exporters/pdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartEngine = "mermaid" | "adc" | "echarts" | "vega-lite";

export interface ChartToolbarProps {
  /** Ref to the DOM element that wraps the rendered chart (used for PNG/PDF export). */
  containerRef: RefObject<HTMLElement | null>;
  /** Which rendering engine produced the chart — controls SVG/JSON strategies. */
  engine: ChartEngine;
  /** Optional chart sub-type label used in filenames (e.g. "pie", "flowchart"). */
  chartType?: string;
  /** For JSON export: the raw spec/data object to serialize. */
  spec?: unknown;
  /** Callback when the Edit button is clicked (opens the chart editor). */
  onEdit?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFilename(engine: ChartEngine, chartType: string | undefined, ext: string): string {
  const type = chartType ?? engine;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `chart-${type}-${ts}.${ext}`;
}

/** Extract the raw SVG markup from a Mermaid container element. */
function extractSvgMarkup(container: HTMLElement): string | null {
  const svg = container.querySelector("svg");
  if (!svg) return null;
  // Clone so we don't mutate the live DOM
  const clone = svg.cloneNode(true) as SVGElement;
  // Ensure xmlns is present for standalone SVG files
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  return new XMLSerializer().serializeToString(clone);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChartToolbar({
  containerRef,
  engine,
  chartType,
  spec,
  onEdit,
}: ChartToolbarProps) {
  const [busy, setBusy] = useState<string | null>(null);

  // ---- PNG ----
  const handlePng = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("png");
    try {
      await exportToPng(el, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        filename: makeFilename(engine, chartType, "png"),
      });
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType]);

  // ---- SVG ----
  const handleSvg = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("svg");
    try {
      if (engine === "mermaid") {
        const markup = extractSvgMarkup(el);
        if (markup) {
          downloadTextFile(markup, makeFilename(engine, chartType, "svg"), "image/svg+xml");
        }
      } else {
        // ADC / ECharts: try to find an embedded <svg> first, fall back to canvas toDataURL
        const svg = el.querySelector("svg");
        if (svg) {
          const clone = svg.cloneNode(true) as SVGElement;
          if (!clone.getAttribute("xmlns")) {
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          }
          const markup = new XMLSerializer().serializeToString(clone);
          downloadTextFile(markup, makeFilename(engine, chartType, "svg"), "image/svg+xml");
        } else {
          const canvas = el.querySelector("canvas");
          if (canvas) {
            const dataUrl = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.download = makeFilename(engine, chartType, "png");
            link.href = dataUrl;
            link.click();
          }
        }
      }
    } catch (err) {
      console.error("SVG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType]);

  // ---- PDF ----
  const handlePdf = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("pdf");
    try {
      await exportToPdf(el, {
        filename: makeFilename(engine, chartType, "pdf"),
      });
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType]);

  // ---- JSON ----
  const handleJson = useCallback(() => {
    if (spec == null) return;
    setBusy("json");
    try {
      const json = JSON.stringify(spec, null, 2);
      downloadTextFile(json, makeFilename(engine, chartType, "json"), "application/json");
    } catch (err) {
      console.error("JSON export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [spec, engine, chartType]);

  // Build the button list. JSON only shown when spec is provided.
  const buttons: { key: string; label: string; handler: () => void | Promise<void> }[] = [
    { key: "png", label: "PNG", handler: handlePng },
    { key: "svg", label: "SVG", handler: handleSvg },
    { key: "pdf", label: "PDF", handler: handlePdf },
  ];
  if (spec != null) {
    buttons.push({ key: "json", label: "JSON", handler: handleJson });
  }
  if (spec != null && onEdit) {
    buttons.push({ key: "edit", label: "Edit", handler: onEdit });
  }

  return (
    <div
      className={
        "absolute top-2 right-2 z-10 flex items-center gap-1 " +
        "rounded-lg px-1.5 py-1 " +
        "bg-white/90 dark:bg-neutral-800/90 " +
        "shadow-sm border border-gray-200 dark:border-neutral-700 " +
        "opacity-0 group-hover:opacity-100 " +
        "transition-opacity duration-200 pointer-events-auto"
      }
    >
      {buttons.map(({ key, label, handler }) => (
        <button
          key={key}
          type="button"
          disabled={busy !== null}
          onClick={handler}
          className={
            "px-2 py-0.5 text-[11px] font-medium rounded " +
            "text-gray-600 dark:text-gray-300 " +
            "hover:bg-gray-100 dark:hover:bg-neutral-700 " +
            "disabled:opacity-40 disabled:cursor-wait " +
            "transition-colors duration-150"
          }
          title={key === "edit" ? "Edit chart spec" : `Export as ${label}`}
        >
          {busy === key ? "..." : key === "edit" ? (
            <span className="flex items-center gap-0.5">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              {label}
            </span>
          ) : label}
        </button>
      ))}
    </div>
  );
}
