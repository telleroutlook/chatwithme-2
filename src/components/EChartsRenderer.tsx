/**
 * EChartsRenderer — renders an ECharts option spec in a container with
 * theme support, auto-resize, toolbar, and error handling.
 *
 * The heavy `echarts` module is imported lazily so it only loads when the
 * first ECharts block appears in the conversation.
 */

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { ChartBar } from "@phosphor-icons/react";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { useChatSessionContext } from "../features/chat/context/ChatSessionContext";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { useInViewport } from "../hooks/useInViewport";
import { getChartThemeTokens } from "./chartThemeTokens";
import { ChartToolbar } from "./ChartToolbar";
import type { EChartsOption } from "../utils/ecSpecParser";

// Lazy-load ChartEditor (only when user clicks Edit)
const LazyChartEditor = lazy(() => import("./ChartEditor"));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EChartsRendererProps {
  spec: EChartsOption;
  animated?: boolean;
  /** Skip viewport detection and render immediately (e.g. PDF export). */
  forceVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Defaults merged under every user spec
// ---------------------------------------------------------------------------

const BASE_OPTIONS: EChartsOption = {
  animation: true,
  tooltip: { trigger: "axis" },
};

// Default toolbox for interactive chart exploration
const DEFAULT_TOOLBOX: Record<string, unknown> = {
  feature: {
    dataZoom: { yAxisIndex: "none" },
    restore: {},
  },
  right: 10,
  top: 5,
};

// Default dataZoom for xAxis-based charts (time series friendly)
const DEFAULT_DATA_ZOOM: Array<Record<string, unknown>> = [
  { type: "inside", start: 0, end: 100 },
  { type: "slider", start: 0, end: 100, height: 20, bottom: 5 },
];

/**
 * Check whether the spec has an xAxis definition, meaning dataZoom is applicable.
 * Excludes chart types like pie, gauge, map, radar that have no x-axis.
 */
function specHasXAxis(spec: EChartsOption): boolean {
  return spec.xAxis !== undefined && spec.xAxis !== null;
}

// ---------------------------------------------------------------------------
// Detect a human-friendly chart type label from the spec
// ---------------------------------------------------------------------------

function detectChartType(spec: EChartsOption): string {
  const series = spec.series;
  if (Array.isArray(series) && series.length > 0) {
    const first = series[0] as Record<string, unknown> | undefined;
    if (first && typeof first.type === "string") {
      return first.type;
    }
  }
  if (spec.geo) return "map";
  if (spec.radar) return "radar";
  if (spec.graphic) return "graphic";
  return "chart";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EChartsRendererInner = memo(function EChartsRendererInner({ spec, forceVisible }: EChartsRendererProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("echarts")["init"]> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { ref: viewportRef, inViewport } = useInViewport({ threshold: 0.1, disabled: forceVisible });

  // Editor state: tracks edited spec overlay (null = use original)
  const [editedSpec, setEditedSpec] = useState<EChartsOption | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Use edited spec if available, otherwise fall back to original
  const activeSpec = editedSpec ?? spec;

  const isDark = useThemeDetector();
  const themeTokens = useMemo(() => getChartThemeTokens(isDark), [isDark]);
  const { currentSessionId } = useChatSessionContext();

  const chartType = useMemo(() => detectChartType(activeSpec), [activeSpec]);

  // Extract user-friendly title from spec (ECharts supports title.text natively)
  const chartTitle = useMemo(() => {
    const t = activeSpec.title;
    if (typeof t === "string" && t.trim()) return t.trim();
    if (t && typeof t === "object" && !Array.isArray(t)) {
      const text = (t as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
    return null;
  }, [activeSpec]);

  // Build the merged option: base defaults + user spec (user wins)
  const mergedOption = useMemo<EChartsOption>(() => {
    // Deep-merge tooltip so user can override trigger, formatter, etc.
    const userTooltip =
      activeSpec.tooltip && typeof activeSpec.tooltip === "object"
        ? (activeSpec.tooltip as Record<string, unknown>)
        : {};
    const baseTooltip = BASE_OPTIONS.tooltip as Record<string, unknown>;

    // Toolbox: only add default if user hasn't specified one
    const toolbox = activeSpec.toolbox !== undefined ? activeSpec.toolbox : DEFAULT_TOOLBOX;

    // DataZoom: only add for charts with xAxis, and only if user hasn't specified
    const dataZoom =
      activeSpec.dataZoom !== undefined
        ? activeSpec.dataZoom
        : specHasXAxis(activeSpec)
          ? DEFAULT_DATA_ZOOM
          : undefined;

    // ---- Legend layout fixes ----
    // (1) Ensure title renders above legend: if both exist and legend has no explicit top,
    //     push legend below title so they don't overlap.
    // (2) Ensure legend at the bottom doesn't overlap chart content (radar labels, axis labels).
    //     When legend is at bottom, give it a fixed pixel offset and push content area up.
    let legend = activeSpec.legend;
    const titleObj = activeSpec.title;

    // Helper: is the legend anchored to the bottom?
    const isLegendAtBottom = (leg: Record<string, unknown>): boolean => {
      if (leg.bottom !== undefined) return true;
      if (leg.top === "bottom") return true;
      return false;
    };

    // Helper: normalize "top:'bottom'" → "bottom:0" and ensure explicit bottom spacing
    const fixLegendBottom = (leg: Record<string, unknown>): Record<string, unknown> => {
      if (leg.top === "bottom") {
        const { top: _top, ...rest } = leg;
        void _top;
        return { ...rest, bottom: 10 };
      }
      if (leg.bottom !== undefined && typeof leg.bottom === "number" && leg.bottom < 5) {
        return { ...leg, bottom: 10 };
      }
      return leg;
    };

    if (titleObj && legend) {
      const titleTop =
        typeof titleObj === "object" && !Array.isArray(titleObj)
          ? ((titleObj as Record<string, unknown>).top ?? 0)
          : 0;
      const titleTopNum = typeof titleTop === "number" ? titleTop : 0;
      // Rough title height: one line ≈ 20px + 6px padding
      const titleHeight = titleTopNum + 26;

      const fixLegend = (leg: Record<string, unknown>): Record<string, unknown> => {
        let result = leg;
        // Push down below title if no explicit top/bottom set yet
        if (leg.top === undefined && leg.bottom === undefined) {
          result = { ...result, top: titleHeight };
        }
        // Normalize bottom-anchored legends
        if (isLegendAtBottom(result)) {
          result = fixLegendBottom(result);
        }
        return result;
      };

      if (Array.isArray(legend)) {
        legend = legend.map((l) => (l && typeof l === "object" ? fixLegend(l as Record<string, unknown>) : l));
      } else if (typeof legend === "object") {
        legend = fixLegend(legend as Record<string, unknown>);
      }
    } else if (legend) {
      // No title, but still fix bottom-anchored legends
      const fixBottomOnly = (leg: Record<string, unknown>): Record<string, unknown> =>
        isLegendAtBottom(leg) ? fixLegendBottom(leg) : leg;
      if (Array.isArray(legend)) {
        legend = legend.map((l) => (l && typeof l === "object" ? fixBottomOnly(l as Record<string, unknown>) : l));
      } else if (typeof legend === "object") {
        legend = fixBottomOnly(legend as Record<string, unknown>);
      }
    }

    // When legend is at bottom, ensure chart content area has enough bottom margin.
    // Legend height ≈ 30px; we need grid.bottom (for cartesian charts) and
    // radar.center shift (for radar charts) to avoid overlap with indicator labels.
    const legendIsBottom = legend
      ? Array.isArray(legend)
        ? (legend as Record<string, unknown>[]).some((l) => l && typeof l === "object" && isLegendAtBottom(l as Record<string, unknown>))
        : typeof legend === "object" && isLegendAtBottom(legend as Record<string, unknown>)
      : false;

    // For radar: push center up to make room for bottom legend + indicator labels
    let radar = activeSpec.radar;
    if (legendIsBottom && radar) {
      const fixRadar = (r: Record<string, unknown>): Record<string, unknown> => {
        if (r.center !== undefined) return r; // user set explicitly
        // Default radar center is ['50%','50%']; shift up so bottom labels don't overlap legend
        return { ...r, center: ["50%", "45%"], radius: r.radius ?? "60%" };
      };
      if (Array.isArray(radar)) {
        radar = (radar as Record<string, unknown>[]).map((r) =>
          r && typeof r === "object" ? fixRadar(r as Record<string, unknown>) : r,
        );
      } else if (typeof radar === "object") {
        radar = fixRadar(radar as Record<string, unknown>);
      }
    }

    // For cartesian charts (grid): increase bottom margin when legend is at bottom
    let grid = activeSpec.grid;
    if (legendIsBottom && (activeSpec.xAxis || activeSpec.yAxis)) {
      const LEGEND_BOTTOM_MARGIN = 55; // legend (~30px) + gap
      const fixGrid = (g: Record<string, unknown>): Record<string, unknown> => {
        const curBottom = typeof g.bottom === "number" ? g.bottom : 40;
        return { ...g, bottom: Math.max(curBottom, LEGEND_BOTTOM_MARGIN) };
      };
      if (!grid) {
        grid = { bottom: LEGEND_BOTTOM_MARGIN };
      } else if (Array.isArray(grid)) {
        grid = (grid as Record<string, unknown>[]).map((g) =>
          g && typeof g === "object" ? fixGrid(g as Record<string, unknown>) : g,
        );
      } else if (typeof grid === "object") {
        grid = fixGrid(grid as Record<string, unknown>);
      }
    }

    const mergedTooltip = { ...baseTooltip, ...userTooltip };
    // For scatter charts, string formatters like "{c0}" don't work (ECharts returns raw array).
    // Always inject a real function formatter for scatter, even if a string formatter was provided.
    const isScatter =
      Array.isArray(activeSpec.series) &&
      (activeSpec.series as Record<string, unknown>[]).some(
        (s) => s.type === "scatter" || s.type === "scatter3D",
      );
    if (!mergedTooltip.formatter || (isScatter && typeof mergedTooltip.formatter === "string")) {
      if (isScatter) {
        const xAxisName =
          activeSpec.xAxis && typeof activeSpec.xAxis === "object" && !Array.isArray(activeSpec.xAxis)
            ? ((activeSpec.xAxis as Record<string, unknown>).name as string | undefined)
            : undefined;
        const yAxisName =
          activeSpec.yAxis && typeof activeSpec.yAxis === "object" && !Array.isArray(activeSpec.yAxis)
            ? ((activeSpec.yAxis as Record<string, unknown>).name as string | undefined)
            : undefined;
        mergedTooltip.formatter = (params: unknown) => {
          const p = params as { seriesName?: string; value?: unknown; name?: string };
          const val = p.value;
          const lines: string[] = [p.seriesName ?? ""];
          if (p.name) lines.push(p.name);
          if (Array.isArray(val)) {
            const arr = val as unknown[];
            if (arr.length >= 1) lines.push(`${xAxisName ?? "X"}: ${arr[0]}`);
            if (arr.length >= 2) lines.push(`${yAxisName ?? "Y"}: ${arr[1]}`);
            if (arr.length >= 3 && typeof arr[2] === "number") lines.push(`指数: ${arr[2]}`);
          }
          return lines.join("<br/>");
        };
      }
    }

    const merged: EChartsOption = {
      ...BASE_OPTIONS,
      ...activeSpec,
      tooltip: mergedTooltip,
      toolbox,
      ...(legend !== activeSpec.legend ? { legend } : {}),
      ...(radar !== activeSpec.radar ? { radar } : {}),
      ...(grid !== activeSpec.grid ? { grid } : {}),
      // Inject theme-aware text styles where possible
      textStyle: {
        color: themeTokens.axisLabelFill,
        fontFamily: '"IBM Plex Sans", "Noto Sans SC", "Segoe UI", sans-serif',
        ...(activeSpec.textStyle && typeof activeSpec.textStyle === "object"
          ? (activeSpec.textStyle as Record<string, unknown>)
          : {}),
      },
    };

    // Only set dataZoom if we have a value (avoids adding undefined key)
    if (dataZoom !== undefined) {
      merged.dataZoom = dataZoom;
    }

    return merged;
  }, [activeSpec, themeTokens]);

  // Track render success once
  const trackedRef = useRef(false);
  const trackSuccess = useCallback(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackChatEvent("chart_render_success", {
      engine: "echarts",
      type: chartType,
      sessionId: currentSessionId,
    });
  }, [chartType, currentSessionId]);

  // ---- Init / update chart (deferred until in viewport) ----
  useEffect(() => {
    // Don't initialize until the chart scrolls into view — saves memory
    // and ensures ECharts' built-in entrance animations fire when visible.
    if (!inViewport) return;

    let disposed = false;

    const run = async () => {
      if (!containerRef.current) return;
      setIsLoading(true);
      setError(null);

      try {
        const echarts = await import("echarts");

        if (disposed) return;

        // Dispose previous instance if it exists (theme change, etc.)
        if (chartRef.current) {
          chartRef.current.dispose();
          chartRef.current = null;
        }

        const theme = isDark ? "dark" : undefined;
        const chart = echarts.init(containerRef.current, theme, {
          renderer: "svg",
        });
        chartRef.current = chart;

        chart.setOption({
          ...mergedOption,
          animation: true,
          animationDuration: 800,
          animationEasing: "cubicOut",
        });
        trackSuccess();

        // ---- Auto-resize via ResizeObserver ----
        const ro = new ResizeObserver(() => {
          if (!disposed && chart && !chart.isDisposed()) {
            chart.resize();
          }
        });
        ro.observe(containerRef.current);

        // Store for cleanup
        roRef.current = ro;
      } catch (err) {
        if (!disposed) {
          const msg = err instanceof Error ? err.message : "Failed to render ECharts";
          setError(msg);
          trackChatEvent("chart_render_failure", {
            engine: "echarts",
            errorCode: msg,
            sessionId: currentSessionId,
          });
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      disposed = true;
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [inViewport, mergedOption, isDark, trackSuccess, currentSessionId]);

  // Editor callbacks
  const handleOpenEditor = useCallback(() => setShowEditor(true), []);
  const handleCloseEditor = useCallback(() => setShowEditor(false), []);
  const handleApplyEdit = useCallback((newSpec: Record<string, unknown>) => {
    setEditedSpec(newSpec);
    // If the chart instance already exists, apply the new spec directly for instant feedback
    if (chartRef.current && !chartRef.current.isDisposed()) {
      chartRef.current.setOption(newSpec, true);
    }
  }, []);

  // Provide a light-theme PNG data-URL for export.
  // Always uses an offscreen canvas renderer because the live chart uses SVG renderer,
  // and ECharts SVG renderer ignores the `backgroundColor` param in getDataURL()
  // (the param only works for canvas renderer). This ensures a solid white background
  // in all exported images regardless of the current theme.
  const getDataUrl = useCallback(async (): Promise<string | null> => {
    if (!chartRef.current || chartRef.current.isDisposed()) return null;

    const echarts = await import("echarts");
    const lightTokens = getChartThemeTokens(false);
    const offscreenDiv = document.createElement("div");
    offscreenDiv.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;height:500px;visibility:hidden;";
    document.body.appendChild(offscreenDiv);
    try {
      const tempChart = echarts.init(offscreenDiv, undefined, { renderer: "canvas", width: 800, height: 500 });

      // Wait for ECharts to finish rendering before calling getDataURL.
      // Canvas rendering is scheduled via requestAnimationFrame, so calling
      // getDataURL() synchronously after setOption() captures a blank canvas.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000); // safety timeout
        tempChart.on("finished", () => { clearTimeout(timer); resolve(); });
        tempChart.setOption({
          ...mergedOption,
          backgroundColor: "#ffffff",
          textStyle: {
            ...((mergedOption.textStyle as Record<string, unknown>) ?? {}),
            color: lightTokens.axisLabelFill,
          },
        });
      });

      const dataUrl = tempChart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
      tempChart.dispose();
      return dataUrl;
    } catch {
      return chartRef.current.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    } finally {
      document.body.removeChild(offscreenDiv);
    }
  }, [mergedOption]);

  // ---- Error state ----
  if (error) {
    return (
      <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <span className="text-xs">
          <span className="app-text-danger">ECharts Error: {error}</span>
        </span>
      </div>
    );
  }

  // ---- Normal render ----
  return (
    <div
      ref={viewportRef}
      className="w-full p-4 rounded-xl ring ring-border bg-surface-elevated group relative"
    >
      <div className="flex items-center gap-2 mb-3">
        <ChartBar size={14} className="text-accent" />
        <span className="text-xs text-foreground-muted font-semibold">
          {chartTitle ?? "ECharts"}
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground-muted">
          {chartType}
        </span>
      </div>
      <ChartToolbar
        containerRef={containerRef}
        engine="echarts"
        isDark={isDark}
        chartType={chartType}
        spec={activeSpec}
        onEdit={handleOpenEditor}
        getDataUrl={getDataUrl}
      />
      <div className="relative overflow-hidden">
        <div
          ref={containerRef}
          className={`echarts-container ${inViewport ? "chart-animate-in" : ""}`}
          style={{
            height: 400,
            width: "100%",
            opacity: inViewport ? undefined : 0,
            transform: inViewport ? undefined : "translateY(12px)",
          }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/85">
            <span className="text-sm text-foreground-muted">Rendering...</span>
          </div>
        )}
      </div>
      {showEditor && (
        <Suspense fallback={null}>
          <LazyChartEditor
            spec={activeSpec}
            engine="echarts"
            onApply={handleApplyEdit}
            onClose={handleCloseEditor}
          />
        </Suspense>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Lazy export — thin wrapper for code-splitting boundary
// ---------------------------------------------------------------------------

export const LazyEChartsRenderer = memo(function LazyEChartsRenderer(
  props: EChartsRendererProps,
): ReactNode {
  return <EChartsRendererInner {...props} />;
});
