/**
 * Streaming Chart Detector
 *
 * Detects the chart engine and subtype from partial (still-streaming) code
 * block content. Used by MarkdownRenderer to show the right skeleton while
 * the AI is still generating JSON.
 */

/** Languages recognised as chart code blocks. */
const CHART_LANGUAGES = new Set([
  "adc",
  "ant-design-charts",
  "antd-charts",
  "echarts",
  "echart",
  "vega-lite",
  "vegalite",
  "vl",
  "mermaid",
  "mmd",
  "stat",
  "stats",
  "kpi",
  "dashboard",
  "mindmap",
  "excalidraw",
]);

export type ChartSkeletonType =
  | "line"
  | "bar"
  | "pie"
  | "mermaid"
  | "echarts"
  | "stat"
  | "generic";

export interface DetectedChart {
  engine: string;
  subtype: ChartSkeletonType;
}

/**
 * Returns true when `language` is one of our chart fenced code block languages.
 */
export function isChartLanguage(language: string): boolean {
  return CHART_LANGUAGES.has(language);
}

/**
 * Attempt to infer the chart skeleton type from partial, possibly incomplete
 * JSON content inside a chart code block.
 *
 * The function uses simple regex heuristics (no JSON.parse) because the
 * content is typically truncated mid-stream.
 */
export function detectChartTypeFromPartial(
  language: string,
  code: string,
): DetectedChart {
  // -- Mermaid --
  if (language === "mermaid" || language === "mmd") {
    return { engine: "mermaid", subtype: "mermaid" };
  }

  // -- Stat / KPI --
  if (language === "stat" || language === "stats" || language === "kpi") {
    return { engine: "stat", subtype: "stat" };
  }

  // -- Dashboard --
  if (language === "dashboard") {
    return { engine: "dashboard", subtype: "generic" };
  }

  // -- Mindmap --
  if (language === "mindmap") {
    return { engine: "mindmap", subtype: "mermaid" };
  }

  // -- Excalidraw --
  if (language === "excalidraw") {
    return { engine: "excalidraw", subtype: "mermaid" };
  }

  // -- Vega-Lite --
  if (language === "vega-lite" || language === "vegalite" || language === "vl") {
    const subtype = detectSubtypeFromJson(code);
    return { engine: "vega-lite", subtype: subtype ?? "generic" };
  }

  // -- ECharts --
  if (language === "echarts" || language === "echart") {
    const subtype = detectSubtypeFromJson(code);
    return { engine: "echarts", subtype: subtype ?? "echarts" };
  }

  // -- ADC / Ant Design Charts --
  if (language === "adc" || language === "ant-design-charts" || language === "antd-charts") {
    const subtype = detectSubtypeFromJson(code);
    return { engine: "adc", subtype: subtype ?? "generic" };
  }

  return { engine: "unknown", subtype: "generic" };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Scan partial JSON for a `"type": "..."` field and map the value to a
 * skeleton type.
 */
function detectSubtypeFromJson(code: string): ChartSkeletonType | null {
  // Match "type": "line" / "type": "bar" etc.  Allow single or double quotes,
  // optional whitespace.
  const match = code.match(/["']type["']\s*:\s*["']([^"']+)["']/i);
  if (!match) return null;

  const raw = match[1].toLowerCase();

  if (raw === "line" || raw === "area") return "line";
  if (raw === "bar" || raw === "column" || raw === "histogram") return "bar";
  if (raw === "pie" || raw === "rose" || raw === "funnel" || raw === "gauge") return "pie";

  // For less common types fall back to generic
  return null;
}

/**
 * Attempt to parse the code as JSON. Returns true if it succeeds (meaning the
 * code block content is complete), false if it fails (still streaming).
 *
 * This is intentionally a thin wrapper so callers don't need to catch
 * exceptions.
 */
export function isJsonComplete(code: string): boolean {
  try {
    JSON.parse(code);
    return true;
  } catch {
    return false;
  }
}
