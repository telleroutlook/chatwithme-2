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
  noteBkgColor: string;
  noteTextColor: string;
  noteBorderColor: string;
  actorBkg: string;
  actorTextColor: string;
  actorBorder: string;
  signalColor: string;
  labelBoxBkgColor: string;
  sectionBkgColor: string;
  altSectionBkgColor: string;
  sectionBkgColor2: string;
  taskBkgColor: string;
  taskTextColor: string;
  activeTaskBkgColor: string;
  activeTaskBorderColor: string;
  gridColor: string;
  doneTaskBkgColor: string;
  pie1: string;
  pie2: string;
  pie3: string;
  pie4: string;
  pie5: string;
  pie6: string;
  pieTitleTextSize: string;
  pieTitleTextColor: string;
  pieSectionTextSize: string;
  pieSectionTextColor: string;
  pieLegendTextSize: string;
  pieLegendTextColor: string;
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
      // Note styling
      noteBkgColor: isDark ? "#1e293b" : "#fef9c3",
      noteTextColor: isDark ? "#e2e8f0" : "#422006",
      noteBorderColor: isDark ? "#475569" : "#d97706",
      // Sequence diagram actors
      actorBkg: isDark ? "#1e293b" : "#eff6ff",
      actorTextColor: isDark ? "#e2e8f0" : "#0f172a",
      actorBorder: isDark ? "#60a5fa" : "#1d4ed8",
      signalColor: isDark ? "#e2e8f0" : "#0f172a",
      labelBoxBkgColor: isDark ? "#1e293b" : "#eff6ff",
      // Gantt chart styling
      sectionBkgColor: isDark ? "#1e293b" : "#eff6ff",
      altSectionBkgColor: isDark ? "#0f172a" : "#f8fafc",
      sectionBkgColor2: isDark ? "#1a2332" : "#e0f2fe",
      taskBkgColor: isDark ? "#3b82f6" : "#1d4ed8",
      taskTextColor: "#ffffff",
      activeTaskBkgColor: isDark ? "#60a5fa" : "#2563eb",
      activeTaskBorderColor: isDark ? "#93c5fd" : "#1e40af",
      gridColor: isDark ? "#334155" : "#e2e8f0",
      doneTaskBkgColor: isDark ? "#475569" : "#94a3b8",
      // Pie chart styling
      pie1: isDark ? "#60a5fa" : "#1d4ed8",
      pie2: isDark ? "#34d399" : "#0f766e",
      pie3: isDark ? "#a78bfa" : "#7c3aed",
      pie4: isDark ? "#f59e0b" : "#b45309",
      pie5: isDark ? "#fb7185" : "#be123c",
      pie6: isDark ? "#22d3ee" : "#0284c7",
      pieTitleTextSize: "16px",
      pieTitleTextColor: isDark ? "#e2e8f0" : "#0f172a",
      pieSectionTextSize: "12px",
      pieSectionTextColor: "#ffffff",
      pieLegendTextSize: "12px",
      pieLegendTextColor: isDark ? "#d1d5db" : "#374151",
    },
  };
}
