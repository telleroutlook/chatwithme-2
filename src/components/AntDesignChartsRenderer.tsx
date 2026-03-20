import { memo, useMemo, useRef, useCallback, useState, lazy, Suspense, type ReactNode, type FC } from "react";
import { ChartBar } from "@phosphor-icons/react";
import type { ParsedAdcSpec, AdcChartType } from "../utils/adcSpecParser";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { useChatSessionContext } from "../features/chat/context/ChatSessionContext";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { useInViewport } from "../hooks/useInViewport";
import { getChartThemeTokens } from "./chartThemeTokens";
import { getChartVisualPreset } from "./chartVisualPreset";
import { ChartToolbar } from "./ChartToolbar";

// Lazy-load ChartEditor (only when user clicks Edit)
const LazyChartEditor = lazy(() => import("./ChartEditor"));

// ============ Static Imports for Tree-shaking ============

import {
  Line,
  Column,
  Bar,
  Area,
  Pie,
  Rose,
  Scatter,
  Radar,
  Gauge,
  Heatmap,
  Funnel,
  Histogram,
  DualAxes,
  ConfigProvider,
} from "@ant-design/charts";

// ============ Component Mapping ============

const CHART_COMPONENTS: Record<AdcChartType, FC<Record<string, unknown>>> = {
  line: Line,
  column: Column,
  bar: Bar,
  area: Area,
  pie: Pie,
  rose: Rose,
  scatter: Scatter,
  radar: Radar,
  gauge: Gauge,
  heatmap: Heatmap,
  funnel: Funnel,
  histogram: Histogram,
  dualAxes: DualAxes,
};

// ============ Wide-to-Long Data Format Conversion ============

/**
 * Detect and convert "wide format" data to "long/tidy format" for ADC 2.x.
 *
 * Wide format (WRONG for ADC):
 *   data: [{ category: "A", "美国": 100, "中国": 50 }]
 *   yField: ["美国", "中国"]   or   seriesField: "type" with no matching field
 *
 * Long format (CORRECT for ADC):
 *   data: [{ category: "A", value: 100, series: "美国" }, { category: "A", value: 50, series: "中国" }]
 *   yField: "value", colorField: "series"
 *
 * This function auto-detects wide format and converts it, preventing blank charts.
 */
function normalizeWideToLong(
  type: AdcChartType,
  config: Record<string, unknown>
): Record<string, unknown> {
  // Only applies to chart types that use xField + yField (not pie, funnel, histogram, gauge)
  const applicableTypes = new Set(["line", "column", "bar", "area", "scatter", "radar"]);
  if (!applicableTypes.has(type)) return config;

  const data = config.data;
  if (!Array.isArray(data) || data.length === 0) return config;

  const xField = config.xField;
  if (typeof xField !== "string") return config;

  const yField = config.yField;

  // Case 1: yField is an array of strings → wide format (e.g., yField: ["美国", "中国"])
  // This is a DualAxes pattern that doesn't work for Column/Radar/etc.
  if (Array.isArray(yField) && yField.length >= 2 && yField.every((f) => typeof f === "string")) {
    const seriesNames = yField as string[];
    // Verify the data actually has these fields as keys
    const firstRow = data[0] as Record<string, unknown>;
    const hasWideFields = seriesNames.every((s) => s in firstRow);
    if (!hasWideFields) return config;

    // Pivot wide → long
    const longData: Record<string, unknown>[] = [];
    for (const row of data as Record<string, unknown>[]) {
      for (const series of seriesNames) {
        longData.push({
          [xField]: row[xField],
          _value: row[series],
          _series: series,
        });
      }
    }

    const result = { ...config };
    result.data = longData;
    result.yField = "_value";
    result.colorField = "_series";
    // For column charts, enable grouping so bars appear side by side
    if (type === "column" || type === "bar") {
      result.group = true;
    }
    // Remove legacy seriesField if present
    delete result.seriesField;
    return result;
  }

  // Case 2: yField is a string but doesn't exist in data rows, while multiple numeric
  // fields exist → likely wide format without explicit yField array
  if (typeof yField === "string") {
    const firstRow = data[0] as Record<string, unknown>;
    if (yField in firstRow) return config; // yField exists, data is fine

    // yField doesn't exist in data. Check if there are multiple numeric keys
    // that look like series names (i.e., not the xField)
    const numericKeys = Object.keys(firstRow).filter(
      (k) => k !== xField && typeof firstRow[k] === "number"
    );
    if (numericKeys.length >= 2) {
      // Pivot wide → long
      const longData: Record<string, unknown>[] = [];
      for (const row of data as Record<string, unknown>[]) {
        for (const key of numericKeys) {
          longData.push({
            [xField]: row[xField],
            _value: row[key],
            _series: key,
          });
        }
      }

      const result = { ...config };
      result.data = longData;
      result.yField = "_value";
      result.colorField = "_series";
      if (type === "column" || type === "bar") {
        result.group = true;
      }
      delete result.seriesField;
      return result;
    }
  }

  return config;
}

