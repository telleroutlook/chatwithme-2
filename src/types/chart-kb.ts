/**
 * Chart Knowledge Base Types
 *
 * Types for chart generation knowledge loaded at build/deploy time.
 * This enables dynamic prompt generation without hardcoding chart rules.
 */

/** Mermaid diagram template */
export interface MermaidTemplate {
  /** When to use this diagram type */
  whenToUse: string;
  /** Minimal working example */
  minimalTemplate: string;
  /** Common errors to avoid */
  commonErrors: string[];
}

/** Mermaid knowledge base */
export interface MermaidKnowledge {
  /** Universal rules for all Mermaid diagrams */
  universalRules?: string[];
  /** Supported diagram types */
  diagramTypes: Record<string, MermaidTemplate>;
}

/** ECharts chart type rule */
export interface EChartsChartRule {
  /** ECharts series type (e.g., "map", "sankey", "tree") */
  type: string;
  /** Display name (English / Chinese) */
  name: string;
  /** When to use this chart type */
  description: string;
  /** Trigger keywords (English and Chinese) */
  keywords: string[];
  /** Minimal but complete ECharts option example */
  spec_example: Record<string, unknown>;
  /** Important usage notes */
  notes: string;
}

/** ECharts knowledge base */
export interface EChartsKnowledge {
  /** Output contract rules */
  outputContract: string[];
  /** Whitelist of supported series types */
  typeWhitelist: string[];
  /** Supported chart types with examples */
  chartTypes: EChartsChartRule[];
}

/** Vega-Lite chart type rule */
export interface VegaLiteChartRule {
  /** Vega-Lite mark type (e.g., "bar", "line", "point") */
  type: string;
  /** Display name (English / Chinese) */
  name: string;
  /** When to use this chart type */
  description: string;
  /** Trigger keywords (English and Chinese) */
  keywords: string[];
  /** Minimal but complete Vega-Lite spec example */
  spec_example: Record<string, unknown>;
  /** Important usage notes */
  notes: string;
}

/** Vega-Lite knowledge base */
export interface VegaLiteKnowledge {
  /** Output contract rules */
  outputContract: string[];
  /** Whitelist of supported mark types */
  typeWhitelist: string[];
  /** Supported chart types with examples */
  chartTypes: VegaLiteChartRule[];
}

/** Loaded chart knowledge (what the runtime uses) */
export interface ChartKnowledge {
  /** Mermaid templates */
  mermaid: MermaidKnowledge | null;
  /** ECharts rules and examples */
  echarts: EChartsKnowledge | null;
  /** Vega-Lite rules and examples */
  vegaLite: VegaLiteKnowledge | null;
}
