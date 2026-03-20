/**
 * Chart Knowledge Loader
 *
 * Loads chart generation knowledge from JSON files at build time.
 * Vite bundles these imports into the Worker.
 */

import type { ChartKnowledge, AdcKnowledge, MermaidKnowledge, EChartsKnowledge, EChartsChartRule, AdcChartRule, MermaidTemplate, VegaLiteKnowledge, VegaLiteChartRule } from "../../types/chart-kb";

// Import JSON files directly - Vite will bundle them
import adcJson from "../../../knowledge-base/charts/adc.json";
import mermaidJson from "../../../knowledge-base/charts/mermaid.json";
import echartsJson from "../../../knowledge-base/charts/echarts.json";
import vegaLiteJson from "../../../knowledge-base/charts/vega-lite.json";

// ============================================================================
// Keyword Detection Maps
// ============================================================================

/** Keywords to Mermaid diagram types mapping */
const MERMAID_KEYWORD_MAP: Record<string, string[]> = {
  // Flow/process keywords
  flowchart: ["flowchart"],
  flow: ["flowchart"],
  process: ["flowchart"],
  workflow: ["flowchart"],
  "流程": ["flowchart"],
  // Sequence/API keywords
  sequence: ["sequenceDiagram"],
  api: ["sequenceDiagram"],
  interaction: ["sequenceDiagram"],
  "时序": ["sequenceDiagram"],
  "交互": ["sequenceDiagram"],
  // Class/state keywords
  class: ["classDiagram"],
  state: ["stateDiagram-v2"],
  "类图": ["classDiagram"],
  "状态": ["stateDiagram-v2"],
  // Database keywords
  er: ["erDiagram"],
  database: ["erDiagram"],
  entity: ["erDiagram"],
  "数据库": ["erDiagram"],
  "实体": ["erDiagram"],
  // Timeline/schedule keywords
  gantt: ["gantt"],
  schedule: ["gantt"],
  timeline: ["timeline"],
  "甘特": ["gantt"],
  "时间线": ["timeline"],
  "排期": ["gantt"],
  // Other diagram types
  pie: ["pie"],
  mindmap: ["mindmap"],
  journey: ["journey"],
  git: ["gitGraph"],
  kanban: ["kanban"],
  "思维导图": ["mindmap"],
  "看板": ["kanban"],
  "用户旅程": ["journey"],
};

/** Keywords to ADC chart types mapping */
const ADC_KEYWORD_MAP: Record<string, string[]> = {
  line: ["line"],
  column: ["column"],
  bar: ["bar"],
  area: ["area"],
  pie: ["pie"],
  rose: ["rose"],
  scatter: ["scatter"],
  radar: ["radar"],
  gauge: ["gauge"],
  heatmap: ["heatmap"],
  funnel: ["funnel"],
  histogram: ["histogram"],
  dual: ["dualAxes"],
  "折线": ["line"],
  "柱状": ["column"],
  "条形": ["bar"],
  "面积": ["area"],
  "饼": ["pie"],
  "玫瑰": ["rose"],
  "南丁格尔": ["rose"],
  "散点": ["scatter"],
  "雷达": ["radar"],
  "仪表": ["gauge"],
  "热力": ["heatmap"],
  "漏斗": ["funnel"],
  "直方": ["histogram"],
  "双轴": ["dualAxes"],
};

