export interface ChartThemeTokens {
  axisTitleFill: string;
  axisLabelFill: string;
  axisLineStroke: string;
  axisGridStroke: string;
  legendItemFill: string;
  titleFill: string;
  paletteCategorical: string[];
  chartBackground: string;
  tooltipBackground: string;
  tooltipTextFill: string;
}

export const LIGHT_CHART_THEME_TOKENS: ChartThemeTokens = {
  axisTitleFill: "#1f2937",
  axisLabelFill: "#374151",
  axisLineStroke: "#cbd5e1",
  axisGridStroke: "#e5e7eb",
  legendItemFill: "#333333",
  titleFill: "#0f172a",
  paletteCategorical: [
    "#1d4ed8",
    "#0f766e",
    "#7c3aed",
    "#b45309",
    "#be123c",
    "#0284c7",
    "#1e40af",
    "#475569",
    "#166534",
    "#9a3412",
  ],
  chartBackground: "#ffffff",
  tooltipBackground: "#ffffff",
  tooltipTextFill: "#0f172a",
};

export const DARK_CHART_THEME_TOKENS: ChartThemeTokens = {
  axisTitleFill: "#d1d5db",
  axisLabelFill: "#e5e7eb",
  axisLineStroke: "#6b7280",
  axisGridStroke: "#374151",
  legendItemFill: "#e5e7eb",
  titleFill: "#f8fafc",
  paletteCategorical: [
    "#60a5fa",
    "#34d399",
    "#a78bfa",
    "#f59e0b",
    "#fb7185",
    "#22d3ee",
    "#f97316",
    "#94a3b8",
    "#4ade80",
    "#fda4af",
  ],
  chartBackground: "#111827",
  tooltipBackground: "#0f172a",
  tooltipTextFill: "#f8fafc",
};

export function getChartThemeTokens(isDark: boolean): ChartThemeTokens {
  return isDark ? DARK_CHART_THEME_TOKENS : LIGHT_CHART_THEME_TOKENS;
}
