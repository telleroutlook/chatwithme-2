/**
 * Chart Knowledge Loader
 *
 * Loads chart generation knowledge at build/runtime and provides
 * functions to build prompt sections for ADC, G2, and Mermaid.
 */

import type { ChartKnowledge, AdcKnowledge, G2Knowledge, MermaidKnowledge } from "../../types/chart-kb";

// Knowledge base is bundled at build time via Vite's ?raw imports
// For SSR/Worker, we read from the file system

let cachedKnowledge: ChartKnowledge | null = null;

/**
 * Load chart knowledge from knowledge base files
 *
 * In development: reads from knowledge-base/charts/*.json
 * In production: uses bundled knowledge (injected at build time)
 */
export async function loadChartKnowledge(): Promise<ChartKnowledge> {
  if (cachedKnowledge) {
    return cachedKnowledge;
  }

  // For Worker runtime, always use embedded knowledge
  // Knowledge base updates are synced during build via npm run kb:refresh
  cachedKnowledge = getEmbeddedKnowledge();
  return cachedKnowledge;
}

/**
 * Get embedded knowledge (fallback when files are not available)
 *
 * This contains the same knowledge as the JSON files, embedded directly
 * for Worker runtime where file system access is not available.
 */
function getEmbeddedKnowledge(): ChartKnowledge {
  return {
    adc: getEmbeddedAdcKnowledge(),
    g2: getEmbeddedG2Knowledge(),
    mermaid: getEmbeddedMermaidKnowledge(),
  };
}

/**
 * Embedded ADC knowledge
 */
function getEmbeddedAdcKnowledge(): AdcKnowledge {
  return {
    outputContract: [
      "ADC blocks must be strict RFC 8259 JSON",
      "Do not output comments, trailing commas, undefined, NaN, Infinity, or functions",
      "All keys must use double quotes; all string values must use double quotes",
      "Never output callback expressions such as (d) => ... or function (...)",
      "Supported chart types: line, column, bar, area, pie, scatter, radar, gauge, heatmap, funnel, histogram, dualAxes",
    ],
    typeWhitelist: [
      "line",
      "column",
      "bar",
      "area",
      "pie",
      "scatter",
      "radar",
      "gauge",
      "heatmap",
      "funnel",
      "histogram",
      "dualAxes",
    ],
    chartTypes: [
      {
        type: "line",
        requiredFields: ["data", "xField", "yField"],
        example: '{"type":"line","data":[{"year":"1991","value":3},{"year":"1992","value":4}],"xField":"year","yField":"value"}',
        commonErrors: ["Using callback functions in field mappings", "Missing required xField or yField"],
      },
      {
        type: "column",
        requiredFields: ["data", "xField", "yField"],
        example: '{"type":"column","data":[{"category":"A","value":10},{"category":"B","value":20}],"xField":"category","yField":"value"}',
        commonErrors: ["Confusing column (vertical) with bar (horizontal)"],
      },
      {
        type: "bar",
        requiredFields: ["data", "xField", "yField"],
        example: '{"type":"bar","data":[{"category":"A","value":10}],"xField":"value","yField":"category"}',
        commonErrors: ["Swapping xField and yField (bar is horizontal)"],
      },
      {
        type: "area",
        requiredFields: ["data", "xField", "yField"],
        example: '{"type":"area","data":[{"date":"2024-01","value":100}],"xField":"date","yField":"value"}',
        commonErrors: ["Same as line chart errors"],
      },
      {
        type: "pie",
        requiredFields: ["data", "angleField", "colorField"],
        example: '{"type":"pie","data":[{"type":"A","value":35},{"type":"B","value":25}],"angleField":"value","colorField":"type"}',
        commonErrors: ["Using xField/yField instead of angleField/colorField"],
      },
      {
        type: "scatter",
        requiredFields: ["data", "xField", "yField"],
        example: '{"type":"scatter","data":[{"x":10,"y":20}],"xField":"x","yField":"y"}',
        commonErrors: ["Missing colorField for category distinction"],
      },
      {
        type: "radar",
        requiredFields: ["data", "xField", "yField"],
        example: '{"type":"radar","data":[{"item":"Speed","score":80}],"xField":"item","yField":"score"}',
        commonErrors: ["Wrong field names for radar dimensions"],
      },
      {
        type: "gauge",
        requiredFields: ["data"],
        example: '{"type":"gauge","data":[{"value":75}]}',
        commonErrors: ["Missing percent or value field"],
      },
      {
        type: "heatmap",
        requiredFields: ["data", "xField", "yField", "colorField"],
        example: '{"type":"heatmap","data":[{"day":"Mon","hour":"9am","value":10}],"xField":"day","yField":"hour","colorField":"value"}',
        commonErrors: ["Missing colorField for intensity"],
      },
      {
        type: "funnel",
        requiredFields: ["data"],
        example: '{"type":"funnel","data":[{"stage":"Visit","count":100},{"stage":"Buy","count":20}]}',
        commonErrors: ["Data not sorted by funnel order"],
      },
      {
        type: "histogram",
        requiredFields: ["data", "binField"],
        example: '{"type":"histogram","data":[{"value":1},{"value":2}],"binField":"value"}',
        commonErrors: ["Using xField instead of binField"],
      },
      {
        type: "dualAxes",
        requiredFields: ["data"],
        example: '{"type":"dualAxes","data":[{"time":"Jan","value":100,"rate":0.5}],"xField":"time","yField":"value"}',
        commonErrors: ["Not specifying two y-axis configurations"],
      },
    ],
  };
}

/**
 * Embedded G2 knowledge
 */
