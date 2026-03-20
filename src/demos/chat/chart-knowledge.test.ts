import { describe, it, expect } from "vitest";
import { getChartKnowledge, loadChartKnowledge } from "./chart-knowledge";

describe("getChartKnowledge", () => {
  it("returns a non-null ChartKnowledge object", () => {
    const kb = getChartKnowledge();
    expect(kb).toBeDefined();
    expect(kb.adc).toBeDefined();
    expect(kb.mermaid).toBeDefined();
    expect(kb.echarts).toBeDefined();
    expect(kb.vegaLite).toBeDefined();
  });

  it("ADC knowledge has chart types and output contract", () => {
    const kb = getChartKnowledge();
    expect(kb.adc!.outputContract.length).toBeGreaterThan(0);
    expect(kb.adc!.chartTypes.length).toBeGreaterThan(0);
    expect(kb.adc!.typeWhitelist.length).toBeGreaterThan(0);
  });

  it("ADC does not include gauge (moved to ECharts)", () => {
    const kb = getChartKnowledge();
    expect(kb.adc!.typeWhitelist).not.toContain("gauge");
    const gaugeChart = kb.adc!.chartTypes.find(c => c.type === "gauge");
    expect(gaugeChart).toBeUndefined();
  });

  it("ECharts knowledge has chart types and output contract", () => {
    const kb = getChartKnowledge();
    expect(kb.echarts!.outputContract.length).toBeGreaterThan(0);
    expect(kb.echarts!.chartTypes.length).toBeGreaterThan(0);
    expect(kb.echarts!.typeWhitelist).toContain("gauge");
  });

  it("Mermaid knowledge has diagram types and universal rules", () => {
    const kb = getChartKnowledge();
    expect(kb.mermaid!.universalRules!.length).toBeGreaterThan(0);
    const types = Object.keys(kb.mermaid!.diagramTypes);
    expect(types).toContain("flowchart");
    expect(types).toContain("sequenceDiagram");
  });

  it("Mermaid does not include removed types (graph, pie, mindmap, etc.)", () => {
    const kb = getChartKnowledge();
    const types = Object.keys(kb.mermaid!.diagramTypes);
    expect(types).not.toContain("graph");
    expect(types).not.toContain("pie");
    expect(types).not.toContain("mindmap");
    expect(types).not.toContain("xychart-beta");
    expect(types).not.toContain("sankey-beta");
    expect(types).not.toContain("block-beta");
    expect(types).not.toContain("architecture-beta");
    expect(types).not.toContain("requirementDiagram");
  });

  it("Vega-Lite knowledge only contains boxplot, layer, facet", () => {
    const kb = getChartKnowledge();
    expect(kb.vegaLite!.typeWhitelist).toEqual(["boxplot", "layer", "facet"]);
    const types = kb.vegaLite!.chartTypes.map(c => c.type);
    expect(types).toContain("boxplot");
    expect(types).toContain("layer");
    expect(types).toContain("facet");
    expect(types).not.toContain("bar");
    expect(types).not.toContain("line");
    expect(types).not.toContain("point");
  });

  it("returns same reference on repeated calls (cached)", () => {
    const kb1 = getChartKnowledge();
    const kb2 = getChartKnowledge();
    expect(kb1).toBe(kb2);
  });
});

describe("loadChartKnowledge", () => {
  it("returns same data as getChartKnowledge (async compat)", async () => {
    const sync = getChartKnowledge();
    const async_ = await loadChartKnowledge();
    expect(async_).toBe(sync);
  });
});
