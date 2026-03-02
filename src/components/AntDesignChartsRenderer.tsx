import { memo, useMemo, useEffect, useState, type ReactNode, type FC } from "react";
import { Text, Surface, Badge } from "@cloudflare/kumo";
import { ChartBar } from "@phosphor-icons/react";
import type { ParsedAdcSpec, AdcChartType } from "../utils/adcSpecParser";

// ============ Static Imports for Tree-shaking ============

import {
  Line,
  Column,
  Bar,
  Area,
  Pie,
  Scatter,
  Radar,
  Gauge,
  Heatmap,
  Funnel,
  Histogram,
  DualAxes,
} from "@ant-design/charts";

// ============ Theme Detection Hook ============

function useThemeDetector() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-mode") === "dark";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.getAttribute("data-mode") === "dark";
      setIsDark(dark);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

// ============ Component Mapping ============

const CHART_COMPONENTS: Record<AdcChartType, FC<Record<string, unknown>>> = {
  line: Line,
  column: Column,
  bar: Bar,
  area: Area,
  pie: Pie,
  scatter: Scatter,
  radar: Radar,
  gauge: Gauge,
  heatmap: Heatmap,
  funnel: Funnel,
  histogram: Histogram,
  dualAxes: DualAxes,
};

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
function normalizeConfigForADC2(
  type: AdcChartType,
  config: Record<string, unknown>,
  isDark: boolean
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // ============ Core Data (Required) ============
  result.data = Array.isArray(config.data) ? config.data : [];

  // ============ Field Mappings ============
  if (config.angleField) result.angleField = config.angleField;
  if (config.colorField) result.colorField = config.colorField;
  if (config.xField) result.xField = config.xField;
  if (config.yField) result.yField = config.yField;
  if (config.seriesField) result.seriesField = config.seriesField;

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
      fill: userStyle.fill || (isDark ? "#ffffff" : "#333333"),
      fontSize: userStyle.fontSize || 12,
      textAlign: userStyle.textAlign || "center",
      ...userStyle,
    };

    // Only add position if user specified it (don't add default)
    if (label.position) {
      normalizedLabel.position = label.position;
    }

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
    // Use user's legend config with theme adjustments
    result.legend = config.legend;
  } else {
    // Default legend with theme
    result.legend = {
      color: {
        title: false,
        position: "right",
        itemMarkerSize: 10,
        itemName: {
          style: {
            fill: isDark ? "#b0b0b0" : "#333333",
            fontSize: 12,
          },
        },
      },
    };
  }

  // ============ Axis (for cartesian charts) ============
  if (["line", "column", "bar", "area", "scatter"].includes(type)) {
    if (config.axis === false) {
      result.axis = false;
    } else if (config.axis && typeof config.axis === "object") {
      result.axis = config.axis;
    } else {
      result.axis = {
        x: {
          titleFill: isDark ? "#a0a0a0" : "#666666",
          labelFill: isDark ? "#888888" : "#666666",
          lineStroke: isDark ? "#404040" : "#e0e0e0",
          gridStroke: isDark ? "#303030" : "#f0f0f0",
        },
        y: {
          titleFill: isDark ? "#a0a0a0" : "#666666",
          labelFill: isDark ? "#888888" : "#666666",
          lineStroke: isDark ? "#404040" : "#e0e0e0",
          gridStroke: isDark ? "#303030" : "#f0f0f0",
        },
      };
    }
  }

  // ============ Interactions ============
  if (Array.isArray(config.interactions)) {
    result.interactions = config.interactions;
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

// ============ Main Renderer ============

export function AntDesignChartsRenderer({
  spec,
  animated = true,
}: AntDesignChartsRendererProps): ReactNode {
  const isDark = useThemeDetector();
  const ChartComponent = CHART_COMPONENTS[spec.type];

  // Normalize config for ADC 2.x React
  const chartConfig = useMemo(() => {
    return normalizeConfigForADC2(spec.type, spec.config, isDark);
  }, [spec.type, spec.config, isDark]);

  if (!ChartComponent) {
    return (
      <Surface className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <Text size="xs">
          <span className="app-text-danger">Unknown chart type: {spec.type}</span>
        </Text>
      </Surface>
    );
  }

  return (
    <Surface className="w-full p-4 rounded-xl ring ring-kumo-line bg-[var(--surface-elevated)]">
      <div className="flex items-center gap-2 mb-3">
        <ChartBar size={14} className="text-kumo-accent" />
        <Text size="xs" variant="secondary" bold>
          Ant Design Charts
        </Text>
        <Badge variant="secondary">{spec.type}</Badge>
      </div>
      <div
        className={`adc-chart-container ${animated ? "animate-fade-in" : ""}`}
        style={{ minHeight: 300, width: "100%" }}
      >
        <ChartComponent {...chartConfig} />
      </div>
    </Surface>
  );
}

// ============ Lazy Export ============

export const LazyAntDesignChartsRenderer = memo(function LazyAntDesignChartsRenderer(
  props: AntDesignChartsRendererProps
): ReactNode {
  return <AntDesignChartsRenderer {...props} />;
});
