export interface ChartThemeTokens {
  axisTitleFill: string;
  axisLabelFill: string;
  axisLineStroke: string;
  axisGridStroke: string;
  legendItemFill: string;
  chartBackground: string;
}

export const LIGHT_CHART_THEME_TOKENS: ChartThemeTokens = {
  axisTitleFill: "#666666",
  axisLabelFill: "#999999",
  axisLineStroke: "#e0e0e0",
  axisGridStroke: "#f0f0f0",
  legendItemFill: "#333333",
  chartBackground: "#ffffff",
};

export const DARK_CHART_THEME_TOKENS: ChartThemeTokens = {
  axisTitleFill: "#d1d5db",
  axisLabelFill: "#e5e7eb",
  axisLineStroke: "#6b7280",
  axisGridStroke: "#374151",
  legendItemFill: "#e5e7eb",
  chartBackground: "#111827",
};

export function getChartThemeTokens(isDark: boolean): ChartThemeTokens {
  return isDark ? DARK_CHART_THEME_TOKENS : LIGHT_CHART_THEME_TOKENS;
}
