import { describe, it, expect } from "vitest";
import {
  detectChartKeywords,
  filterMermaidKnowledge,
  filterAdcKnowledge,
  filterG2Knowledge,
  sortMermaidDiagramTypes,
  sortAdcChartTypes,
  sortG2ChartTypes,
  sortMermaidKnowledgeTypes,
} from "./chart-knowledge";
import type { MermaidKnowledge, AdcKnowledge, G2Knowledge, AdcChartRule, G2ChartRule } from "../../types/chart-kb";

// ============================================================================
// detectChartKeywords Tests
// ============================================================================

describe("detectChartKeywords", () => {
  it("should detect flowchart keywords", () => {
    const result = detectChartKeywords("create a flowchart for user registration");
    expect(result.mermaid).toContain("flowchart");
  });

  it("should detect sequence diagram keywords", () => {
    const result = detectChartKeywords("show me the API sequence diagram");
    expect(result.mermaid).toContain("sequenceDiagram");
  });

  it("should detect pie chart keywords", () => {
    const result = detectChartKeywords("draw a pie chart of market share");
    expect(result.mermaid).toContain("pie");
  });

  it("should detect erDiagram keywords", () => {
    const result = detectChartKeywords("create an ER diagram for the database");
    expect(result.mermaid).toContain("erDiagram");
  });

  it("should detect gantt chart keywords", () => {
    const result = detectChartKeywords("show the project schedule as a gantt chart");
    expect(result.mermaid).toContain("gantt");
  });

  it("should detect ADC line chart type", () => {
    const result = detectChartKeywords("create a line chart");
    expect(result.adc).toContain("line");
    expect(result.g2).toContain("line");
  });

  it("should detect ADC bar chart type", () => {
    const result = detectChartKeywords("draw a bar chart for sales data");
    expect(result.adc).toContain("bar");
    expect(result.g2).toContain("interval");
  });

  it("should return empty arrays for no keywords", () => {
    const result = detectChartKeywords("hello world, how are you?");
    expect(result.mermaid).toHaveLength(0);
    expect(result.adc).toHaveLength(0);
    expect(result.g2).toHaveLength(0);
  });

  it("should handle multiple keywords", () => {
    const result = detectChartKeywords("compare bar and pie charts");
    expect(result.adc).toContain("bar");
    expect(result.adc).toContain("pie");
    expect(result.mermaid).toContain("pie");
  });

  it("should be case-insensitive", () => {
    const result = detectChartKeywords("Create a FLOWCHART with PIE data");
    expect(result.mermaid).toContain("flowchart");
    expect(result.mermaid).toContain("pie");
  });

  it("should deduplicate keywords", () => {
    const result = detectChartKeywords("flowchart flowchart flowchart");
    expect(result.mermaid.filter((k) => k === "flowchart")).toHaveLength(1);
  });
});

// ============================================================================
// filterMermaidKnowledge Tests
// ============================================================================

describe("filterMermaidKnowledge", () => {
  const mockKnowledge: MermaidKnowledge = {
    universalRules: ["Rule 1", "Rule 2"],
    diagramTypes: {
      flowchart: {
        whenToUse: "Process flows",
        minimalTemplate: "flowchart TD\n A --> B",
        commonErrors: ["Error 1"],
      },
      sequenceDiagram: {
        whenToUse: "API calls",
        minimalTemplate: "sequenceDiagram\n A->>B: Hello",
        commonErrors: ["Error 2"],
      },
      pie: {
        whenToUse: "Percentages",
        minimalTemplate: "pie title Test\n A: 50",
        commonErrors: ["Error 3"],
      },
      erDiagram: {
        whenToUse: "Database schema",
        minimalTemplate: "erDiagram\n USER ||--o{ ORDER",
        commonErrors: ["Error 4"],
      },
    },
  };

  it("should return core types when no keywords", () => {
    const result = filterMermaidKnowledge(mockKnowledge, []);
    expect(result).not.toBeNull();
    expect(Object.keys(result?.diagramTypes || {})).toContain("flowchart");
    expect(Object.keys(result?.diagramTypes || {})).toContain("sequenceDiagram");
    expect(Object.keys(result?.diagramTypes || {})).toContain("pie");
  });

  it("should filter by single keyword", () => {
    const result = filterMermaidKnowledge(mockKnowledge, ["sequenceDiagram"]);
    expect(result).not.toBeNull();
    expect(Object.keys(result?.diagramTypes || {})).toEqual(["sequenceDiagram"]);
  });

  it("should filter by multiple keywords", () => {
    const result = filterMermaidKnowledge(mockKnowledge, ["sequenceDiagram", "pie"]);
    expect(result).not.toBeNull();
    const types = Object.keys(result?.diagramTypes || {});
    expect(types).toContain("sequenceDiagram");
    expect(types).toContain("pie");
    expect(types).toHaveLength(2);
  });

  it("should fallback to core types when no matches", () => {
    const result = filterMermaidKnowledge(mockKnowledge, ["nonexistent"]);
    expect(result).not.toBeNull();
    // Should fallback to core types
    expect(Object.keys(result?.diagramTypes || {}).length).toBeGreaterThan(0);
  });

  it("should return null for null input", () => {
    const result = filterMermaidKnowledge(null, []);
    expect(result).toBeNull();
  });

  it("should preserve universal rules", () => {
    const result = filterMermaidKnowledge(mockKnowledge, ["flowchart"]);
    expect(result?.universalRules).toEqual(["Rule 1", "Rule 2"]);
  });
});

