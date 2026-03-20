/**
 * Built-in chart template tool
 *
 * Lets the AI fetch the exact format spec for a specific chart engine + type.
 * Returns outputContract, example/spec_example, notes, and commonErrors so the
 * AI can generate correct chart code on the first attempt.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";
import { getChartKnowledge } from "../chart-knowledge";

export const BUILTIN_CHART_TEMPLATE_KEY = "builtin_chart_template";

const VALID_ENGINES = ["adc", "echarts", "mermaid", "vega-lite"] as const;

type Engine = (typeof VALID_ENGINES)[number];

/**
 * Build a lookup map: engine -> chartType -> template data.
 * Computed once on first call, then cached.
 */
let cachedLookup: Map<string, Record<string, unknown>> | null = null;

function buildLookup(): Map<string, Record<string, unknown>> {
  if (cachedLookup) return cachedLookup;

  const kb = getChartKnowledge();
  const map = new Map<string, Record<string, unknown>>();

  // ADC
  if (kb.adc) {
    for (const chart of kb.adc.chartTypes) {
      map.set(`adc:${chart.type}`, {
        engine: "adc",
        chartType: chart.type,
        outputContract: kb.adc.outputContract,
        example: chart.example,
        requiredFields: chart.requiredFields,
        tips: chart.tips || null,
        commonErrors: chart.commonErrors,
        themeNote:
          "Do not set colors, font colors, or background colors. The renderer applies theme-aware palettes and styles automatically for both light and dark modes.",
      });
    }
  }

  // ECharts
  if (kb.echarts) {
    for (const chart of kb.echarts.chartTypes) {
      map.set(`echarts:${chart.type}`, {
        engine: "echarts",
        chartType: chart.type,
        outputContract: kb.echarts.outputContract,
        spec_example: chart.spec_example,
        notes: chart.notes,
        commonErrors: [] as string[],
        themeNote:
          "Do not set color arrays, textStyle.color, axisLine.lineStyle.color, or tooltip styles. The renderer applies theme-aware palettes and font colors automatically for both light and dark modes.",
      });
    }
  }

  // Mermaid
  if (kb.mermaid) {
    for (const [typeName, diag] of Object.entries(kb.mermaid.diagramTypes)) {
      map.set(`mermaid:${typeName}`, {
        engine: "mermaid",
        chartType: typeName,
        universalRules: kb.mermaid.universalRules || [],
        whenToUse: diag.whenToUse,
        minimalTemplate: diag.minimalTemplate,
        commonErrors: diag.commonErrors,
        themeNote:
          "Do not use %%{init:}%% to override theme. The renderer handles light/dark mode automatically.",
      });
    }
  }

  // Vega-Lite
  if (kb.vegaLite) {
    for (const chart of kb.vegaLite.chartTypes) {
      map.set(`vega-lite:${chart.type}`, {
        engine: "vega-lite",
        chartType: chart.type,
        outputContract: kb.vegaLite.outputContract,
        spec_example: chart.spec_example,
        notes: chart.notes,
        commonErrors: [] as string[],
        themeNote:
          "Do not set color/backgroundColor/textStyle.color. The renderer applies theme-aware styles automatically for both light and dark modes.",
      });
    }
  }

  cachedLookup = map;
  return map;
}

function getAvailableTypes(engine: Engine): string[] {
  const lookup = buildLookup();
  const prefix = `${engine}:`;
  const types: string[] = [];
  for (const key of lookup.keys()) {
    if (key.startsWith(prefix)) {
      types.push(key.slice(prefix.length));
    }
  }
  return types;
}

export function createChartTemplateTool(): ToolSet {
  return {
    [BUILTIN_CHART_TEMPLATE_KEY]: tool({
      description:
        "Get the exact format spec and example for a specific chart engine and type. Call this BEFORE generating any adc/echarts/vega-lite/mermaid code block.",
      inputSchema: z.object({
        engine: z
          .enum(["adc", "echarts", "mermaid", "vega-lite"])
          .describe("Chart engine to use"),
        chartType: z
          .string()
          .describe(
            "Specific chart type, e.g. 'sankey', 'flowchart', 'boxplot', 'line'"
          ),
      }),
      execute: async (args: { engine: string; chartType: string }) => {
        const { engine, chartType } = args;
        const lookup = buildLookup();
        const key = `${engine}:${chartType}`;
        const template = lookup.get(key);

        if (template) {
          return template;
        }

        // Not found — return available types for this engine
        const available = getAvailableTypes(engine as Engine);
        if (available.length > 0) {
          return {
            error: `Unknown chartType "${chartType}" for engine "${engine}".`,
            availableTypes: available,
            hint: `Pick one of the available types and call again.`,
          };
        }

        return {
          error: `Unknown engine "${engine}".`,
          availableEngines: [...VALID_ENGINES],
        };
      },
    }),
  };
}
