/**
 * Type declarations for knowledge-base JSON files
 */

declare module "../../../knowledge-base/charts/mermaid.json" {
  const value: import("./chart-kb").MermaidKnowledge;
  export default value;
}

declare module "../../../knowledge-base/charts/echarts.json" {
  const value: import("./chart-kb").EChartsKnowledge;
  export default value;
}

declare module "../../../knowledge-base/charts/vega-lite.json" {
  const value: import("./chart-kb").VegaLiteKnowledge;
  export default value;
}

// Generic JSON module declaration as fallback
declare module "*.json" {
  const value: unknown;
  export default value;
}
