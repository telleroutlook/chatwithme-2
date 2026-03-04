import type { ChartPrimaryType } from "./runtime-config";
import type { ChartKnowledge, AdcKnowledge, G2Knowledge, MermaidKnowledge } from "../../types/chart-kb";
import {
  loadChartKnowledge,
  buildAdcPromptSection,
  buildG2PromptSection,
  buildMermaidPromptSection,
  detectChartKeywords,
  filterMermaidKnowledge,
  filterAdcKnowledge,
  filterG2Knowledge,
  sortMermaidKnowledgeTypes,
  sortAdcChartTypes,
  sortG2ChartTypes,
} from "./chart-knowledge";

/**
 * Build the system prompt for the chat agent (async version).
 */
export async function buildSystemPromptAsync(
  toolList: string[],
  chartPrimary: ChartPrimaryType = "adc"
): Promise<string> {
  const knowledge = await loadChartKnowledge();
  return buildPromptFromKnowledge(toolList, chartPrimary, knowledge);
}

/**
 * Build the system prompt for the chat agent (sync version).
 *
 * Uses pre-loaded JSON knowledge (bundled at build time).
 */
export function buildSystemPrompt(
  toolList: string[],
  chartPrimary: ChartPrimaryType = "adc"
): string {
  // Synchronously load knowledge (JSON is bundled at build time)
  const knowledge = getSyncKnowledge();
  return buildPromptFromKnowledge(toolList, chartPrimary, knowledge);
}

/**
 * Build the system prompt with keyword-based filtering.
 *
 * Detects chart keywords from user message and filters knowledge accordingly.
 * Falls back to core set when no keywords detected or no matches.
 */
export function buildSystemPromptWithKeywords(
  toolList: string[],
  chartPrimary: ChartPrimaryType,
  userMessage: string
): string {
  const knowledge = getSyncKnowledge();

  // Detect keywords from user message
  const keywords = detectChartKeywords(userMessage);

  // Filter knowledge by keywords
  const filteredMermaid = sortMermaidKnowledgeTypes(
    filterMermaidKnowledge(knowledge.mermaid, keywords.mermaid)
  );
  const filteredAdc = {
    ...knowledge.adc,
    chartTypes: sortAdcChartTypes(
      filterAdcKnowledge(knowledge.adc, keywords.adc)?.chartTypes || []
    ),
  };
  const filteredG2 = {
    ...knowledge.g2,
    chartTypes: sortG2ChartTypes(
      filterG2Knowledge(knowledge.g2, keywords.g2)?.chartTypes || []
    ),
  };

  return buildPromptFromKnowledge(toolList, chartPrimary, {
    adc: filteredAdc,
    g2: filteredG2,
    mermaid: filteredMermaid,
  });
}

/**
 * Build prompt from knowledge object
 */
function buildPromptFromKnowledge(
  toolList: string[],
  chartPrimary: ChartPrimaryType,
  knowledge: ChartKnowledge
): string {
  const chartPriority =
    chartPrimary === "adc"
      ? `For scenarios that are suitable for chart-based visualization, prefer Ant Design Charts (ADC) first.
Use G2 as a secondary option when ADC is not suitable.`
      : `For scenarios that are suitable for chart-based visualization, prefer G2 JSON charts first.
Use Ant Design Charts (ADC) as a secondary option when G2 is not suitable.`;

  const adcSection = chartPrimary === "adc" ? buildAdcPromptSection(knowledge.adc as AdcKnowledge | null) : "";
  const g2Section = buildG2PromptSection(knowledge.g2 as G2Knowledge | null);
  const mermaidSection = buildMermaidPromptSection(knowledge.mermaid as MermaidKnowledge | null);

  return `You are Claude, an Opus model created by Anthropic. After completing each answer, critically review it from a skeptic's perspective and call out possible issues or missing details.

You are a helpful AI assistant with the following capabilities:

## 1. Web Tools (MCP)
${toolList.length > 0 ? toolList.map((line) => `- ${line}`).join("\n") : "No tools available."}

You can call the tools directly when external information is required.

## Response Language
- Respond in the same language as the user's latest message.
- Keep technical terms, APIs, and code identifiers in English when needed for accuracy.

## 2. Chart Generation

When asked to create charts or diagrams, you MUST output them in code blocks.
${chartPriority}
Use Mermaid as a secondary option for diagrams.

${mermaidSection}
${adcSection}${g2Section}
IMPORTANT:
- Always use actual code blocks (triple backticks) for charts
- ${chartPrimary === "adc" ? "Prefer ADC for data visualization with numbers and chart-friendly scenarios" : "Prefer G2 for data visualization with numbers and chart-friendly scenarios"}
- Use Mermaid as the second choice for diagrams
- Make sure JSON is valid in chart blocks
- Mermaid strict-mode guardrails:
  - Do not use HTML tags in Mermaid (especially <br/>, <b>, <div>)
  - Do not include Markdown syntax in Mermaid blocks (# headings, markdown tables, markdown lists)
  - Use plain text labels; if line break is needed, split text into separate nodes/edges instead of HTML
- After generating a chart, briefly explain what it shows`;
}

// Import JSON directly for sync access (Vite bundles at build time)
import adcJson from "../../../knowledge-base/charts/adc.json";
import g2Json from "../../../knowledge-base/charts/g2.json";
import mermaidJson from "../../../knowledge-base/charts/mermaid.json";

// Cache for sync knowledge
let syncKnowledgeCache: {
  adc: typeof adcJson;
  g2: typeof g2Json;
  mermaid: typeof mermaidJson;
} | null = null;

/**
 * Get knowledge synchronously (uses bundled JSON)
 */
function getSyncKnowledge() {
  if (!syncKnowledgeCache) {
    syncKnowledgeCache = {
      adc: adcJson,
      g2: g2Json,
      mermaid: mermaidJson,
    };
  }
  return syncKnowledgeCache;
}
