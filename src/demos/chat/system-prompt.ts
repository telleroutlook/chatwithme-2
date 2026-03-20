import type { ChartPrimaryType } from "./runtime-config";
import type { ChartKnowledge, AdcKnowledge, G2Knowledge, MermaidKnowledge } from "../../types/chart-kb";
import {
  getChartKnowledge,
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
 * Build the system prompt with keyword-based filtering.
 *
 * Detects chart keywords from user message and filters knowledge accordingly.
 * Falls back to core set when no keywords detected or no matches.
 * For non-chart queries, omits chart knowledge entirely to save tokens.
 */
export function buildSystemPromptWithKeywords(
  toolList: string[],
  chartPrimary: ChartPrimaryType,
  userMessage: string
): string {
  const knowledge = getChartKnowledge();

  // Detect keywords from user message
  const keywords = detectChartKeywords(userMessage);

  // Check if the query is chart-related at all using word-boundary matching
  const isChartRelated =
    /\b(chart|graph|diagram|visualiz|plot|flowchart|sequence|gantt|timeline|mindmap|pie|bar\s*chart|line\s*chart|area\s*chart|scatter|radar|gauge|heatmap|funnel|histogram|mermaid|adc|g2)\b|图表|流程|架构|图形|饼图|柱状|折线|散点|雷达|仪表|热力|漏斗|甘特|思维导图/i.test(userMessage);

  if (!isChartRelated) {
    return buildMinimalPrompt(toolList);
  }

  // Filter knowledge by keywords
  const filteredMermaid = sortMermaidKnowledgeTypes(
    filterMermaidKnowledge(knowledge.mermaid, keywords.mermaid)
  );
  const filteredAdcKb = filterAdcKnowledge(knowledge.adc, keywords.adc);
  const filteredAdc: AdcKnowledge | null = filteredAdcKb ? {
    outputContract: filteredAdcKb.outputContract,
    typeWhitelist: filteredAdcKb.typeWhitelist,
    chartTypes: sortAdcChartTypes(filteredAdcKb.chartTypes),
  } : null;
  const filteredG2Kb = filterG2Knowledge(knowledge.g2, keywords.g2);
  const filteredG2: G2Knowledge | null = filteredG2Kb ? {
    outputContract: filteredG2Kb.outputContract,
    chartTypes: sortG2ChartTypes(filteredG2Kb.chartTypes),
  } : null;

  return buildPromptFromKnowledge(toolList, chartPrimary, {
    adc: filteredAdc,
    g2: filteredG2,
    mermaid: filteredMermaid,
  });
}

/**
 * Build a minimal prompt without chart knowledge (for non-chart queries).
 * Saves ~2000-3000 tokens per non-chart query.
 */
function buildMinimalPrompt(toolList: string[]): string {
  return `You are ChatWithMe, an intelligent AI assistant. Before finalizing each answer, internally verify your claims and fix any errors — but do not expose your review process to the user unless explicitly asked.

You are a helpful AI assistant with the following capabilities:

## 1. Web Tools
${toolList.length > 0 ? toolList.map((line) => `- ${line}`).join("\n") : "No tools available."}

You can call the tools directly when external information is required.

### When to Use Tools
- **Web search (builtin_web_search)**: PREFERRED. Use when the user asks about current events, recent news, real-time data, or anything that may have changed after your training cutoff. Also use when you are uncertain about a factual claim — search to verify before answering.
- **Web search (MCP)**: Only use the MCP search tools if the built-in search returns no results or fails.
- **Web reader**: Use when you need to read a specific URL the user provided or that appeared in search results.
- Do NOT use tools for well-established facts, math, coding help, or creative writing where your knowledge is sufficient.
- When tool results are returned, synthesize them into a direct answer — do not simply repeat raw tool output.

## Response Language
- Respond in the same language as the user's latest message.
- Keep technical terms, APIs, and code identifiers in English when needed for accuracy.

## 2. Charts & Diagrams
You can generate charts and diagrams when asked. Use code blocks with appropriate language tags (adc, g2, mermaid).

## 3. Internal Quality Checks (do NOT include these in your visible response)
Before finalizing your answer, silently verify:
1. Claims are supported by evidence or clearly marked as uncertain.
2. Code samples have correct syntax, imports, and variable names.
3. Numeric data and calculations are correct.
4. Tool output is accurately reflected in the answer.
5. The answer directly addresses the user's question.`;
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

  const adcSection = buildAdcPromptSection(knowledge.adc as AdcKnowledge | null);
  const g2Section = buildG2PromptSection(knowledge.g2 as G2Knowledge | null);
  const mermaidSection = buildMermaidPromptSection(knowledge.mermaid as MermaidKnowledge | null);

  // Order: primary chart library section first, then secondary
  const chartSections = chartPrimary === "adc"
    ? `${adcSection}\n${g2Section}`
    : `${g2Section}\n${adcSection}`;

  return `You are ChatWithMe, an intelligent AI assistant. Before finalizing each answer, internally verify your claims and fix any errors — but do not expose your review process to the user unless explicitly asked.

You are a helpful AI assistant with the following capabilities:

## 1. Web Tools
${toolList.length > 0 ? toolList.map((line) => `- ${line}`).join("\n") : "No tools available."}

You can call the tools directly when external information is required.

### When to Use Tools
- **Web search (builtin_web_search)**: PREFERRED. Use when the user asks about current events, recent news, real-time data, or anything that may have changed after your training cutoff. Also use when you are uncertain about a factual claim — search to verify before answering.
- **Web search (MCP)**: Only use the MCP search tools if the built-in search returns no results or fails.
- **Web reader**: Use when you need to read a specific URL the user provided or that appeared in search results.
- Do NOT use tools for well-established facts, math, coding help, or creative writing where your knowledge is sufficient.
- When tool results are returned, synthesize them into a direct answer — do not simply repeat raw tool output.

## Response Language
- Respond in the same language as the user's latest message.
- Keep technical terms, APIs, and code identifiers in English when needed for accuracy.

## 2. Chart Generation

When asked to create charts or diagrams, you MUST output them in code blocks.
${chartPriority}
Use Mermaid as a secondary option for diagrams.

Default chart aesthetics (apply unless user asks otherwise):
- Prefer a professional business visual style: clear contrast, restrained saturation, readable labels.
- Use rounded corners for bars/containers where supported and keep line charts smooth when readability benefits.
- Keep grid lines subtle; axis/legend text should remain readable in both light and dark themes.
- For multi-series charts, choose clearly distinguishable colors (avoid near-identical hues).

${mermaidSection}
${chartSections}
IMPORTANT:
- Always use actual code blocks (triple backticks) for charts
- ${chartPrimary === "adc" ? "Prefer ADC for data visualization with numbers and chart-friendly scenarios" : "Prefer G2 for data visualization with numbers and chart-friendly scenarios"}
- Use Mermaid as the second choice for diagrams
- Make sure JSON is valid in chart blocks
- Mermaid strict-mode guardrails:
  - Do not use HTML tags in Mermaid (especially <br/>, <b>, <div>)
  - Do not include Markdown syntax in Mermaid blocks (# headings, markdown tables, markdown lists)
  - Use plain text labels; if line break is needed, split text into separate nodes/edges instead of HTML
- After generating a chart, briefly explain what it shows

## 3. Internal Quality Checks (do NOT include these in your visible response)
Before finalizing your answer, silently verify:
1. Claims are supported by evidence or clearly marked as uncertain.
2. Code samples have correct syntax, imports, and variable names.
3. Numeric data and calculations are correct.
4. Tool output is accurately reflected in the answer.
5. The answer directly addresses the user's question.`;
}