/** Keywords to ECharts chart types mapping */
const ECHARTS_KEYWORD_MAP: Record<string, string[]> = {
  // Map / geographic keywords
  map: ["map"],
  geo: ["map"],
  geographic: ["map"],
  "地图": ["map"],
  "中国地图": ["map"],
  "世界地图": ["map"],
  "地理": ["map"],
  // Sankey keywords
  sankey: ["sankey"],
  alluvial: ["sankey"],
  "桑基图": ["sankey"],
  "桑基": ["sankey"],
  "流向": ["sankey"],
  "能量流": ["sankey"],
  // Tree keywords
  tree: ["tree"],
  hierarchy: ["tree"],
  "树图": ["tree"],
  "层级": ["tree"],
  "组织架构": ["tree"],
  "树形": ["tree"],
  // Treemap keywords
  treemap: ["treemap"],
  "矩形树图": ["treemap"],
  "矩形": ["treemap"],
  // Sunburst keywords
  sunburst: ["sunburst"],
  "旭日图": ["sunburst"],
  "旭日": ["sunburst"],
  "多层饼图": ["sunburst"],
  // Gauge keywords (ECharts advanced gauge)
  "仪表盘": ["gauge"],
  speedometer: ["gauge"],
  "速度表": ["gauge"],
  "表盘": ["gauge"],
  // Candlestick / K-line keywords
  candlestick: ["candlestick"],
  kline: ["candlestick"],
  "k-line": ["candlestick"],
  ohlc: ["candlestick"],
  stock: ["candlestick"],
  "K线": ["candlestick"],
  "K线图": ["candlestick"],
  "蜡烛图": ["candlestick"],
  "股票": ["candlestick"],
  "金融": ["candlestick"],
  // ThemeRiver keywords
  themeriver: ["themeRiver"],
  river: ["themeRiver"],
  stream: ["themeRiver"],
  "河流图": ["themeRiver"],
  "河流": ["themeRiver"],
  "主题河流": ["themeRiver"],
  // WordCloud keywords (extension)
  wordcloud: ["wordCloud"],
  "word cloud": ["wordCloud"],
  "tag cloud": ["wordCloud"],
  "词云": ["wordCloud"],
  "标签云": ["wordCloud"],
  "文字云": ["wordCloud"],
  // 3D chart keywords (extension)
  bar3d: ["bar3D"],
  "3d bar": ["bar3D"],
  "3D柱状图": ["bar3D"],
  "三维柱状图": ["bar3D"],
  scatter3d: ["scatter3D"],
  "3d scatter": ["scatter3D"],
  "3D散点图": ["scatter3D"],
  "三维散点图": ["scatter3D"],
};

/** Keywords to Vega-Lite chart types mapping */
const VEGALITE_KEYWORD_MAP: Record<string, string[]> = {
  // Vega-Lite explicit keywords
  "vega-lite": ["bar", "line", "point"],
  vegalite: ["bar", "line", "point"],
  vega: ["bar", "line", "point"],
  // Statistical / academic keywords (Vega-Lite's strength)
  boxplot: ["boxplot"],
  "box plot": ["boxplot"],
  "箱线": ["boxplot"],
  "箱线图": ["boxplot"],
  facet: ["facet"],
  "small multiples": ["facet"],
  trellis: ["facet"],
  "分面": ["facet"],
  "小多图": ["facet"],
  // Heatmap via rect mark
  heatmap: ["rect"],
  "heat map": ["rect"],
  // Statistical distribution
  distribution: ["boxplot"],
  quartile: ["boxplot"],
  median: ["boxplot"],
  "中位数": ["boxplot"],
  "分布": ["boxplot"],
  // Composition — layer
  "multi-layer": ["layer"],
  overlay: ["layer"],
  "叠加": ["layer"],
  "多层": ["layer"],
};

// ============================================================================
// Keyword Detection
// ============================================================================

/** Detected chart keywords from user message */
export interface DetectedKeywords {
  mermaid: string[];
  adc: string[];
  echarts: string[];
  vegaLite: string[];
}

/**
 * Check if a keyword matches the user message with word-boundary awareness.
 * Uses \b word boundaries for ASCII keywords to avoid false positives
 * (e.g., "line" matching "deadline", "bar" matching "barrier").
 * For non-ASCII keywords (Chinese, etc.), uses plain substring matching.
 */
