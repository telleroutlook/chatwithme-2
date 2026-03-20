/**
 * ChartToolbar — floating export toolbar for chart containers.
 *
 * Appears on hover over the parent chart area with fade-in animation.
 * Supports PNG, SVG, PDF and JSON/CSV export for both Mermaid and ADC charts.
 *
 * Canvas-based engines (ADC, ECharts) read pixels directly from the <canvas>
 * element instead of using html-to-image / html2canvas, which cannot capture
 * canvas content reliably (blank PNG, garbled colors in PDF, etc.).
 */

import { useState, useCallback, type RefObject } from "react";
import { exportToPng, downloadTextFile, downloadFile } from "../utils/exporters/image";
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

/** Engines that render to <canvas> instead of <svg>. */
const CANVAS_ENGINES: ReadonlySet<ChartEngine> = new Set(["adc", "echarts"]);

function makeFilename(engine: ChartEngine, chartType: string | undefined, ext: string): string {
  const type = chartType ?? engine;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `chart-${type}-${ts}.${ext}`;
}

/**
 * Build a composited PNG data-URL from a canvas-based chart container.
 * Draws a white background + optional title header + the chart canvas pixels
 * onto an offscreen canvas, returning the data URL.
 */
function compositeCanvasPng(container: HTMLElement, bgColor = "#ffffff"): string | null {
  const chartCanvas = container.querySelector("canvas");
  if (!chartCanvas || chartCanvas.width === 0) return null;

  const padding = 24;
  const headerHeight = 0; // title is outside containerRef, so not captured here

  const outWidth = chartCanvas.width + padding * 2;
  const outHeight = chartCanvas.height + padding * 2 + headerHeight;

  const offscreen = document.createElement("canvas");
  offscreen.width = outWidth;
  offscreen.height = outHeight;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  // White background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outWidth, outHeight);

  // Draw chart canvas
  ctx.drawImage(chartCanvas, padding, padding + headerHeight);

  return offscreen.toDataURL("image/png");
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

  const isCanvasEngine = CANVAS_ENGINES.has(engine);

  // ---- PNG ----
  const handlePng = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("png");
    try {
      if (isCanvasEngine) {
        // Read pixels directly from the chart <canvas>
        const dataUrl = compositeCanvasPng(el);
        if (dataUrl) {
          downloadFile(dataUrl, makeFilename(engine, chartType, "png"));
        }
      } else {
        // SVG-based engines (Mermaid, Vega-Lite): html-to-image works fine
        await exportToPng(el, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          filename: makeFilename(engine, chartType, "png"),
        });
      }
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine]);

  // ---- SVG ----
  const handleSvg = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("svg");
    try {
      const svg = el.querySelector("svg");
      if (svg) {
        const clone = svg.cloneNode(true) as SVGElement;
        if (!clone.getAttribute("xmlns")) {
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        const markup = new XMLSerializer().serializeToString(clone);
        downloadTextFile(markup, makeFilename(engine, chartType, "svg"), "image/svg+xml");
      } else if (isCanvasEngine) {
        // Canvas engines have no SVG — export as PNG from canvas directly
        const dataUrl = compositeCanvasPng(el);
        if (dataUrl) {
          downloadFile(dataUrl, makeFilename(engine, chartType, "png"));
        }
      }
    } catch (err) {
      console.error("SVG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine]);

  // ---- PDF ----
  const handlePdf = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("pdf");
    try {
      if (isCanvasEngine) {
        // Build PDF directly from canvas pixels — avoids html2canvas color issues
        const dataUrl = compositeCanvasPng(el);
        if (dataUrl) {
          const { default: jsPDF } = await import("jspdf");

          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = dataUrl;
          });

          const isLandscape = img.width > img.height;
          const pdf = new jsPDF({
            orientation: isLandscape ? "landscape" : "portrait",
            unit: "mm",
            format: "a4",
          });

          const pageW = pdf.internal.pageSize.getWidth();
          const pageH = pdf.internal.pageSize.getHeight();
          const margin = 10;
          const ratio = Math.min(
            (pageW - margin * 2) / img.width,
            (pageH - margin * 2) / img.height
          );
          const w = img.width * ratio;
          const h = img.height * ratio;
          const x = (pageW - w) / 2;
          const y = margin;

          pdf.addImage(dataUrl, "PNG", x, y, w, h);
          pdf.save(makeFilename(engine, chartType, "pdf"));
        }
      } else {
        await exportToPdf(el, {
          filename: makeFilename(engine, chartType, "pdf"),
        });
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine]);

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

  // Build the button list.
  // Canvas engines have no real SVG, so show "PNG" instead of "SVG".
  const buttons: { key: string; label: string; handler: () => void | Promise<void> }[] = [
    { key: "png", label: "PNG", handler: handlePng },
  ];
  if (!isCanvasEngine) {
    buttons.push({ key: "svg", label: "SVG", handler: handleSvg });
  }
  buttons.push({ key: "pdf", label: "PDF", handler: handlePdf });
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