// ============================================================================
// filterAdcKnowledge Tests
// ============================================================================

describe("filterAdcKnowledge", () => {
  const mockKnowledge: AdcKnowledge = {
    outputContract: ["Rule 1"],
    typeWhitelist: ["line", "bar", "pie", "scatter", "radar"],
    chartTypes: [
      { type: "line", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "bar", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "pie", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "scatter", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "radar", requiredFields: ["data"], example: "{}", commonErrors: [] },
    ],
  };

  it("should return first 4 chart types when no keywords", () => {
    const result = filterAdcKnowledge(mockKnowledge, []);
    expect(result).not.toBeNull();
    expect(result?.chartTypes.length).toBeLessThanOrEqual(4);
  });

  it("should filter by single keyword", () => {
    const result = filterAdcKnowledge(mockKnowledge, ["line"]);
    expect(result).not.toBeNull();
    expect(result?.chartTypes).toHaveLength(1);
    expect(result?.chartTypes[0].type).toBe("line");
  });

  it("should filter by multiple keywords", () => {
    const result = filterAdcKnowledge(mockKnowledge, ["line", "pie"]);
    expect(result).not.toBeNull();
    expect(result?.chartTypes).toHaveLength(2);
    const types = result?.chartTypes.map((c) => c.type) || [];
    expect(types).toContain("line");
    expect(types).toContain("pie");
  });

  it("should fallback when no matches", () => {
    const result = filterAdcKnowledge(mockKnowledge, ["nonexistent"]);
    expect(result).not.toBeNull();
    expect(result?.chartTypes.length).toBeGreaterThan(0);
  });

  it("should return null for null input", () => {
    const result = filterAdcKnowledge(null, []);
    expect(result).toBeNull();
  });

  it("should preserve output contract", () => {
    const result = filterAdcKnowledge(mockKnowledge, ["line"]);
    expect(result?.outputContract).toEqual(["Rule 1"]);
  });
});

// ============================================================================
// filterG2Knowledge Tests
// ============================================================================

describe("filterG2Knowledge", () => {
  const mockKnowledge: G2Knowledge = {
    outputContract: ["Rule 1"],
    chartTypes: [
      { type: "interval", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "line", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "area", requiredFields: ["data"], example: "{}", commonErrors: [] },
      { type: "point", requiredFields: ["data"], example: "{}", commonErrors: [] },
    ],
  };

  it("should return all types when no keywords", () => {
    const result = filterG2Knowledge(mockKnowledge, []);
    expect(result).not.toBeNull();
    expect(result?.chartTypes.length).toBe(4);
  });

  it("should filter by single keyword", () => {
    const result = filterG2Knowledge(mockKnowledge, ["line"]);
    expect(result).not.toBeNull();
    expect(result?.chartTypes).toHaveLength(1);
    expect(result?.chartTypes[0].type).toBe("line");
  });

  it("should fallback to full set when no matches", () => {
    const result = filterG2Knowledge(mockKnowledge, ["nonexistent"]);
    expect(result).not.toBeNull();
    expect(result?.chartTypes.length).toBe(4);
  });

  it("should return null for null input", () => {
    const result = filterG2Knowledge(null, []);
    expect(result).toBeNull();
  });
});