function keywordMatches(lower: string, keyword: string): boolean {
  // Non-ASCII keywords (Chinese, etc.) — use plain includes
  if (/[^\x00-\x7F]/.test(keyword)) {
    return lower.includes(keyword);
  }
  // ASCII keywords — use word boundary
  const re = new RegExp(`\\b${keyword}\\b`, "i");
  return re.test(lower);
}

/**
 * Detect chart-related keywords from user message
 */
export function detectChartKeywords(userMessage: string): DetectedKeywords {
  const lower = userMessage.toLowerCase();
  const result: DetectedKeywords = { mermaid: [], adc: [], echarts: [], vegaLite: [] };

  for (const [keyword, types] of Object.entries(MERMAID_KEYWORD_MAP)) {
    if (keywordMatches(lower, keyword)) {
      result.mermaid.push(...types);
    }
  }

  for (const [keyword, types] of Object.entries(ADC_KEYWORD_MAP)) {
    if (keywordMatches(lower, keyword)) {
      result.adc.push(...types);
    }
  }

  for (const [keyword, types] of Object.entries(ECHARTS_KEYWORD_MAP)) {
    if (keywordMatches(lower, keyword)) {
      result.echarts.push(...types);
    }
  }

  for (const [keyword, types] of Object.entries(VEGALITE_KEYWORD_MAP)) {
    if (keywordMatches(lower, keyword)) {
      result.vegaLite.push(...types);
    }
  }

  // Deduplicate
  return {
    mermaid: [...new Set(result.mermaid)],
    adc: [...new Set(result.adc)],
    echarts: [...new Set(result.echarts)],
    vegaLite: [...new Set(result.vegaLite)],
  };
}

// ============================================================================
// Knowledge Filtering
// ============================================================================

/** Core Mermaid diagram types (fallback set) */
const CORE_MERMAID_TYPES = ["flowchart", "sequenceDiagram", "pie"];

/**
 * Filter Mermaid knowledge by keywords
 * Falls back to core types when no keywords or no matches
 */
export function filterMermaidKnowledge(
  knowledge: MermaidKnowledge | null,
  keywords: string[]
): MermaidKnowledge | null {
  if (!knowledge) return null;

  // No keywords: return core types
  if (keywords.length === 0) {
    const filtered: MermaidKnowledge = {
      universalRules: knowledge.universalRules,
      diagramTypes: {},
    };
    for (const type of CORE_MERMAID_TYPES) {
      if (knowledge.diagramTypes[type]) {
        filtered.diagramTypes[type] = knowledge.diagramTypes[type];
      }
    }
    return filtered;
  }

  // Filter by keywords
  const filtered: MermaidKnowledge = {
    universalRules: knowledge.universalRules,
    diagramTypes: {},
  };

  for (const keyword of keywords) {
    if (knowledge.diagramTypes[keyword]) {
      filtered.diagramTypes[keyword] = knowledge.diagramTypes[keyword];
    }
  }

  // Fallback to core types if no matches
  if (Object.keys(filtered.diagramTypes).length === 0) {
    return filterMermaidKnowledge(knowledge, []);
  }

  return filtered;
}

/** Core ADC chart count (fallback) */
const CORE_ADC_CHART_COUNT = 4;

/**
 * Filter ADC knowledge by keywords
 * Falls back to first N chart types when no keywords or no matches
 */
export function filterAdcKnowledge(
  knowledge: AdcKnowledge | null,
  keywords: string[]
): AdcKnowledge | null {
  if (!knowledge) return null;

  // No keywords: return first N chart types
  if (keywords.length === 0) {
    return {
      outputContract: knowledge.outputContract,
      typeWhitelist: knowledge.typeWhitelist,
      chartTypes: knowledge.chartTypes.slice(0, CORE_ADC_CHART_COUNT),
    };
  }

  const typeSet = new Set(keywords);
  const filtered = knowledge.chartTypes.filter((chart) => typeSet.has(chart.type));

  // Fallback to core set if no matches
  if (filtered.length === 0) {
    return filterAdcKnowledge(knowledge, []);
  }

  return {
    outputContract: knowledge.outputContract,
    typeWhitelist: knowledge.typeWhitelist,
    chartTypes: filtered,
  };
}

