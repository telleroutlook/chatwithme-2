/**
 * VegaLiteRenderer -- renders a Vega-Lite spec in a container with
 * theme support, auto-resize, toolbar, and error handling.
 *
 * The heavy `vega-embed` module is imported lazily so it only loads when the
 * first Vega-Lite block appears in the conversation.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  type ReactNode,
} from "react";
import { ChartBar } from "@phosphor-icons/react";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { useChatSessionContext } from "../features/chat/context/ChatSessionContext";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { useInViewport } from "../hooks/useInViewport";
import { ChartToolbar } from "./ChartToolbar";
import { getChartThemeTokens } from "./chartThemeTokens";
import type { VegaLiteSpec } from "../utils/vegaLiteParser";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VegaLiteRendererProps {
  spec: VegaLiteSpec;
  animated?: boolean;
}

// ---------------------------------------------------------------------------
// Detect a human-friendly chart type label from the spec
// ---------------------------------------------------------------------------

function detectChartType(spec: VegaLiteSpec): string {
  // Single mark
  if (typeof spec.mark === "string") return spec.mark;
  if (spec.mark && typeof spec.mark === "object" && "type" in spec.mark) {
    return String((spec.mark as Record<string, unknown>).type);
  }
  if (spec.layer) return "layer";
  if (spec.hconcat) return "hconcat";
  if (spec.vconcat) return "vconcat";
  if (spec.concat) return "concat";
  return "chart";
}

// ---------------------------------------------------------------------------
// Build Vega-Lite config override for theme-aware styling
// ---------------------------------------------------------------------------

function buildVegaLiteThemeConfig(isDark: boolean): Record<string, unknown> {
  const t = getChartThemeTokens(isDark);
  return {
    background: "transparent",
    axis: {
      labelColor: t.axisLabelFill,
      titleColor: t.axisTitleFill,
      gridColor: t.axisGridStroke,
      domainColor: t.axisLineStroke,
      tickColor: t.axisLineStroke,
    },
    legend: {
      labelColor: t.legendItemFill,
      titleColor: t.axisTitleFill,
    },
    title: {
      color: t.titleFill,
      subtitleColor: t.axisLabelFill,
    },
    range: {
      category: t.paletteCategorical,
    },
    view: {
      stroke: "transparent",
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function VegaLiteRendererInner({ spec }: VegaLiteRendererProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<{ finalize: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { ref: viewportRef, inViewport } = useInViewport({ threshold: 0.1 });

  const isDark = useThemeDetector();
  const { currentSessionId } = useChatSessionContext();

  const chartType = detectChartType(spec);

  // Track render success once
  const trackedRef = useRef(false);
  const trackSuccess = useCallback(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackChatEvent("chart_render_success", {
      engine: "vega-lite",
      type: chartType,
      sessionId: currentSessionId,
    });
  }, [chartType, currentSessionId]);

  // ---- Init / update chart (deferred until in viewport) ----
  useEffect(() => {
    if (!inViewport) return;

    let disposed = false;

    const run = async () => {
      if (!containerRef.current) return;
      setIsLoading(true);
      setError(null);

      try {
        const vegaEmbed = (await import("vega-embed")).default;

        if (disposed) return;

        // Dispose previous view if it exists
        if (viewRef.current) {
          viewRef.current.finalize();
          viewRef.current = null;
        }

        // Clear the container before rendering
        containerRef.current.innerHTML = "";

        const result = await vegaEmbed(containerRef.current, spec as Record<string, unknown>, {
          theme: isDark ? "dark" : undefined,
          config: buildVegaLiteThemeConfig(isDark),
          actions: { export: true, source: false, compiled: false, editor: false },
          renderer: "svg",
        });

        if (disposed) {
          result.view.finalize();
          return;
        }

        viewRef.current = result.view as unknown as { finalize: () => void };
        trackSuccess();

        // ---- Auto-resize via ResizeObserver ----
        const ro = new ResizeObserver(() => {
          if (!disposed && containerRef.current && viewRef.current) {
            // Re-render by re-embedding — Vega-Lite doesn't have a resize API
            // We debounce by just calling view.resize()
            try {
              (viewRef.current as unknown as { resize: () => { run: () => void } }).resize().run();
            } catch {
              // Ignore resize errors — view may be finalized
            }
          }
        });
        ro.observe(containerRef.current);

        // Store for cleanup
        (containerRef.current as unknown as Record<string, unknown>).__vlRo = ro;
      } catch (err) {
        if (!disposed) {
          const msg = err instanceof Error ? err.message : "Failed to render Vega-Lite chart";
          setError(msg);
          trackChatEvent("chart_render_failure", {
            engine: "vega-lite",
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
      // Disconnect ResizeObserver
      if (containerRef.current) {
        const ro = (containerRef.current as unknown as Record<string, unknown>).__vlRo;
        if (ro instanceof ResizeObserver) {
          ro.disconnect();
        }
      }
      if (viewRef.current) {
        viewRef.current.finalize();
        viewRef.current = null;
      }
    };
  }, [inViewport, spec, isDark, trackSuccess, currentSessionId]);

  // ---- Error state ----
  if (error) {
    return (
      <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <span className="text-xs">
          <span className="app-text-danger">Vega-Lite Error: {error}</span>
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
          Vega-Lite Chart
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground-muted">
          {chartType}
        </span>
      </div>
      <ChartToolbar
        containerRef={containerRef}
        engine="vega-lite"
        chartType={chartType}
        spec={spec}
      />
      <div className="relative overflow-hidden">
        <div
          ref={containerRef}
          className={`vega-lite-container ${inViewport ? "chart-animate-in" : ""}`}
          style={{
            minHeight: 300,
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memo export (matches ECharts/ADC pattern)
// ---------------------------------------------------------------------------

export const LazyVegaLiteRenderer = memo(function LazyVegaLiteRenderer(
  props: VegaLiteRendererProps,
): ReactNode {
  return <VegaLiteRendererInner {...props} />;
});
