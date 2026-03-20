import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("should return a non-empty string", () => {
    const prompt = buildSystemPrompt([]);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("should contain ChatWithMe identity", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("ChatWithMe");
  });

  it("should contain current date", () => {
    const prompt = buildSystemPrompt([]);
    const today = new Date().toISOString().slice(0, 10);
    expect(prompt).toContain(today);
  });

  it("should contain engine catalog", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Engine Catalog");
    expect(prompt).toContain("adc");
    expect(prompt).toContain("echarts");
    expect(prompt).toContain("vega-lite");
    expect(prompt).toContain("mermaid");
  });

  it("should contain chart rules", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Chart Rules");
    expect(prompt).toContain("builtin_chart_template");
  });

  it("should contain theme rule", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Do NOT set colors");
  });

  it("should contain ADC chart types in catalog", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("line: trends over time");
    expect(prompt).toContain("column: categorical comparison");
    expect(prompt).toContain("pie: part-to-whole");
  });

  it("should contain ECharts chart types in catalog", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("sankey: flow/allocation");
    expect(prompt).toContain("candlestick: financial");
    expect(prompt).toContain("gauge: dashboard meter");
  });

  it("should contain Mermaid diagram types in catalog", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("flowchart: process flows");
    expect(prompt).toContain("sequenceDiagram: API interactions");
    expect(prompt).toContain("erDiagram: database entity");
  });

  it("should contain Vega-Lite types in catalog", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("boxplot: distribution");
    expect(prompt).toContain("facet: split into sub-chart");
    expect(prompt).toContain("layer: multi-mark overlay");
  });

  it("should include tool list when provided", () => {
    const prompt = buildSystemPrompt(["webSearch", "fetch"]);
    expect(prompt).toContain("webSearch");
    expect(prompt).toContain("fetch");
  });

  it("should handle empty tool list", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("No tools available");
  });

  it("should include response language policy", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Respond in the same language as the user's latest message.");
  });

  it("should include Mermaid HTML prohibition", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("no HTML tags");
  });

  it("should include JSON strictness rule", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("strict RFC 8259 JSON");
  });

  it("should produce stable output for same inputs", () => {
    const prompt1 = buildSystemPrompt(["tool1"]);
    const prompt2 = buildSystemPrompt(["tool1"]);
    expect(prompt1).toBe(prompt2);
  });

  it("should include mindmap and excalidraw in other engines", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("mindmap");
    expect(prompt).toContain("excalidraw");
    expect(prompt).toContain("stat");
    expect(prompt).toContain("dashboard");
    expect(prompt).toContain("react");
  });

  it("always includes engine catalog regardless of input", () => {
    // The new design always includes the catalog - no keyword detection
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Engine Catalog");
    expect(prompt).toContain("Chart Rules");
    expect(prompt).toContain("builtin_chart_template");
  });
});

describe("snapshot stability", () => {
  it("should produce stable output for default inputs", () => {
    const prompts = Array(5)
      .fill(null)
      .map(() => buildSystemPrompt([]));
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(1);
  });
});