/** Core ECharts chart count (fallback) */
const CORE_ECHARTS_CHART_COUNT = 4;

/**
 * Filter ECharts knowledge by keywords
 * Falls back to first N chart types when no keywords or no matches
 */
export function filterEChartsKnowledge(
  knowledge: EChartsKnowledge | null,
  keywords: string[]
): EChartsKnowledge | null {
  if (!knowledge) return null;

  // No keywords: return first N chart types
  if (keywords.length === 0) {
    return {
      outputContract: knowledge.outputContract,
      typeWhitelist: knowledge.typeWhitelist,
      chartTypes: knowledge.chartTypes.slice(0, CORE_ECHARTS_CHART_COUNT),
    };
  }

  const typeSet = new Set(keywords);
  const filtered = knowledge.chartTypes.filter((chart) => typeSet.has(chart.type));

  // Fallback to core set if no matches
  if (filtered.length === 0) {
    return filterEChartsKnowledge(knowledge, []);
  }

  return {
    outputContract: knowledge.outputContract,
    typeWhitelist: knowledge.typeWhitelist,
    chartTypes: filtered,
  };
}

// ============================================================================
// Deterministic Sorting
// ============================================================================

/** Priority order for Mermaid diagram types */
const MERMAID_PRIORITY_ORDER = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "pie",
  "gantt",
  "timeline",
  "mindmap",
  "gitGraph",
  "journey",
  "kanban",
];

/**
 * Sort Mermaid diagram types with deterministic order
 * Priority types first, then alphabetically
 */
export function sortMermaidDiagramTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const aIndex = MERMAID_PRIORITY_ORDER.indexOf(a);
    const bIndex = MERMAID_PRIORITY_ORDER.indexOf(b);

    // Both in priority list: sort by priority
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    // Only a in priority list: a comes first
    if (aIndex !== -1) return -1;
    // Only b in priority list: b comes first
    if (bIndex !== -1) return 1;
    // Neither in priority list: sort alphabetically
    return a.localeCompare(b);
  });
}

/**
 * Sort ADC chart types alphabetically by type name
 */
export function sortAdcChartTypes(charts: AdcChartRule[]): AdcChartRule[] {
  return [...charts].sort((a, b) => a.type.localeCompare(b.type));
}

/** Priority order for ECharts chart types */
const ECHARTS_PRIORITY_ORDER = [
  "map",
  "sankey",
  "tree",
  "treemap",
  "sunburst",
  "gauge",
  "candlestick",
  "themeRiver",
  "wordCloud",
  "bar3D",
  "scatter3D",
];

/**
 * Sort ECharts chart types with deterministic order
 * Priority types first (matching keyword relevance), then alphabetically
 */
export function sortEChartsChartTypes(
  charts: EChartsChartRule[],
  keywords: string[]
): EChartsChartRule[] {
  const keywordSet = new Set(keywords);
  return [...charts].sort((a, b) => {
    // Keyword-matched types come first
    const aMatched = keywordSet.has(a.type);
    const bMatched = keywordSet.has(b.type);
    if (aMatched && !bMatched) return -1;
    if (!aMatched && bMatched) return 1;

    // Then sort by priority order
    const aIndex = ECHARTS_PRIORITY_ORDER.indexOf(a.type);
    const bIndex = ECHARTS_PRIORITY_ORDER.indexOf(b.type);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.type.localeCompare(b.type);
  });
}

/** Priority order for Vega-Lite chart types */
const VEGALITE_PRIORITY_ORDER = [
  "bar",
  "line",
  "point",
  "area",
  "arc",
  "boxplot",
  "rect",
  "text",
  "layer",
  "facet",
];