// ============ Config Normalization for ADC 2.x React ============

/**
 * Normalize user config for ADC 2.x React components
 *
 * ADC 2.x React label format:
 * - Simple: label: { text: 'fieldName', style: {...} }
 * - Advanced: label: { text: (d) => `${d.value}%`, style: {...} }
 *
 * Legacy format (NOT supported in ADC 2.x React):
 * - label: { type: 'inner', content: '{value}%' }
 */
export function normalizeConfigForADC2(
  type: AdcChartType,
  config: Record<string, unknown>,
  isDark: boolean
): Record<string, unknown> {
  // Pre-normalize: fix yField if AI output it as an object like { "probability": "probability" }
  const preFixed = { ...config };
  if (preFixed.yField && typeof preFixed.yField === "object" && !Array.isArray(preFixed.yField)) {
    const yFieldObj = preFixed.yField as Record<string, unknown>;
    const values = Object.values(yFieldObj);
    const stringVal = values.find((v) => typeof v === "string") as string | undefined;
    if (stringVal) {
      preFixed.yField = stringVal;
    }
  }

  // First: auto-convert wide format to long format if needed
  const normalizedConfig = normalizeWideToLong(type, preFixed);

  // Preserve user config by default, then override fields that require normalization.
  const result: Record<string, unknown> = { ...normalizedConfig };
  const themeTokens = getChartThemeTokens(isDark);

  // Migrate legacy seriesField → colorField (v1 → v2)
  if (typeof result.seriesField === "string" && !result.colorField) {
    result.colorField = result.seriesField;
  }
  delete result.seriesField;

  // Remove title — it's for our header display, not an ADC config field
  delete result.title;

  // ============ Migrate legacy columnStyle → style ============
  if (type === "column" || type === "bar") {
    const legacyStyle = config.columnStyle || config.barStyle;
    if (legacyStyle && typeof legacyStyle === "object" && !result.style) {
      result.style = legacyStyle;
    }
    delete result.columnStyle;
    delete result.barStyle;
  }

  // ============ Remove legacy geometryOptions (v1 DualAxes) ============
  delete result.geometryOptions;

  // ============ Core Data (Required) ============
  const rawData = result.data;

  // Coerce string yField values to numbers for chart types that need numeric y-axis.
  // AI sometimes outputs values like "~1.1%", "3,500", "$120" which are strings.
  const numericYTypes = new Set(["line", "column", "bar", "area", "scatter", "histogram"]);
  if (numericYTypes.has(type) && Array.isArray(rawData) && typeof result.yField === "string") {
    const yKey = result.yField;
    const firstRow = rawData[0] as Record<string, unknown> | undefined;
    if (firstRow && typeof firstRow[yKey] === "string") {
      result.data = (rawData as Record<string, unknown>[]).map((row) => {
        const val = row[yKey];
        if (typeof val === "string") {
          // Strip common decorators: ~, %, $, ¥, €, commas, spaces
          const cleaned = val.replace(/[~%$¥€,\s]/g, "");
          const num = Number(cleaned);
          if (!isNaN(num)) {
            return { ...row, [yKey]: num };
          }
        }
        return row;
      });
    }
  }

  if (type === "dualAxes" && Array.isArray(result.data)) {
    const dualData = result.data as unknown[];
    const yField = result.yField;
    const hasDualYFields =
      Array.isArray(yField) &&
      yField.length >= 2 &&
      yField.every((field) => typeof field === "string");

    if (dualData.length > 0 && !Array.isArray(dualData[0])) {
      if (hasDualYFields) {
        // DualAxes expects two datasets. If model output provides one flat dataset with two metrics,
        // duplicate it so each axis can consume one yField from the same rows.
        result.data = [dualData, dualData];
      } else {
        // AI provided long-format data with a single yField + colorField/group.
        // This is actually a grouped column pattern, not a true dual-axes.
        // Try to detect and pivot: if data has a colorField/group discriminator,
        // extract the two unique groups as separate yFields.
        const colorKey = (result.colorField || result.seriesField) as string | undefined;
        const xField = result.xField as string | undefined;
        const singleYField = typeof yField === "string" ? yField : null;

        if (colorKey && xField && singleYField) {
          const groups = [...new Set((dualData as Record<string, unknown>[]).map((d) => String(d[colorKey])))];
          if (groups.length === 2) {
            // Pivot long → wide for DualAxes: merge two series into one row per xField value
            const xValues = [...new Set((dualData as Record<string, unknown>[]).map((d) => d[xField]))];
            const lookup = new Map<string, Record<string, unknown>>();
            for (const row of dualData as Record<string, unknown>[]) {
              lookup.set(`${row[xField]}::${row[colorKey]}`, row);
            }
            const pivotedData: Record<string, unknown>[] = [];
            for (const x of xValues) {
              const row: Record<string, unknown> = { [xField]: x };
              for (const g of groups) {
                const src = lookup.get(`${x}::${g}`);
                row[g] = src ? src[singleYField] : 0;
              }
              pivotedData.push(row);
            }
            result.data = [pivotedData, pivotedData];
            result.yField = groups;
            delete result.colorField;
            delete result.seriesField;
            delete result.group;
          }
        }
      }
    }
  } else if (!Array.isArray(result.data)) {
    result.data = [];
  }

  // ============ Geometry ============
  if (typeof config.radius === "number") result.radius = config.radius;
  if (typeof config.innerRadius === "number") result.innerRadius = config.innerRadius;
  if (typeof config.appendPadding === "number") result.appendPadding = config.appendPadding;
  if (typeof config.padding === "number" || typeof config.padding === "string") {
    result.padding = config.padding;
  }

  // ============ Label (ADC 2.x React format) ============
  if (config.label === false) {
    result.label = false;
  } else if (config.label && typeof config.label === "object") {
    const label = config.label as Record<string, unknown>;
    const normalizedLabel: Record<string, unknown> = {};

    // Determine the text field
    let textField = "";
    if (label.text) {
      textField = String(label.text);
    } else if (label.content) {
      // Convert legacy "{value}%" -> extract "value"
      const contentStr = String(label.content);
      const match = contentStr.match(/\{(\w+)\}/);
      textField = match ? match[1] : contentStr.replace(/[{}%]/g, "");
    } else if (type === "pie" && config.angleField) {
      textField = String(config.angleField);
    }

    if (textField) {
      normalizedLabel.text = textField;
    }

    // Style with theme - keep user's style but override fill for visibility
    const userStyle = label.style as Record<string, unknown> || {};
    normalizedLabel.style = {
      ...userStyle,
      fontSize: userStyle.fontSize || 12,
      textAlign: userStyle.textAlign || "center",
      // Force theme-aware label color so text follows light/dark mode.
      fill: isDark ? "#ffffff" : "#333333",
    };

    result.label = normalizedLabel;
  } else if (type === "pie") {
    // Default label for pie charts if not specified
    result.label = {
      text: config.angleField || "value",
      style: {
        fill: isDark ? "#ffffff" : "#333333",
        fontSize: 12,
      },
    };
  }

  // ============ Legend ============
  if (config.legend === false) {
    result.legend = false;
  } else if (config.legend && typeof config.legend === "object") {
    // Merge user legend config but force theme-aware legend text color.
    const legend = config.legend as Record<string, unknown>;
    const color = legend.color && typeof legend.color === "object"
      ? (legend.color as Record<string, unknown>)
      : {};
    const itemName = color.itemName && typeof color.itemName === "object"
      ? (color.itemName as Record<string, unknown>)
      : {};
    const itemNameStyle = itemName.style && typeof itemName.style === "object"
      ? (itemName.style as Record<string, unknown>)
      : {};

    result.legend = {
      ...legend,
      color: {
        ...color,
        itemName: {
          ...itemName,
          style: {
            ...itemNameStyle,
            fill: themeTokens.legendItemFill,
          },
        },
      },
    };
  } else {
    // Default legend with theme
    result.legend = {
      color: {
        title: false,
        position: "right",
        itemMarkerSize: 10,
        itemName: {
          style: {
            fill: themeTokens.legendItemFill,
            fontSize: 12,
          },
        },
      },
    };
  }

  // ============ Axis ============
  const chartsWithAxis = new Set([
    "line",
    "column",
    "bar",
    "area",
    "scatter",
    "radar",
    "heatmap",
    "dualAxes",
    "histogram",
  ]);

  const mergeAxisConfig = (axisConfig: unknown): Record<string, unknown> => {
    const axis = axisConfig && typeof axisConfig === "object" ? (axisConfig as Record<string, unknown>) : {};
    const label = axis.label && typeof axis.label === "object" ? (axis.label as Record<string, unknown>) : {};
    const title = axis.title && typeof axis.title === "object" ? (axis.title as Record<string, unknown>) : {};
    const line = axis.line && typeof axis.line === "object" ? (axis.line as Record<string, unknown>) : {};
    const tickLine =
      axis.tickLine && typeof axis.tickLine === "object"
        ? (axis.tickLine as Record<string, unknown>)
        : {};
    const grid = axis.grid && typeof axis.grid === "object" ? (axis.grid as Record<string, unknown>) : {};
    const gridLine = grid.line && typeof grid.line === "object" ? (grid.line as Record<string, unknown>) : {};

    const labelStyle =
      label.style && typeof label.style === "object"
        ? (label.style as Record<string, unknown>)
        : {};
    const titleStyle =
      title.style && typeof title.style === "object"
        ? (title.style as Record<string, unknown>)
        : {};
    const lineStyle =
      line.style && typeof line.style === "object"
        ? (line.style as Record<string, unknown>)
        : {};
    const tickLineStyle =
      tickLine.style && typeof tickLine.style === "object"
        ? (tickLine.style as Record<string, unknown>)
        : {};
    const gridLineStyle =
      gridLine.style && typeof gridLine.style === "object"
        ? (gridLine.style as Record<string, unknown>)
        : {};

    return {
      ...axis,
      label: {
        ...label,
        style: {
          ...labelStyle,
          fill: themeTokens.axisLabelFill,
        },
      },
      title: {
        ...title,
        style: {
          ...titleStyle,
          fill: themeTokens.axisTitleFill,
        },
      },
      line: {
        ...line,
        style: {
          ...lineStyle,
          stroke: themeTokens.axisLineStroke,
        },
      },
      tickLine: {
        ...tickLine,
        style: {
          ...tickLineStyle,
          stroke: themeTokens.axisLineStroke,
        },
      },
      grid: {
        ...grid,
        line: {
          ...gridLine,
          style: {
            ...gridLineStyle,
            stroke: themeTokens.axisGridStroke,
          },
        },
      },
    };
  };

  if (chartsWithAxis.has(type)) {
    if (config.xAxis !== false) {
      result.xAxis = mergeAxisConfig(config.xAxis);
    }

    if (config.yAxis !== false) {
      if (Array.isArray(config.yAxis)) {
        result.yAxis = config.yAxis.map((axisItem) => mergeAxisConfig(axisItem));
      } else {
        result.yAxis = mergeAxisConfig(config.yAxis);
      }
    }

    if (config.axis !== false) {
      result.axis = {
        x: {
          titleFill: themeTokens.axisTitleFill,
          labelFill: themeTokens.axisLabelFill,
          lineStroke: themeTokens.axisLineStroke,
          gridStroke: themeTokens.axisGridStroke,
        },
        y: {
          titleFill: themeTokens.axisTitleFill,
          labelFill: themeTokens.axisLabelFill,
          lineStroke: themeTokens.axisLineStroke,
          gridStroke: themeTokens.axisGridStroke,
        },
      };
    }
  }

  // ============ Interactions (ADC 2.x G2 interaction array) ============
  if (Array.isArray(config.interactions)) {
    result.interactions = config.interactions;
  }

  // ============ Interaction (ADC 2.x shorthand object) ============
  // Add elementHighlight + tooltip as defaults for all chart types.
  // User-supplied interaction config takes priority.
  const defaultInteraction: Record<string, unknown> = {
    elementHighlight: true,
    tooltip: true,
  };

  if (config.interaction && typeof config.interaction === "object") {
    const interaction = config.interaction as Record<string, unknown>;
    // Merge: user overrides take priority over defaults
    result.interaction = { ...defaultInteraction, ...interaction };
  } else if (config.interaction === false) {
    // User explicitly disabled all interactions
    result.interaction = false;
  } else {
    // No user interaction config — apply defaults
    result.interaction = defaultInteraction;
  }

  // ============ Style ============
  if (config.style && typeof config.style === "object") {
    result.style = config.style;
  }

  return result;
}

