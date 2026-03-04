import { useEffect, useRef, useState, memo, useMemo, useCallback } from "react";
import { Text, Surface, Badge } from "@cloudflare/kumo";
import { ChartBar } from "@phosphor-icons/react";
import { sanitizeMermaidCode, validateMermaidCode } from "../utils/mermaidValidator";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { useChatSessionContext } from "../features/chat/context/ChatSessionContext";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { getChartThemeTokens } from "./chartThemeTokens";

// ============ Mermaid Renderer ============

interface MermaidRendererProps {
  code: string;
  animated?: boolean;
}

export function MermaidRenderer({ code, animated = false }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isDark = useThemeDetector();
  const { currentSessionId } = useChatSessionContext();
  const sanitizedCode = useMemo(() => sanitizeMermaidCode(code), [code]);

  // Pre-render validation
  const validationError = useMemo(() => {
    const result = validateMermaidCode(sanitizedCode.sanitized);
    if (!result.valid) {
      return result.error || "Invalid Mermaid code";
    }
    return null;
  }, [sanitizedCode.sanitized]);

  useEffect(() => {
    // Skip rendering if pre-validation failed
    if (validationError) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const renderMermaid = async () => {
      if (mounted) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const mermaid = (await import("mermaid")).default;

        // Initialize mermaid with theme
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
          flowchart: {
            htmlLabels: true,
          },
        });

        const renderId = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(renderId, sanitizedCode.sanitized.trim());

        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.innerHTML = svg;

          trackChatEvent("chart_render_success", {
            engine: "mermaid",
            sessionId: currentSessionId
          });

        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : "Failed to render diagram";
          setError(errorMessage);
          trackChatEvent("chart_render_failure", {
            engine: "mermaid",
            errorCode: errorMessage,
            sessionId: currentSessionId
          });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    renderMermaid();

    return () => {
      mounted = false;
    };
  }, [isDark, validationError, sanitizedCode.sanitized, currentSessionId]);

  // Pre-validation error display
  if (validationError) {
    return (
      <Surface className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <Text size="xs">
          <span className="app-text-danger">Mermaid Validation Error: {validationError}</span>
        </Text>
        <details className="mt-2">
          <summary className="text-xs text-kumo-subtle cursor-pointer">View code</summary>
          <pre className="mt-1 text-xs bg-kumo-control p-2 rounded overflow-auto max-h-32">
            {code}
          </pre>
        </details>
      </Surface>
    );
  }

  if (error) {
    return (
      <Surface className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <Text size="xs">
          <span className="app-text-danger">Mermaid Error: {error}</span>
        </Text>
      </Surface>
    );
  }

  return (
    <Surface className="w-full p-4 rounded-xl ring ring-kumo-line bg-[var(--surface-elevated)]">
      <div className="flex items-center gap-2 mb-2">
        <ChartBar size={14} className="text-kumo-accent" />
        <Text size="xs" variant="secondary" bold>
          Mermaid Diagram
        </Text>
      </div>
      <div className="relative overflow-x-auto">
        <div
          ref={containerRef}
          className={`mermaid-container ${animated ? "animate-fade-in" : ""}`}
          style={{ minHeight: 100 }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/85">
            <span className="text-sm text-kumo-subtle">Rendering...</span>
          </div>
        )}
      </div>
    </Surface>
  );
}

// ============ G2 Chart Renderer ============

interface G2ChartRendererProps {
  spec: {
    type?: string;
    data?: Record<string, unknown>[] | Record<string, unknown>;
    encode?: Record<string, string | number>;
    axis?: Record<string, unknown>;
    legend?: Record<string, unknown>;
    scale?: Record<string, unknown>;
    style?: Record<string, unknown>;
    children?: unknown[];
    marks?: unknown[];
  };
  animated?: boolean;
}

const DEFAULT_G2_COLOR_PALETTE = [
  "#4E79A7",
  "#F28E2b",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
];

function isLikelyValidCssColor(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6})$/i.test(normalized)) return true;
  if (/^(rgb|hsl)a?\(\s*[^)]+\)$/i.test(normalized)) return true;
  if (/^(transparent|currentColor|inherit)$/i.test(normalized)) return true;
  return false;
}

function normalizeColorScaleRange(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const color = obj.color;
  if (!color || typeof color !== "object") return value;

  const colorObj = color as Record<string, unknown>;
  const range = colorObj.range;
  if (!Array.isArray(range) || range.length === 0) return value;

  const normalizedRange = range.map((entry, index) => {
    if (typeof entry === "string" && isLikelyValidCssColor(entry)) {
      return entry;
    }
    return DEFAULT_G2_COLOR_PALETTE[index % DEFAULT_G2_COLOR_PALETTE.length];
  });

  return {
    ...obj,
    color: {
      ...colorObj,
      range: normalizedRange
    }
  };
}

