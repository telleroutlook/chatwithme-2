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
    saveAsImage: {},
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

function EChartsRendererInner({ spec }: EChartsRendererProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("echarts")["init"]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { ref: viewportRef, inViewport } = useInViewport({ threshold: 0.1 });

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

    const merged: EChartsOption = {
      ...BASE_OPTIONS,
      ...activeSpec,
      tooltip: { ...baseTooltip, ...userTooltip },
      toolbox,
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
        (chart as unknown as Record<string, unknown>).__ro = ro;
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
      if (chartRef.current) {
        // Disconnect ResizeObserver
        const ro = (chartRef.current as unknown as Record<string, unknown>).__ro;
        if (ro instanceof ResizeObserver) {
          ro.disconnect();
        }
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
        chartType={chartType}
        spec={activeSpec}
        onEdit={handleOpenEditor}
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
}

// ---------------------------------------------------------------------------
// Memo export (matches ADC pattern)
// ---------------------------------------------------------------------------

export const LazyEChartsRenderer = memo(function LazyEChartsRenderer(
  props: EChartsRendererProps,
): ReactNode {
  return <EChartsRendererInner {...props} />;
});
