/**
 * Chart Knowledge Loader
 *
 * Loads chart generation knowledge from JSON files at build time.
 * Vite bundles these imports into the Worker.
 *
 * Used by the builtin_chart_template tool to look up engine/type templates.
 */

import type { ChartKnowledge, AdcKnowledge, MermaidKnowledge, EChartsKnowledge, VegaLiteKnowledge } from "../../types/chart-kb";

// Import JSON files directly - Vite will bundle them
import adcJson from "../../../knowledge-base/charts/adc.json";
import mermaidJson from "../../../knowledge-base/charts/mermaid.json";
import echartsJson from "../../../knowledge-base/charts/echarts.json";
import vegaLiteJson from "../../../knowledge-base/charts/vega-lite.json";

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