interface G2ChartInstance {
  mark: (type: "interval" | "line" | "point" | "area" | "cell" | "rect") => void;
  data: (data: Record<string, unknown>[] | Record<string, unknown>) => void;
  encode: (encode: Record<string, string | number>) => void;
  axis: (axis: Record<string, unknown>) => void;
  legend: (legend: Record<string, unknown>) => void;
  scale: (scale: Record<string, unknown>) => void;
  style: (style: Record<string, unknown>) => void;
  options: (options: Record<string, unknown>) => void;
  render: () => Promise<void>;
  destroy: () => void;
  forceFit: () => void;
}

const SIMPLE_MARK_TYPES = new Set(["interval", "line", "point", "area", "cell", "rect"]);
const COMPOSITION_TYPES = new Set([
  "view",
  "spaceLayer",
  "spaceFlex",
  "facetRect",
  "facetCircle",
  "repeatMatrix",
  "timingKeyframe",
  "geoPath",
  "getView"
]);
const DATA_TRANSFORM_TYPES = new Set([
  "sortBy",
  "sort",
  "pick",
  "rename",
  "fold",
  "join",
  "filter",
  "map",
  "slice",
  "kde",
  "venn",
  "log",
  "custom",
  "ema",
]);

function normalizeComponentType(type: string): string {
  const prefixes = ["transform.", "data.", "mark.", "composition."];
  for (const prefix of prefixes) {
    if (type.startsWith(prefix)) return type.slice(prefix.length);
  }
  return type;
}

function normalizeG2Spec(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeG2Spec(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    let normalized = normalizeG2Spec(raw);

    if (key === "type" && typeof normalized === "string") {
      normalized = normalizeComponentType(normalized);
    }

    output[key] = normalized;
  }

  const transforms = Array.isArray(output.transform) ? output.transform : [];
  if (transforms.length > 0) {
    const dataTransforms: Record<string, unknown>[] = [];
    const viewTransforms: unknown[] = [];

    for (const item of transforms) {
      const itemType =
        item && typeof item === "object" && typeof (item as Record<string, unknown>).type === "string"
          ? ((item as Record<string, unknown>).type as string)
          : "";
      if (itemType && DATA_TRANSFORM_TYPES.has(itemType)) {
        dataTransforms.push(item as Record<string, unknown>);
      } else {
        viewTransforms.push(item);
      }
    }

    if (dataTransforms.length > 0) {
      const rawData = output.data;
      if (Array.isArray(rawData)) {
        output.data = { type: "inline", value: rawData, transform: dataTransforms };
      } else if (rawData && typeof rawData === "object") {
        const dataObj = { ...(rawData as Record<string, unknown>) };
        const existing = Array.isArray(dataObj.transform) ? dataObj.transform : [];
        dataObj.transform = [...existing, ...dataTransforms];
        output.data = dataObj;
      }
    }

    if (viewTransforms.length > 0) {
      output.transform = viewTransforms;
    } else {
      delete output.transform;
    }
  }

  return normalizeColorScaleRange(output);
}