function getEmbeddedG2Knowledge(): G2Knowledge {
  return {
    outputContract: [
      "G2 blocks must be strict RFC 8259 JSON",
      "Do not output comments, trailing commas, undefined, NaN, Infinity, or functions",
      "All keys must use double quotes; all string values must use double quotes",
      "Never output callback expressions such as (d) => ... or function (...)",
      "For constant colors, use string literals like \"#4E79A7\"",
      "For categorical color mapping, use \"encode\": { \"color\": \"<field>\" }",
      "scale.color.range must contain only valid CSS color strings, never category labels",
      "encode.x/encode.y/encode.color referenced fields must exist in data",
    ],
    chartTypes: [
      {
        type: "interval",
        requiredFields: ["data", "encode"],
        example: '{"type":"interval","data":[{"month":"Jan","sales":100}],"encode":{"x":"month","y":"sales"}}',
        commonErrors: ["Using xField/yField instead of encode.x/encode.y"],
      },
      {
        type: "line",
        requiredFields: ["data", "encode"],
        example: '{"type":"line","data":[{"date":"2024-01","value":120}],"encode":{"x":"date","y":"value"}}',
        commonErrors: ["Missing encode.x or encode.y"],
      },
      {
        type: "area",
        requiredFields: ["data", "encode"],
        example: '{"type":"area","data":[{"x":1,"y":10}],"encode":{"x":"x","y":"y"}}',
        commonErrors: ["Same as line chart errors"],
      },
      {
        type: "point",
        requiredFields: ["data", "encode"],
        example: '{"type":"point","data":[{"x":10,"y":20}],"encode":{"x":"x","y":"y"}}',
        commonErrors: ["Missing encode.color for category distinction"],
      },
      {
        type: "cell",
        requiredFields: ["data", "encode"],
        example: '{"type":"cell","data":[{"day":"Mon","hour":"9am","value":10}],"encode":{"x":"day","y":"hour","color":"value"}}',
        commonErrors: ["Missing encode.color for heat values"],
      },
    ],
  };
}

/**
 * Embedded Mermaid knowledge
 */
function getEmbeddedMermaidKnowledge(): MermaidKnowledge {
  return {
    diagramTypes: {
      flowchart: {
        whenToUse: "Process flows, decision trees, algorithm visualization",
        minimalTemplate: "flowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action]",
        commonErrors: ["Using graph instead of flowchart keyword", "Missing node shapes brackets"],
      },
      sequenceDiagram: {
        whenToUse: "API interactions, message flows, communication protocols",
        minimalTemplate: "sequenceDiagram\n    A->>B: Request\n    B-->>A: Response",
        commonErrors: ["Using wrong arrow types (->> vs -->>)", "Missing participant declarations"],
      },
      classDiagram: {
        whenToUse: "OOP class structures, database schemas, type definitions",
        minimalTemplate: "classDiagram\n    class Animal {\n        +String name\n    }",
        commonErrors: ["Wrong visibility modifiers", "Missing class keyword"],
      },
      stateDiagram: {
        whenToUse: "State machines, workflow states, lifecycle diagrams",
        minimalTemplate: "stateDiagram-v2\n    [*] --> Idle\n    Idle --> [*]",
        commonErrors: ["Using v1 syntax instead of v2", "Missing [*] for start/end states"],
      },
      erDiagram: {
        whenToUse: "Database entity relationships, data models",
        minimalTemplate: "erDiagram\n    USER ||--o{ ORDER : places",
        commonErrors: ["Wrong relationship operators", "Missing entity attributes"],
      },
      pie: {
        whenToUse: "Simple pie charts, percentage distributions",
        minimalTemplate: "pie title Distribution\n    \"A\": 40\n    \"B\": 60",
        commonErrors: ["Missing title keyword", "Not using quotes for labels"],
      },
      gantt: {
        whenToUse: "Project timelines, task schedules",
        minimalTemplate: "gantt\n    title Schedule\n    dateFormat YYYY-MM-DD\n    Task: 2024-01-01, 7d",
        commonErrors: ["Wrong dateFormat", "Invalid date syntax"],
      },
      mindmap: {
        whenToUse: "Brainstorming, hierarchical concepts",
        minimalTemplate: "mindmap\n  root((Idea))\n    Branch1\n    Branch2",
        commonErrors: ["Missing root declaration", "Incorrect indentation"],
      },
      timeline: {
        whenToUse: "Historical events, project milestones",
        minimalTemplate: "timeline\n    title History\n    2024-01 : Event",
        commonErrors: ["Missing title", "Wrong date format"],
      },
      gitGraph: {
        whenToUse: "Git workflows, branch strategies",
        minimalTemplate: "gitGraph\n    commit\n    branch feature\n    merge feature",
        commonErrors: ["Using undeclared branches", "Wrong checkout/merge order"],
      },
    },
  };
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
  lines.push("Mermaid examples:");
  lines.push("");
  lines.push("**Pie Chart:**");
  lines.push("```mermaid");
  lines.push("pie title Sales Distribution\n    \"East\" : 35\n    \"West\" : 25");
  lines.push("```");
  lines.push("");
  lines.push("**Flowchart:**");
  lines.push("```mermaid");
  lines.push("flowchart LR\n    A[Input] --> B[Process]\n    B --> C[Output]");
  lines.push("```");
  lines.push("");
  lines.push("**Sequence Diagram:**");
  lines.push("```mermaid");
  lines.push("sequenceDiagram\n    User->>Server: Request\n    Server-->>User: Response");
  lines.push("```");

  return lines.join("\n");
}
