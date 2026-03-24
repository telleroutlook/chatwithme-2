/**
 * ChartToolbar — floating export toolbar for chart containers.
 *
 * Appears on hover over the parent chart area with fade-in animation.
 * Supports PNG, SVG, PDF and JSON/CSV export for Mermaid and ECharts.
 *
 * Canvas-based engines (ECharts) read pixels directly from the <canvas>
 * element instead of using html-to-image / html2canvas, which cannot capture
 * canvas content reliably (blank PNG, garbled colors in PDF, etc.).
 */

import { useState, useCallback, type RefObject } from "react";
import { toPngDataUrl, downloadTextFile, downloadFile } from "../utils/exporters/image";
import { dataUrlToPdf } from "../utils/exporters/pdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartEngine = "mermaid" | "echarts" | "vega-lite";

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
  /**
   * Optional callback to get a PNG data-URL directly from the chart engine.
   * Supports both sync and async variants.
   * When provided, this is used for PNG/PDF export instead of DOM capture.
   */
  getDataUrl?: () => string | null | Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All current chart engines render to SVG. */
const CANVAS_ENGINES: ReadonlySet<ChartEngine> = new Set([]);

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
 * invert + hue-rotate(180deg) ONLY to the chart area (not the white padding),
 * so the image looks natural on a white background without the padding going dark.
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

  // White background (padding area)
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outWidth, outHeight);

  if (invertDark) {
    // Invert the chart canvas pixels first on a temporary canvas,
    // then composite onto the white background — this way the white
    // padding stays white instead of being inverted to black.
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = chartCanvas.width;
    tempCanvas.height = chartCanvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return null;
    tempCtx.drawImage(chartCanvas, 0, 0);
    invertHueRotatePixels(tempCtx, chartCanvas.width, chartCanvas.height);
    ctx.drawImage(tempCanvas, padding, padding);
  } else {
    ctx.drawImage(chartCanvas, padding, padding);
  }

  return offscreen.toDataURL("image/png");
}

/**
 * Capture a DOM element as a PNG data-URL with the page temporarily switched
 * to light mode. This ensures SVG-based charts (Mermaid, Vega-Lite, Markmap)
 * export with correct dark-on-white colors instead of needing pixel inversion.
 *
 * The `data-mode` attribute on `<html>` is toggled for the duration of the
 * html-to-image capture and immediately restored, so the UI never flickers.
 */
async function captureLightModePng(el: HTMLElement): Promise<string> {
  const html = document.documentElement;
  const prevMode = html.getAttribute("data-mode");
  html.setAttribute("data-mode", "light");
  try {
    return await toPngDataUrl(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
  } finally {
    if (prevMode !== null) {
      html.setAttribute("data-mode", prevMode);
    } else {
      html.removeAttribute("data-mode");
    }
  }
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
  getDataUrl,
}: ChartToolbarProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const isCanvasEngine = CANVAS_ENGINES.has(engine);

  // ---- PNG ----
  const handlePng = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("png");
    try {
      if (getDataUrl) {
        // Engine provides native data-URL (sync or async)
        const dataUrl = await Promise.resolve(getDataUrl());
        if (dataUrl) {
          downloadFile(dataUrl, makeFilename(engine, chartType, "png"));
        }
      } else if (isCanvasEngine) {
        // Read pixels directly from the chart <canvas>
        // In dark mode, invert colors so the export is readable on white background
        const dataUrl = compositeCanvasPng(el, isDark);
        if (dataUrl) {
          downloadFile(dataUrl, makeFilename(engine, chartType, "png"));
        }
      } else {
        // SVG-based engines (Mermaid, Vega-Lite, Markmap): temporarily switch
        // the page to light mode so html-to-image captures dark-on-white colors.
        const pngDataUrl = isDark
          ? await captureLightModePng(el)
          : await toPngDataUrl(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
        downloadFile(pngDataUrl, makeFilename(engine, chartType, "png"));
      }
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine, isDark, getDataUrl]);

  // ---- SVG ----
  const handleSvg = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setBusy("svg");
    try {
      const svg = el.querySelector("svg");
      if (svg) {
        // Switch to light mode temporarily so computed styles resolve to
        // light-theme values before cloning — prevents dark CSS vars being
        // baked into the exported file as-is (white text on transparent bg).
        const html = document.documentElement;
        const prevMode = html.getAttribute("data-mode");
        html.setAttribute("data-mode", "light");
        let markup: string;
        try {
          const clone = svg.cloneNode(true) as SVGElement;
          if (!clone.getAttribute("xmlns")) {
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          }
          // Prepend a white background rect so the SVG looks correct when
          // opened in viewers that default to a transparent / dark canvas.
          const w = svg.getAttribute("width") || svg.viewBox?.baseVal?.width?.toString() || "800";
          const h = svg.getAttribute("height") || svg.viewBox?.baseVal?.height?.toString() || "400";
          const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          bgRect.setAttribute("width", "100%");
          bgRect.setAttribute("height", "100%");
          bgRect.setAttribute("fill", "#ffffff");
          clone.insertBefore(bgRect, clone.firstChild);
          if (!clone.getAttribute("width")) clone.setAttribute("width", w);
          if (!clone.getAttribute("height")) clone.setAttribute("height", h);
          markup = new XMLSerializer().serializeToString(clone);
        } finally {
          if (prevMode !== null) {
            html.setAttribute("data-mode", prevMode);
          } else {
            html.removeAttribute("data-mode");
          }
        }
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
      if (getDataUrl) {
        // Engine provides native data-URL (sync or async)
        const dataUrl = await Promise.resolve(getDataUrl());
        if (dataUrl) {
          await dataUrlToPdf(dataUrl, makeFilename(engine, chartType, "pdf"));
        }
      } else if (isCanvasEngine) {
        // Read canvas pixels directly (with dark-mode inversion if needed)
        const dataUrl = compositeCanvasPng(el, isDark);
        if (dataUrl) {
          await dataUrlToPdf(dataUrl, makeFilename(engine, chartType, "pdf"));
        }
      } else {
        // SVG-based engines (Mermaid, Vega-Lite, Markmap): temporarily switch
        // the page to light mode so html-to-image captures dark-on-white colors.
        const pngDataUrl = isDark
          ? await captureLightModePng(el)
          : await toPngDataUrl(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
        await dataUrlToPdf(pngDataUrl, makeFilename(engine, chartType, "pdf"));
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setBusy(null);
    }
  }, [containerRef, engine, chartType, isCanvasEngine, isDark, getDataUrl]);

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
