/**
 * ChartEditorAdcPreview — isolated ADC chart preview for the ChartEditor.
 *
 * This module exists as a separate file to avoid circular imports:
 * ChartEditor -> ChartEditorAdcPreview -> AntDesignCharts (no back-reference to ChartEditor).
 */

import { useMemo, type ReactNode, type FC } from "react";
import type { AdcChartType } from "../utils/adcSpecParser";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { getChartThemeTokens } from "./chartThemeTokens";
import { getChartVisualPreset } from "./chartVisualPreset";
import { normalizeConfigForADC2, sanitizeAdcConfig } from "./AntDesignChartsRenderer";

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

// ---------------------------------------------------------------------------
// Component map (same as AntDesignChartsRenderer)
// ---------------------------------------------------------------------------

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

const VALID_TYPES = new Set<string>(Object.keys(CHART_COMPONENTS));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChartEditorAdcPreviewProps {
  spec: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChartEditorAdcPreview({ spec }: ChartEditorAdcPreviewProps): ReactNode {
  const isDark = useThemeDetector();
  const themeTokens = useMemo(() => getChartThemeTokens(isDark), [isDark]);
  const visualPreset = useMemo(() => getChartVisualPreset(isDark), [isDark]);

  const chartType = (typeof spec.type === "string" && VALID_TYPES.has(spec.type)
    ? spec.type
    : "line") as AdcChartType;

  const ChartComponent = CHART_COMPONENTS[chartType];

  const chartConfig = useMemo(() => {
    const { type: _type, ...config } = spec;
    const sanitized = sanitizeAdcConfig(config);
    return normalizeConfigForADC2(chartType, sanitized.config, isDark);
  }, [spec, chartType, isDark]);

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

  if (!ChartComponent) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400">
        Unknown chart type: {chartType}
      </div>
    );
  }

  return (
    <div style={{ minHeight: 280, width: "100%" }}>
      <ConfigProvider common={adcCommonConfig}>
        <ChartComponent {...chartConfig} />
      </ConfigProvider>
    </div>
  );
}

export default ChartEditorAdcPreview;