/**
 * Sort Vega-Lite chart types with deterministic order
 * Priority types first (matching keyword relevance), then alphabetically
 */
export function sortVegaLiteChartTypes(
  charts: VegaLiteChartRule[],
  keywords: string[]
): VegaLiteChartRule[] {
  const keywordSet = new Set(keywords);
  return [...charts].sort((a, b) => {
    // Keyword-matched types come first
    const aMatched = keywordSet.has(a.type);
    const bMatched = keywordSet.has(b.type);
    if (aMatched && !bMatched) return -1;
    if (!aMatched && bMatched) return 1;

    // Then sort by priority order
    const aIndex = VEGALITE_PRIORITY_ORDER.indexOf(a.type);
    const bIndex = VEGALITE_PRIORITY_ORDER.indexOf(b.type);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.type.localeCompare(b.type);
  });
}

/** Core Vega-Lite chart count (fallback) */
const CORE_VEGALITE_CHART_COUNT = 4;

/**
 * Filter Vega-Lite knowledge by keywords
 * Falls back to first N chart types when no keywords or no matches
 */
export function filterVegaLiteKnowledge(
  knowledge: VegaLiteKnowledge | null,
  keywords: string[]
): VegaLiteKnowledge | null {
  if (!knowledge) return null;

  // No keywords: return first N chart types
  if (keywords.length === 0) {
    return {
      outputContract: knowledge.outputContract,
      typeWhitelist: knowledge.typeWhitelist,
      chartTypes: knowledge.chartTypes.slice(0, CORE_VEGALITE_CHART_COUNT),
    };
  }

  const typeSet = new Set(keywords);
  const filtered = knowledge.chartTypes.filter((chart) => typeSet.has(chart.type));

  // Fallback to core set if no matches
  if (filtered.length === 0) {
    return filterVegaLiteKnowledge(knowledge, []);
  }

  return {
    outputContract: knowledge.outputContract,
    typeWhitelist: knowledge.typeWhitelist,
    chartTypes: filtered,
  };
}

/**
 * Sort Mermaid diagramTypes record keys deterministically
 */
export function sortMermaidKnowledgeTypes(
  knowledge: MermaidKnowledge | null
): MermaidKnowledge | null {
  if (!knowledge) return null;

  const sortedKeys = sortMermaidDiagramTypes(Object.keys(knowledge.diagramTypes));
  const sortedDiagramTypes: Record<string, MermaidTemplate> = {};

  for (const key of sortedKeys) {
    if (knowledge.diagramTypes[key]) {
      sortedDiagramTypes[key] = knowledge.diagramTypes[key];
    }
  }

  return {
    ...knowledge,
    diagramTypes: sortedDiagramTypes,
  };
}

let cachedKnowledge: ChartKnowledge | null = null;

/**
 * Get chart knowledge synchronously (uses bundled JSON)
 */
export function getChartKnowledge(): ChartKnowledge {
  if (!cachedKnowledge) {
    cachedKnowledge = {
      adc: adcJson as AdcKnowledge,
      mermaid: mermaidJson as MermaidKnowledge,
      echarts: echartsJson as EChartsKnowledge,
      vegaLite: vegaLiteJson as VegaLiteKnowledge,
    };
  }
  return cachedKnowledge;
}

/**
 * Load chart knowledge from bundled JSON files (async compat)
 */
export async function loadChartKnowledge(): Promise<ChartKnowledge> {
  return getChartKnowledge();
}

/**
 * Build ADC prompt section from knowledge
 */