// ============================================================================
// sortMermaidDiagramTypes Tests
// ============================================================================

describe("sortMermaidDiagramTypes", () => {
  it("should sort by priority order", () => {
    const input = ["pie", "flowchart", "sequenceDiagram"];
    const result = sortMermaidDiagramTypes(input);
    expect(result[0]).toBe("flowchart");
    expect(result[1]).toBe("sequenceDiagram");
    expect(result[2]).toBe("pie");
  });

  it("should put flowchart first", () => {
    const input = ["erDiagram", "flowchart", "timeline"];
    const result = sortMermaidDiagramTypes(input);
    expect(result[0]).toBe("flowchart");
  });

  it("should sort unknown types alphabetically", () => {
    const input = ["zebra", "alpha", "flowchart"];
    const result = sortMermaidDiagramTypes(input);
    expect(result[0]).toBe("flowchart"); // Priority first
    expect(result[1]).toBe("alpha"); // Then alphabetically
    expect(result[2]).toBe("zebra");
  });

  it("should not modify original array", () => {
    const input = ["pie", "flowchart"];
    const originalOrder = [...input];
    sortMermaidDiagramTypes(input);
    expect(input).toEqual(originalOrder);
  });

  it("should handle empty array", () => {
    const result = sortMermaidDiagramTypes([]);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// sortAdcChartTypes Tests
// ============================================================================

describe("sortAdcChartTypes", () => {
  const charts: AdcChartRule[] = [
    { type: "radar", requiredFields: [], example: "", commonErrors: [] },
    { type: "bar", requiredFields: [], example: "", commonErrors: [] },
    { type: "line", requiredFields: [], example: "", commonErrors: [] },
  ];

  it("should sort alphabetically by type", () => {
    const result = sortAdcChartTypes(charts);
    expect(result[0].type).toBe("bar");
    expect(result[1].type).toBe("line");
    expect(result[2].type).toBe("radar");
  });

  it("should not modify original array", () => {
    const original = [...charts];
    sortAdcChartTypes(charts);
    expect(charts).toEqual(original);
  });
});

// ============================================================================
// sortG2ChartTypes Tests
// ============================================================================

describe("sortG2ChartTypes", () => {
  const charts: G2ChartRule[] = [
    { type: "point", requiredFields: [], example: "", commonErrors: [] },
    { type: "area", requiredFields: [], example: "", commonErrors: [] },
    { type: "interval", requiredFields: [], example: "", commonErrors: [] },
  ];

  it("should sort alphabetically by type", () => {
    const result = sortG2ChartTypes(charts);
    expect(result[0].type).toBe("area");
    expect(result[1].type).toBe("interval");
    expect(result[2].type).toBe("point");
  });
});

// ============================================================================
// sortMermaidKnowledgeTypes Tests
// ============================================================================

describe("sortMermaidKnowledgeTypes", () => {
  const mockKnowledge: MermaidKnowledge = {
    universalRules: ["Rule 1"],
    diagramTypes: {
      pie: {
        whenToUse: "Percentages",
        minimalTemplate: "pie",
        commonErrors: [],
      },
      flowchart: {
        whenToUse: "Flows",
        minimalTemplate: "flowchart",
        commonErrors: [],
      },
      sequenceDiagram: {
        whenToUse: "Sequences",
        minimalTemplate: "sequenceDiagram",
        commonErrors: [],
      },
    },
  };

  it("should sort diagram types by priority", () => {
    const result = sortMermaidKnowledgeTypes(mockKnowledge);
    expect(result).not.toBeNull();
    const keys = Object.keys(result?.diagramTypes || {});
    expect(keys[0]).toBe("flowchart");
    expect(keys[1]).toBe("sequenceDiagram");
    expect(keys[2]).toBe("pie");
  });

  it("should return null for null input", () => {
    const result = sortMermaidKnowledgeTypes(null);
    expect(result).toBeNull();
  });

  it("should preserve universal rules", () => {
    const result = sortMermaidKnowledgeTypes(mockKnowledge);
    expect(result?.universalRules).toEqual(["Rule 1"]);
  });
});