// ============ Props ============

interface AntDesignChartsRendererProps {
  spec: ParsedAdcSpec;
  animated?: boolean;
}

export interface AdcConfigSanitizeResult {
  config: Record<string, unknown>;
  removedFields: string[];
}

export function sanitizeAdcConfig(config: Record<string, unknown>): AdcConfigSanitizeResult {
  const removedFields: string[] = [];
  const nextConfig: Record<string, unknown> = { ...config };

  if (config.label && typeof config.label === "object" && !Array.isArray(config.label)) {
    const label = config.label as Record<string, unknown>;
    if ("position" in label) {
      removedFields.push("label.position");
      const { position: _position, ...restLabel } = label;
      nextConfig.label = restLabel;
    }
  }

  return {
    config: nextConfig,
    removedFields,
  };
}

// ============ Main Renderer ============

const AntDesignChartsRenderer = memo(function AntDesignChartsRenderer({
  spec,
}: AntDesignChartsRendererProps): ReactNode {
  const isDark = useThemeDetector();
  const themeTokens = useMemo(() => getChartThemeTokens(isDark), [isDark]);
  const visualPreset = useMemo(() => getChartVisualPreset(isDark), [isDark]);
  const { currentSessionId } = useChatSessionContext();
  const trackedReadyRef = useRef(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { ref: viewportRef, inViewport } = useInViewport({ threshold: 0.1 });

  // Editor state: tracks edited spec overlay (null = use original)
  const [editedSpec, setEditedSpec] = useState<ParsedAdcSpec | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Use edited spec if available, otherwise fall back to original
  const activeSpec = editedSpec ?? spec;
  const ChartComponent = CHART_COMPONENTS[activeSpec.type];

  const onReady = useCallback(() => {
    if (trackedReadyRef.current) return;
    trackedReadyRef.current = true;
    trackChatEvent("chart_render_success", {
      engine: "adc",
      type: activeSpec.type,
      sessionId: currentSessionId,
    });
  }, [activeSpec.type, currentSessionId]);

  // Normalize config for ADC 2.x React
  const chartConfig = useMemo(() => {
    const sanitized = sanitizeAdcConfig(activeSpec.config);
    return normalizeConfigForADC2(activeSpec.type, sanitized.config, isDark);
  }, [activeSpec.type, activeSpec.config, isDark]);

  const adcCommonConfig = useMemo(
    () => ({
      style: {
        fontFamily: visualPreset.fontFamily,
      },
      theme: {
        type: isDark ? "dark" : "light",
        color: visualPreset.category10[0],
        category10: visualPreset.category10,
        category20: visualPreset.category20,
        axis: {
          titleFill: themeTokens.axisTitleFill,
          labelFill: themeTokens.axisLabelFill,
          lineStroke: themeTokens.axisLineStroke,
          gridStroke: themeTokens.axisGridStroke,
        },
        legend: {
          itemLabelFill: themeTokens.legendItemFill,
        },
      },
    }),
    [isDark, themeTokens, visualPreset]
  );

  // Editor callbacks
  const handleOpenEditor = useCallback(() => setShowEditor(true), []);
  const handleCloseEditor = useCallback(() => setShowEditor(false), []);
  const handleApplyEdit = useCallback(
    (newSpec: Record<string, unknown>) => {
      // Extract type from the edited spec, falling back to the current type
      const newType = (typeof newSpec.type === "string" ? newSpec.type : activeSpec.type) as AdcChartType;
      const { type: _type, ...config } = newSpec;
      setEditedSpec({ type: newType, config });
    },
    [activeSpec.type]
  );

  // Build the flat spec object for the editor (type + config merged)
  const editorSpec = useMemo<Record<string, unknown>>(
    () => ({ type: activeSpec.type, ...activeSpec.config }),
    [activeSpec]
  );

  // Extract user-friendly title from config (AI may set title or meta.title)
  const chartTitle = useMemo(() => {
    const cfg = activeSpec.config;
    if (typeof cfg.title === "string" && cfg.title.trim()) return cfg.title.trim();
    if (cfg.meta && typeof cfg.meta === "object" && !Array.isArray(cfg.meta)) {
      const meta = cfg.meta as Record<string, unknown>;
      if (typeof meta.title === "string" && meta.title.trim()) return meta.title.trim();
    }
    return null;
  }, [activeSpec.config]);

  if (!ChartComponent) {
    return (
      <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <span className="text-xs">
          <span className="app-text-danger">Unknown chart type: {activeSpec.type}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className="w-full p-4 rounded-xl ring ring-border bg-surface-elevated group relative"
    >
      <div className="flex items-center gap-2 mb-3">
        <ChartBar size={14} className="text-accent" />
        <span className="text-xs text-foreground-muted font-semibold">
          {chartTitle ?? "Ant Design Charts"}
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground-muted">
          {activeSpec.type}
        </span>
      </div>
      <ChartToolbar
        containerRef={chartContainerRef}
        engine="adc"
        chartType={activeSpec.type}
        spec={activeSpec}
        onEdit={handleOpenEditor}
      />
      <div
        ref={chartContainerRef}
        className={`adc-chart-container ${inViewport ? "chart-animate-in" : ""}`}
        style={{
          minHeight: 300,
          width: "100%",
          opacity: inViewport ? undefined : 0,
          transform: inViewport ? undefined : "translateY(12px)",
        }}
        data-chart-theme-axis-label-fill={themeTokens.axisLabelFill}
        data-chart-theme-axis-line-stroke={themeTokens.axisLineStroke}
        data-chart-theme-grid-stroke={themeTokens.axisGridStroke}
      >
        <ConfigProvider
          common={adcCommonConfig}
        >
          <ChartComponent
            {...chartConfig}
            theme={adcCommonConfig.theme}
            animate={inViewport ? true : false}
            onReady={onReady}
          />
        </ConfigProvider>
      </div>
      {showEditor && (
        <Suspense fallback={null}>
          <LazyChartEditor
            spec={editorSpec}
            engine="adc"
            onApply={handleApplyEdit}
            onClose={handleCloseEditor}
          />
        </Suspense>
      )}
    </div>
  );
});

// ============ Lazy Export ============

export const LazyAntDesignChartsRenderer = memo(function LazyAntDesignChartsRenderer(
  props: AntDesignChartsRendererProps
): ReactNode {
  return <AntDesignChartsRenderer {...props} />;
});
