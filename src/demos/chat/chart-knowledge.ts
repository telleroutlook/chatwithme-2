/**
 * Chart Knowledge Loader
 *
 * Loads chart generation knowledge from JSON files at build time.
 * Vite bundles these imports into the Worker.
 */

import type { ChartKnowledge, AdcKnowledge, G2Knowledge, MermaidKnowledge, AdcChartRule, G2ChartRule, MermaidTemplate } from "../../types/chart-kb";

// Import JSON files directly - Vite will bundle them
import adcJson from "../../../knowledge-base/charts/adc.json";
import g2Json from "../../../knowledge-base/charts/g2.json";
import mermaidJson from "../../../knowledge-base/charts/mermaid.json";

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
  "散点": ["scatter"],
  "雷达": ["radar"],
  "仪表": ["gauge"],
  "热力": ["heatmap"],
  "漏斗": ["funnel"],
  "直方": ["histogram"],
  "双轴": ["dualAxes"],
};

/** Keywords to G2 chart types mapping */
const G2_KEYWORD_MAP: Record<string, string[]> = {
  bar: ["interval"],
  column: ["interval"],
  line: ["line"],
  area: ["area"],
  scatter: ["point"],
  heatmap: ["cell"],
  "柱状": ["interval"],
  "条形": ["interval"],
  "折线": ["line"],
  "面积": ["area"],
  "散点": ["point"],
  "热力": ["cell"],
};

// ============================================================================
// Keyword Detection
// ============================================================================

/** Detected chart keywords from user message */
export interface DetectedKeywords {
  mermaid: string[];
  adc: string[];
  g2: string[];
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
  const result: DetectedKeywords = { mermaid: [], adc: [], g2: [] };

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

  for (const [keyword, types] of Object.entries(G2_KEYWORD_MAP)) {
    if (keywordMatches(lower, keyword)) {
      result.g2.push(...types);
    }
  }

  // Deduplicate
  return {
    mermaid: [...new Set(result.mermaid)],
    adc: [...new Set(result.adc)],
    g2: [...new Set(result.g2)],
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

/**
 * Filter G2 knowledge by keywords
 * Falls back to full set when no keywords or no matches
 */
export function filterG2Knowledge(
  knowledge: G2Knowledge | null,
  keywords: string[]
): G2Knowledge | null {
  if (!knowledge) return null;

  // No keywords: return all (G2 has fewer types)
  if (keywords.length === 0) {
    return knowledge;
  }

  const typeSet = new Set(keywords);
  const filtered = knowledge.chartTypes.filter((chart) => typeSet.has(chart.type));

  // Fallback to full set if no matches
  if (filtered.length === 0) {
    return knowledge;
  }

  return {
    outputContract: knowledge.outputContract,
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

/**
 * Sort G2 chart types alphabetically by type name
 */
export function sortG2ChartTypes(charts: G2ChartRule[]): G2ChartRule[] {
  return [...charts].sort((a, b) => a.type.localeCompare(b.type));
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
      g2: g2Json as G2Knowledge,
      mermaid: mermaidJson as MermaidKnowledge,
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
 * Build G2 prompt section from knowledge
 */
export function buildG2PromptSection(knowledge: G2Knowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Data Charts — G2 Format:");
  lines.push("Use G2 JSON format in a code block with language tag `g2`:");
  lines.push("");
  lines.push("```g2");
  lines.push('{\n  "type": "interval",\n  "data": [\n    {"quarter": "Q1", "revenue": 120, "dept": "Sales"},\n    {"quarter": "Q2", "revenue": 180, "dept": "Sales"},\n    {"quarter": "Q1", "revenue": 80, "dept": "Marketing"},\n    {"quarter": "Q2", "revenue": 120, "dept": "Marketing"}\n  ],\n  "encode": {"x": "quarter", "y": "revenue", "color": "dept"},\n  "transform": [{"type": "dodgeX"}],\n  "tooltip": true\n}');
  lines.push("```");
  lines.push("");
  lines.push("G2 output contract (MUST follow):");

  for (const rule of knowledge.outputContract) {
    lines.push(`- ${rule}`);
  }

  lines.push("");
  lines.push("G2 chart types and key fields:");
  for (const chart of knowledge.chartTypes) {
    const tipStr = chart.tips ? ` — ${chart.tips}` : "";
    lines.push(`- **${chart.type}**: required: ${chart.requiredFields.join(", ")}${tipStr}`);
  }

  lines.push("");
  lines.push("G2 styling best practices:");
  lines.push("- Use encode.color for categorical grouping");
  lines.push("- Add tooltip:true for hover information");
  lines.push("- Use transform:[{type:'dodgeX'}] for grouped bars, [{type:'stackY'}] for stacked");
  lines.push("- Add axis.y.title or axis.x.title for labeled axes");
  lines.push("- Use style.fillOpacity (0.3-0.7) for semi-transparent fills");

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

  // Show up to 3 example templates for the most relevant types
  const shownCount = Math.min(diagramKeys.length, 3);
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
