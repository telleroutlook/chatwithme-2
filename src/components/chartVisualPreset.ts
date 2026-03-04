import { getChartThemeTokens } from "./chartThemeTokens";

interface MermaidThemeVariables {
  background: string;
  primaryColor: string;
  primaryTextColor: string;
  primaryBorderColor: string;
  lineColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  clusterBkg: string;
  clusterBorder: string;
  edgeLabelBackground: string;
}

interface G2ThemePreset {
  type: "light" | "classic" | "dark" | "classicDark";
  color: string;
  category10: string[];
  category20: string[];
  view: {
    viewFill: string;
    plotFill: string;
    mainFill: string;
    contentFill: string;
  };
  enter: { duration: number };
  update: { duration: number };
  exit: { duration: number };
}

export interface ChartVisualPreset {
  fontFamily: string;
  category10: string[];
  category20: string[];
  g2Theme: G2ThemePreset;
  mermaidThemeVariables: MermaidThemeVariables;
}

function buildCategory20(category10: string[]): string[] {
  return [...category10, ...category10.map((color) => `${color}CC`)];
}

export function getChartVisualPreset(isDark: boolean): ChartVisualPreset {
  const tokens = getChartThemeTokens(isDark);
  const category10 = tokens.paletteCategorical;
  const category20 = buildCategory20(category10);

  return {
    fontFamily: '"IBM Plex Sans", "Noto Sans SC", "Segoe UI", sans-serif',
    category10,
    category20,
    g2Theme: {
      type: isDark ? "classicDark" : "classic",
      color: category10[0],
      category10,
      category20,
      view: {
        viewFill: "transparent",
        plotFill: "transparent",
        mainFill: "transparent",
        contentFill: "transparent",
      },
      enter: { duration: 420 },
      update: { duration: 320 },
      exit: { duration: 220 },
    },
    mermaidThemeVariables: {
      background: "transparent",
      primaryColor: isDark ? "#1e293b" : "#eff6ff",
      primaryTextColor: isDark ? "#e2e8f0" : "#0f172a",
      primaryBorderColor: isDark ? "#60a5fa" : "#1d4ed8",
      lineColor: tokens.axisLineStroke,
      secondaryColor: isDark ? "#0f172a" : "#f8fafc",
      tertiaryColor: isDark ? "#111827" : "#eef2ff",
      clusterBkg: isDark ? "#111827" : "#f8fafc",
      clusterBorder: isDark ? "#334155" : "#cbd5e1",
      edgeLabelBackground: isDark ? "#0f172a" : "#ffffff",
    },
  };
}
