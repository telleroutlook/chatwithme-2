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
  // Sequence/API keywords
  sequence: ["sequenceDiagram"],
  api: ["sequenceDiagram"],
  interaction: ["sequenceDiagram"],
  // Class/state keywords
  class: ["classDiagram"],
  state: ["stateDiagram-v2"],
  // Database keywords
  er: ["erDiagram"],
  database: ["erDiagram"],
  entity: ["erDiagram"],
  // Timeline/schedule keywords
  gantt: ["gantt"],
  schedule: ["gantt"],
  timeline: ["timeline"],
  // Other diagram types
  pie: ["pie"],
  mindmap: ["mindmap"],
  journey: ["journey"],
  git: ["gitGraph"],
  kanban: ["kanban"],
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
};

/** Keywords to G2 chart types mapping */
const G2_KEYWORD_MAP: Record<string, string[]> = {
  bar: ["interval"],
  column: ["interval"],
  line: ["line"],
  area: ["area"],
  scatter: ["point"],
  heatmap: ["cell"],
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
 */
function keywordMatches(lower: string, keyword: string): boolean {
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

  lines.push("### For Data Charts (line, column, bar, area, pie, scatter, radar, gauge, heatmap, funnel, histogram, dual axes):");
  lines.push("Use Ant Design Charts (ADC) JSON format in a code block:");
  lines.push("");
  lines.push("```adc");
  lines.push('{\n  "type": "line",\n  "data": [\n    {"year": "1991", "value": 3},\n    {"year": "1992", "value": 4}\n  ],\n  "xField": "year",\n  "yField": "value"\n}');
  lines.push("```");
  lines.push("");
  lines.push("ADC output contract (MUST follow):");

  for (const rule of knowledge.outputContract) {
    lines.push(`- ${rule}`);
  }
  lines.push("- Prefer readable aesthetics: smooth line shapes where appropriate, subtle grid lines, and clear legend contrast.");

  lines.push("");
  lines.push("ADC chart types:");
  for (const chart of knowledge.chartTypes.slice(0, 6)) {
    lines.push(`- "${chart.type}" : ${chart.type} charts`);
  }
  lines.push("...");

  return lines.join("\n");
}

/**
 * Build G2 prompt section from knowledge
 */
export function buildG2PromptSection(knowledge: G2Knowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Data Charts (bar, line, area, scatter) - G2 Format:");
  lines.push("Use G2 JSON format in a code block:");
  lines.push("");
  lines.push("```g2");
  lines.push('{\n  "type": "interval",\n  "data": [\n    {"month": "Jan", "sales": 100},\n    {"month": "Feb", "sales": 150}\n  ],\n  "encode": {"x": "month", "y": "sales"}\n}');
  lines.push("```");
  lines.push("");
  lines.push("G2 output contract (MUST follow):");

  for (const rule of knowledge.outputContract) {
    lines.push(`- ${rule}`);
  }
  lines.push("- Prefer readable aesthetics: balanced categorical colors, light grid lines, and high-contrast axis/legend text.");

  lines.push("");
  lines.push("G2 chart types:");
  for (const chart of knowledge.chartTypes) {
    lines.push(`- "${chart.type}" : ${chart.type} charts`);
  }

  return lines.join("\n");
}

/**
 * Build Mermaid prompt section from knowledge
 */
export function buildMermaidPromptSection(knowledge: MermaidKnowledge | null): string {
  if (!knowledge) return "";

  const lines: string[] = [];

  lines.push("### For Diagrams (flowcharts, sequence, pie charts):");
  lines.push("Use Mermaid syntax in a code block:");
  lines.push("");
  lines.push("```mermaid");
  lines.push("graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]");
  lines.push("```");
  lines.push("");

  // Add universal rules
  if (knowledge.universalRules && knowledge.universalRules.length > 0) {
    lines.push("Mermaid rules (MUST follow):");
    for (const rule of knowledge.universalRules) {
      lines.push(`- ${rule}`);
    }
    lines.push("- Keep node labels concise and avoid crowded edge labels for better readability.");
    lines.push("");
  }

  lines.push("Mermaid examples:");
  lines.push("");

  // Add timeline example if available
  if (knowledge.diagramTypes.timeline) {
    lines.push("**Timeline:**");
    lines.push("```mermaid");
    lines.push(knowledge.diagramTypes.timeline.minimalTemplate);
    lines.push("```");
    lines.push("");
  }

  // Add flowchart example if available
  if (knowledge.diagramTypes.flowchart) {
    lines.push("**Flowchart:**");
    lines.push("```mermaid");
    lines.push(knowledge.diagramTypes.flowchart.minimalTemplate);
    lines.push("```");
  }

  return lines.join("\n");
}
