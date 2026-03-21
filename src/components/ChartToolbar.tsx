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
import { exportToPng, toPngDataUrl, downloadTextFile, downloadFile } from "../utils/exporters/image";
import { exportToPdf, dataUrlToPdf } from "../utils/exporters/pdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartEngine = "mermaid" | "adc" | "echarts" | "vega-lite";

export interface ChartToolbarProps {
  /** Ref to the DOM element that wraps the rendered chart (used for PNG/PDF export). */
  containerRef: RefObject<HTMLElement | null>;
  /** Which rendering engine produced the chart — controls SVG/JSON strategies. */
  engine: ChartEngine;
  /** Whether the chart is currently rendered in dark mode. */
  isDark?: boolean;
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
const CANVAS_ENGINES: ReadonlySet<ChartEngine> = new Set(["adc"]);

function makeFilename(engine: ChartEngine, chartType: string | undefined, ext: string): string {
  const type = chartType ?? engine;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `chart-${type}-${ts}.${ext}`;
}

/**
 * Invert + hue-rotate a canvas image in-place using pixel manipulation.
 * Equivalent to CSS `filter: invert(1) hue-rotate(180deg)` but works
 * in all browsers (Safari lacks CanvasRenderingContext2D.filter).
 *
 * Effect: dark backgrounds → white, light text → dark, data colors ≈ preserved.
 */
function invertHueRotatePixels(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // W3C hue-rotate(180deg) matrix (cos=−1, sin=0):
  //   R' = 0.213 − 0.787·R + 1.430·G + 0.144·B   (using luminance weights)
  //   G' = 0.426·R + 0.430·G + 0.144·B             (not exact — let's use full matrix)
  //
  // Exact W3C feColorMatrix for hue-rotate(a), with c=cos(a), s=sin(a):
  //   | 0.213+0.787c-0.213s   0.715-0.715c-0.715s   0.072-0.072c+0.928s |
  //   | 0.213-0.213c+0.143s   0.715+0.285c+0.140s   0.072-0.072c-0.283s |
  //   | 0.213-0.213c-0.787s   0.715-0.715c+0.715s   0.072+0.928c+0.072s |
  //
  // For a=180deg: c=−1, s=0:
  const m00 = 0.213 - 0.787; // −0.574
  const m01 = 0.715 + 0.715; //  1.430
  const m02 = 0.072 + 0.072; //  0.144
  const m10 = 0.213 + 0.213; //  0.426
  const m11 = 0.715 - 0.285; //  0.430
  const m12 = 0.072 + 0.072; //  0.144
  const m20 = 0.213 + 0.213; //  0.426
  const m21 = 0.715 + 0.715; //  1.430
  const m22 = 0.072 - 0.928; // −0.856

  for (let i = 0; i < d.length; i += 4) {
    // Step 1: invert
    const r = 255 - d[i];
    const g = 255 - d[i + 1];
    const b = 255 - d[i + 2];
    // Step 2: hue-rotate 180deg
    d[i]     = Math.max(0, Math.min(255, Math.round(m00 * r + m01 * g + m02 * b)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(m10 * r + m11 * g + m12 * b)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round(m20 * r + m21 * g + m22 * b)));
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Build a composited PNG data-URL from a canvas-based chart container.
 * Draws a white background + the chart canvas pixels onto an offscreen canvas.
 *
 * When `invertDark` is true (dark-mode export), applies pixel-level
 * invert + hue-rotate(180deg) so the image looks natural on a white background.
 */
function compositeCanvasPng(
  container: HTMLElement,
  invertDark = false,
  bgColor = "#ffffff",
): string | null {
  const chartCanvas = container.querySelector("canvas");
  if (!chartCanvas || chartCanvas.width === 0) return null;

  const padding = 24;

  const outWidth = chartCanvas.width + padding * 2;
  const outHeight = chartCanvas.height + padding * 2;

  const offscreen = document.createElement("canvas");
  offscreen.width = outWidth;
  offscreen.height = outHeight;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  // White background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outWidth, outHeight);

  // Draw chart canvas
  ctx.drawImage(chartCanvas, padding, padding);

  if (invertDark) {
    invertHueRotatePixels(ctx, outWidth, outHeight);
  }

  return offscreen.toDataURL("image/png");
}

/**
 * Apply invert + hue-rotate(180deg) to a PNG data-URL and return a new data-URL.
 * Used for SVG-based engine exports in dark mode.
 */
function invertDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) { reject(new Error("no 2d context")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      invertHueRotatePixels(ctx, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChartToolbar({
  containerRef,
  engine,
  isDark = false,
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
        // In dark mode, invert colors so the export is readable on white background
        const dataUrl = compositeCanvasPng(el, isDark);
        if (dataUrl) {
          downloadFile(dataUrl, makeFilename(engine, chartType, "png"));
        }
      } else {
        // SVG-based engines (Mermaid, Vega-Lite, ECharts): html-to-image works fine
        if (isDark) {
          // Capture, then pixel-level invert for dark→light conversion
          const raw = await toPngDataUrl(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
          const inverted = await invertDataUrl(raw);
          downloadFile(inverted, makeFilename(engine, chartType, "png"));
        } else {
          await exportToPng(el, {
            pixelRatio: 2,
            backgroundColor: "#ffffff",
            filename: makeFilename(engine, chartType, "png"),
          });
        }
      }
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine, isDark]);

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
        const dataUrl = compositeCanvasPng(el, isDark);
        if (dataUrl) {
          downloadFile(dataUrl, makeFilename(engine, chartType, "png"));
        }
      }
    } catch (err) {
      console.error("SVG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine, isDark]);

  // ---- PDF ----
  const handlePdf = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("pdf");
    try {
      if (isCanvasEngine) {
        // Read canvas pixels directly (with dark-mode inversion if needed)
        const dataUrl = compositeCanvasPng(el, isDark);
        if (dataUrl) {
          await dataUrlToPdf(dataUrl, makeFilename(engine, chartType, "pdf"));
        }
      } else {
        if (isDark) {
          // SVG engines dark mode: capture → invert → PDF
          const raw = await toPngDataUrl(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
          const inverted = await invertDataUrl(raw);
          await dataUrlToPdf(inverted, makeFilename(engine, chartType, "pdf"));
        } else {
          await exportToPdf(el, {
            filename: makeFilename(engine, chartType, "pdf"),
          });
        }
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine, isDark]);

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
