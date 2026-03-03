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

/** ADC chart type rule */
export interface AdcChartRule {
  /** Chart type name */
  type: string;
  /** Required fields */
  requiredFields: string[];
  /** Minimal example */
  example: string;
  /** Common errors */
  commonErrors: string[];
}

/** ADC knowledge base */
export interface AdcKnowledge {
  /** Output contract rules */
  outputContract: string[];
  /** Supported chart types */
  chartTypes: AdcChartRule[];
  /** Whitelist of supported types */
  typeWhitelist: string[];
}

/** G2 chart type rule */
export interface G2ChartRule {
  /** Chart type name */
  type: string;
  /** Required fields */
  requiredFields: string[];
  /** Minimal example */
  example: string;
  /** Common errors */
  commonErrors: string[];
}

/** G2 knowledge base */
export interface G2Knowledge {
  /** Output contract rules */
  outputContract: string[];
  /** Supported chart types */
  chartTypes: G2ChartRule[];
}

/** Knowledge base metadata */
export interface KnowledgeBaseMeta {
  /** Version string */
  version: string;
  /** Fetch timestamp (ISO 8601) */
  fetchedAt: string;
  /** Source identifier */
  source: string;
  /** Content hash for cache validation */
  contentHash: string;
  /** Summary of contents */
  summary: {
    adc: boolean;
    g2: boolean;
    mermaid: boolean;
    mermaidDiagramCount: number;
    adcChartCount: number;
    g2ChartCount: number;
  };
}

/** Full chart knowledge base */
export interface ChartKnowledgeBase {
  meta: KnowledgeBaseMeta;
  adc: AdcKnowledge;
  g2: G2Knowledge;
  mermaid: MermaidKnowledge;
}

/** Loaded chart knowledge (what the runtime uses) */
export interface ChartKnowledge {
  /** ADC rules and examples */
  adc: AdcKnowledge | null;
  /** G2 rules and examples */
  g2: G2Knowledge | null;
  /** Mermaid templates */
  mermaid: MermaidKnowledge | null;
}