export function G2ChartRenderer({ spec, animated = false }: G2ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const chartRef = useRef<G2ChartInstance | null>(null);
  const isDark = useThemeDetector();
  const { currentSessionId } = useChatSessionContext();

  const themeColors = useMemo(() => getChartThemeTokens(isDark), [isDark]);

  // Auto-fit using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      if (chartRef.current) {
        chartRef.current.forceFit();
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    let chart: G2ChartInstance | null = null;
    let destroyed = false;

    const safeDestroy = () => {
      if (!chart || destroyed) return;
      destroyed = true;
      try {
        chart.destroy();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/_container.*__remove__/i.test(message)) {
          console.error("Failed to destroy G2 chart:", err);
        }
      } finally {
        chart = null;
      }
    };

    const renderChart = async () => {
      if (mounted) {
        setIsLoading(true);
        setError(null);
      }

      try {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = "";

        const { Chart } = await import("@antv/g2");

        chart = new Chart({
          container: containerRef.current,
          autoFit: true,
        }) as unknown as G2ChartInstance;

        chartRef.current = chart;

        const normalizedSpec = normalizeG2Spec(spec) as G2ChartRendererProps["spec"];
        const specType = typeof normalizedSpec.type === "string" ? normalizedSpec.type : "";
        const hasCompositionChildren =
          (Array.isArray(normalizedSpec.children) && normalizedSpec.children.length > 0) ||
          (Array.isArray(normalizedSpec.marks) && normalizedSpec.marks.length > 0);
        const shouldUseOptions = hasCompositionChildren || COMPOSITION_TYPES.has(specType);

        // Apply theme-aware axis defaults
        const userAxis = (normalizedSpec.axis || {}) as Record<string, unknown>;
        const userAxisX =
          userAxis.x && typeof userAxis.x === "object" ? (userAxis.x as Record<string, unknown>) : {};
        const userAxisY =
          userAxis.y && typeof userAxis.y === "object" ? (userAxis.y as Record<string, unknown>) : {};

        const themeAwareAxis = {
          x: {
            ...userAxisX,
            titleFontSize: userAxisX.titleFontSize || 12,
            titleFill: themeColors.axisTitleFill,
            labelFill: themeColors.axisLabelFill,
            lineStroke: themeColors.axisLineStroke,
            tickStroke: themeColors.axisLineStroke,
            gridStroke: themeColors.axisGridStroke,
          },
          y: {
            ...userAxisY,
            titleFontSize: userAxisY.titleFontSize || 12,
            titleFill: themeColors.axisTitleFill,
            labelFill: themeColors.axisLabelFill,
            lineStroke: themeColors.axisLineStroke,
            tickStroke: themeColors.axisLineStroke,
            gridStroke: themeColors.axisGridStroke,
          },
        };

        // Apply theme-aware legend defaults
        const userLegend = (normalizedSpec.legend || {}) as Record<string, unknown>;
        const userLegendColor =
          userLegend.color && typeof userLegend.color === "object"
            ? (userLegend.color as Record<string, unknown>)
            : {};
        const themeAwareLegend = {
          ...userLegend,
          color: {
            ...userLegendColor,
            itemMarkerFill: themeColors.legendItemFill,
            itemNameFill: themeColors.legendItemFill,
          },
        };

        if (shouldUseOptions) {
          // For composition types, merge theme colors into spec
          const themedSpec = {
            ...normalizedSpec,
            axis: themeAwareAxis,
            legend: themeAwareLegend,
          };
          chart.options(themedSpec as Record<string, unknown>);
        } else {
          if (SIMPLE_MARK_TYPES.has(specType)) {
            chart.mark(specType as "interval" | "line" | "point" | "area" | "cell" | "rect");
          }

          if (normalizedSpec.data) {
            chart.data(normalizedSpec.data);
          }

          if (normalizedSpec.encode) {
            chart.encode(normalizedSpec.encode as Record<string, string | number>);
          }

          // Apply theme-aware axis and legend
          chart.axis(themeAwareAxis as Record<string, unknown>);
          if (normalizedSpec.legend) {
            chart.legend(themeAwareLegend as Record<string, unknown>);
          }
          if (normalizedSpec.scale) chart.scale(normalizedSpec.scale as Record<string, unknown>);
          if (normalizedSpec.style) chart.style(normalizedSpec.style as Record<string, unknown>);
        }

        await chart.render();

        trackChatEvent("chart_render_success", {
          engine: "g2",
          sessionId: currentSessionId
        });

        if (!mounted) {
          safeDestroy();
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : "Failed to render chart";
          setError(errorMessage);
          trackChatEvent("chart_render_failure", {
            engine: "g2",
            errorCode: errorMessage,
            sessionId: currentSessionId
          });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      mounted = false;
      safeDestroy();
      chartRef.current = null;
    };
  }, [spec, themeColors, currentSessionId]);

  if (error) {
    return (
      <Surface className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <Text size="xs">
          <span className="app-text-danger">G2 Chart Error: {error}</span>
        </Text>
      </Surface>
    );
  }

  return (
    <Surface className="w-full p-4 rounded-xl ring ring-kumo-line bg-[var(--surface-elevated)]">
      <div className="flex items-center gap-2 mb-2">
        <ChartBar size={14} className="text-kumo-accent" />
        <Text size="xs" variant="secondary" bold>
          G2 Chart
        </Text>
        {spec.type && <Badge variant="secondary">{String(spec.type)}</Badge>}
      </div>
      <div className="relative">
        <div
          ref={containerRef}
          className={`g2-chart-container ${animated ? "animate-fade-in" : ""}`}
          data-chart-theme-axis-label-fill={themeColors.axisLabelFill}
          data-chart-theme-axis-line-stroke={themeColors.axisLineStroke}
          data-chart-theme-grid-stroke={themeColors.axisGridStroke}
          style={{ minHeight: 200 }}  // Minimum height only
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80">
            <span className="text-sm text-kumo-subtle">Rendering chart...</span>
          </div>
        )}
      </div>
    </Surface>
  );
}
