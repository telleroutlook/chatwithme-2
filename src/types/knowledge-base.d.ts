/**
 * Type declarations for knowledge-base JSON files
 */

declare module "../../../knowledge-base/charts/adc.json" {
  const value: import("./chart-kb").AdcKnowledge;
  export default value;
}

declare module "../../../knowledge-base/charts/g2.json" {
  const value: import("./chart-kb").G2Knowledge;
  export default value;
}

declare module "../../../knowledge-base/charts/mermaid.json" {
  const value: import("./chart-kb").MermaidKnowledge;
  export default value;
}

// Generic JSON module declaration as fallback
declare module "*.json" {
  const value: unknown;
  export default value;
}
