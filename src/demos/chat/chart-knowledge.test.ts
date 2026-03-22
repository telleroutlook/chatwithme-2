import { describe, it, expect } from "vitest";
import { getChartKnowledge, loadChartKnowledge } from "./chart-knowledge";

describe("getChartKnowledge", () => {
  it("returns a non-null ChartKnowledge object", () => {
    const kb = getChartKnowledge();
    expect(kb).toBeDefined();
    expect(kb.mermaid).toBeDefined();
    expect(kb.echarts).toBeDefined();
    expect(kb.vegaLite).toBeDefined();
  });

  it("ECharts knowledge has chart types and output contract", () => {
    const kb = getChartKnowledge();
    expect(kb.echarts!.outputContract.length).toBeGreaterThan(0);
    expect(kb.echarts!.chartTypes.length).toBeGreaterThan(0);
    expect(kb.echarts!.typeWhitelist).toContain("gauge");
  });

  it("ECharts includes all common chart types (line, bar, pie, etc.)", () => {
    const kb = getChartKnowledge();
    const types = kb.echarts!.chartTypes.map(c => c.type);
    expect(types).toContain("line");
    expect(types).toContain("bar");
    expect(types).toContain("column");
    expect(types).toContain("area");
    expect(types).toContain("pie");
    expect(types).toContain("rose");
    expect(types).toContain("scatter");
    expect(types).toContain("radar");
    expect(types).toContain("heatmap");
    expect(types).toContain("funnel");
    expect(types).toContain("histogram");
    expect(types).toContain("dualAxes");
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