export function buildAdcPromptSection(knowledge: AdcKnowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Data Charts — Ant Design Charts (ADC):");
  lines.push("Use ADC JSON format in a code block with language tag `adc`:");
  lines.push("");
  lines.push("```adc");
  lines.push('{\n  "type": "line",\n  "data": [\n    {"month": "Jan", "value": 35, "category": "A"},\n    {"month": "Feb", "value": 46, "category": "A"},\n    {"month": "Mar", "value": 51, "category": "A"},\n    {"month": "Jan", "value": 28, "category": "B"},\n    {"month": "Feb", "value": 38, "category": "B"},\n    {"month": "Mar", "value": 43, "category": "B"}\n  ],\n  "xField": "month",\n  "yField": "value",\n  "colorField": "category",\n  "style": {"lineWidth": 2.5},\n  "interaction": {"tooltip": true}\n}');
  lines.push("```");
  lines.push("");
  lines.push("ADC output contract (MUST follow):");

  for (const rule of knowledge.outputContract) {
    lines.push(`- ${rule}`);
  }

  lines.push("");
  lines.push("ADC chart types and key fields:");
  for (const chart of knowledge.chartTypes) {
    const tipStr = chart.tips ? ` — ${chart.tips}` : "";
    lines.push(`- **${chart.type}**: required: ${chart.requiredFields.join(", ")}${tipStr}`);
  }

  lines.push("");
  lines.push("ADC styling best practices:");
  lines.push("- Use colorField/seriesField for multi-series data to auto-generate legends");
  lines.push("- Add interaction:{\"tooltip\":true} for hover information");
  lines.push("- Use style.radiusTopLeft/radiusTopRight (2-6) for rounded bar/column tops");
  lines.push("- For pie/donut charts, use innerRadius (0.4-0.6) for donut style");
  lines.push("- Include 4-8 data points minimum for meaningful visualization");
  lines.push("- Use descriptive field names and realistic data values");

  return lines.join("\n");
}

/**
 * Build Mermaid prompt section from knowledge
 */
