/**
 * Chart Knowledge Loader
 *
 * Loads chart generation knowledge from JSON files at build time.
 * Vite bundles these imports into the Worker.
 */

import type { ChartKnowledge, AdcKnowledge, G2Knowledge, MermaidKnowledge } from "../../types/chart-kb";

// Import JSON files directly - Vite will bundle them
import adcJson from "../../../knowledge-base/charts/adc.json";
import g2Json from "../../../knowledge-base/charts/g2.json";
import mermaidJson from "../../../knowledge-base/charts/mermaid.json";

let cachedKnowledge: ChartKnowledge | null = null;

/**
 * Load chart knowledge from bundled JSON files
 */
export async function loadChartKnowledge(): Promise<ChartKnowledge> {
  if (cachedKnowledge) {
    return cachedKnowledge;
  }

  cachedKnowledge = {
    adc: adcJson as AdcKnowledge,
    g2: g2Json as G2Knowledge,
    mermaid: mermaidJson as MermaidKnowledge,
  };

  return cachedKnowledge;
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