export function buildMermaidPromptSection(knowledge: MermaidKnowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Diagrams — Mermaid:");
  lines.push("Use Mermaid syntax in a code block with language tag `mermaid`:");
  lines.push("");

  // Add universal rules
  if (knowledge.universalRules && knowledge.universalRules.length > 0) {
    lines.push("Mermaid rules (MUST follow):");
    for (const rule of knowledge.universalRules) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  // Show available diagram types with whenToUse hints
  lines.push("Available diagram types:");
  const diagramKeys = Object.keys(knowledge.diagramTypes);
  for (const key of diagramKeys) {
    const diagram = knowledge.diagramTypes[key];
    lines.push(`- **${key}**: ${diagram.whenToUse}`);
  }
  lines.push("");

  // Show up to 2 example templates for the most relevant types
  const shownCount = Math.min(diagramKeys.length, 2);
  lines.push("Mermaid examples:");
  lines.push("");

  for (let i = 0; i < shownCount; i++) {
    const key = diagramKeys[i];
    const diagram = knowledge.diagramTypes[key];
    lines.push(`**${key}:**`);
    lines.push("```mermaid");
    lines.push(diagram.minimalTemplate);
    lines.push("```");
    lines.push("");
  }

  lines.push("Mermaid best practices:");
  lines.push("- Use descriptive node labels and meaningful IDs");
  lines.push("- Use varied node shapes: [] for process, {} for decision, () for start/end, [()] for database");
  lines.push("- For sequence diagrams, use actor for humans and participant for systems");
  lines.push("- Include 5-15 nodes/steps for balanced complexity");

  return lines.join("\n");
}

/**
 * Build ECharts prompt section from knowledge
 */
export function buildEChartsPromptSection(knowledge: EChartsKnowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Advanced Charts — ECharts:");
  lines.push("Use a pure ECharts option JSON object in a code block with language tag `echarts`:");
  lines.push("");
  lines.push("```echarts");
  lines.push('{\n  "tooltip": {"trigger": "item"},\n  "series": [{\n    "type": "sankey",\n    "data": [{"name": "A"}, {"name": "B"}, {"name": "C"}],\n    "links": [\n      {"source": "A", "target": "B", "value": 30},\n      {"source": "A", "target": "C", "value": 20}\n    ]\n  }]\n}');
  lines.push("```");
  lines.push("");
  lines.push("ECharts output contract (MUST follow):");

  for (const rule of knowledge.outputContract) {
    lines.push(`- ${rule}`);
  }

  lines.push("");
  lines.push("ECharts supported chart types:");
  for (const chart of knowledge.chartTypes) {
    lines.push(`- **${chart.type}** (${chart.name}): ${chart.description}`);
    if (chart.notes) {
      lines.push(`  Note: ${chart.notes}`);
    }
  }
  lines.push("");

  // Show up to 2 spec examples for the most relevant types (compact JSON to save tokens)
  const shownCount = Math.min(knowledge.chartTypes.length, 2);
  lines.push("ECharts examples:");
  lines.push("");

  for (let i = 0; i < shownCount; i++) {
    const chart = knowledge.chartTypes[i];
    lines.push(`**${chart.type} (${chart.name}):**`);
    lines.push("```echarts");
    lines.push(JSON.stringify(chart.spec_example));
    lines.push("```");
    lines.push("");
  }

  lines.push("ECharts best practices:");
  lines.push("- Always include tooltip for interactivity");
  lines.push("- Use visualMap for continuous data coloring (maps, heatmaps)");
  lines.push("- Set yAxis.scale:true for financial charts so axis does not start from 0");
  lines.push("- For tree/treemap/sunburst, use hierarchical data with name and children");
  lines.push("- wordCloud and 3D charts require extensions (echarts-wordcloud, echarts-gl)");
  lines.push("- Use emphasis.focus for highlighting related elements on hover");

  return lines.join("\n");
}

/**
 * Build Vega-Lite prompt section from knowledge
 */
export function buildVegaLitePromptSection(knowledge: VegaLiteKnowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Declarative Charts — Vega-Lite:");
  lines.push("Use a Vega-Lite JSON spec in a code block with language tag `vega-lite`:");
  lines.push("");
  lines.push("```vega-lite");
  lines.push('{\n  "mark": "bar",\n  "data": {"values": [{"a": "A", "b": 28}, {"a": "B", "b": 55}, {"a": "C", "b": 43}]},\n  "encoding": {\n    "x": {"field": "a", "type": "nominal"},\n    "y": {"field": "b", "type": "quantitative"}\n  }\n}');
  lines.push("```");
  lines.push("");
  lines.push("Vega-Lite output contract (MUST follow):");

  for (const rule of knowledge.outputContract) {
    lines.push(`- ${rule}`);
  }

  lines.push("");
  lines.push("Vega-Lite supported chart types:");
  for (const chart of knowledge.chartTypes) {
    lines.push(`- **${chart.type}** (${chart.name}): ${chart.description}`);
    if (chart.notes) {
      lines.push(`  Note: ${chart.notes}`);
    }
  }
  lines.push("");

  // Show up to 2 spec examples for the most relevant types (compact JSON to save tokens)
  const shownCount = Math.min(knowledge.chartTypes.length, 2);
  lines.push("Vega-Lite examples:");
  lines.push("");

  for (let i = 0; i < shownCount; i++) {
    const chart = knowledge.chartTypes[i];
    lines.push(`**${chart.type} (${chart.name}):**`);
    lines.push("```vega-lite");
    lines.push(JSON.stringify(chart.spec_example));
    lines.push("```");
    lines.push("");
  }

  lines.push("Vega-Lite best practices:");
  lines.push("- Always specify encoding type: \"quantitative\", \"nominal\", \"ordinal\", or \"temporal\"");
  lines.push("- Use inline data via data.values array — never reference external URLs");
  lines.push("- For multi-series charts, use color encoding with a categorical field");
  lines.push("- Use layer for combining multiple marks (e.g., line + point, bar + text labels)");
  lines.push("- For statistical charts (boxplot), provide raw data — Vega-Lite computes stats automatically");
  lines.push("- Use facet encoding or column/row for small multiples");

  return lines.join("\n");
}
