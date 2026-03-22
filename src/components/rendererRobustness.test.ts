/**
 * Tests for ECharts, Vega-Lite, Excalidraw, and ReactSandbox robustness improvements.
 */
import { describe, expect, it } from "vitest";
import { parseEChartsSpecFromCode } from "../utils/ecSpecParser";
import { parseVegaLiteSpecFromCode } from "../utils/vegaLiteParser";
import { parseExcalidrawData } from "../utils/excalidrawParser";

// ============================================================
// ECharts Parser Normalization
// ============================================================
describe("ECharts parser normalization", () => {
  it("wraps single series object into array", () => {
    const code = JSON.stringify({
      series: { type: "gauge", data: [{ value: 72.5 }] },
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.spec.series)).toBe(true);
    expect((result.spec.series as unknown[]).length).toBe(1);
    expect(result.warnings).toContain("series was a single object, wrapped in array");
  });

  it("coerces string values in series data objects", () => {
    const code = JSON.stringify({
      series: [{ type: "gauge", data: [{ name: "CPU", value: "$72.5%" }] }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const series = result.spec.series as Record<string, unknown>[];
    const data = series[0].data as Record<string, unknown>[];
    expect(data[0].value).toBe(72.5);
  });

  it("coerces string data items to numbers", () => {
    const code = JSON.stringify({
      xAxis: { type: "category", data: ["A", "B"] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: ["100", "200"] }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const series = result.spec.series as Record<string, unknown>[];
    expect(series[0].data).toEqual([100, 200]);
  });

  it("splits xAxis.data string into array", () => {
    const code = JSON.stringify({
      xAxis: { type: "category", data: "Mon,Tue,Wed,Thu,Fri" },
      yAxis: { type: "value" },
      series: [{ type: "line", data: [1, 2, 3, 4, 5] }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const xAxis = result.spec.xAxis as Record<string, unknown>;
    expect(xAxis.data).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("removes $schema field", () => {
    const code = JSON.stringify({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      series: [{ type: "bar", data: [1, 2, 3] }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.$schema).toBeUndefined();
  });

  it("warns about empty series data", () => {
    const code = JSON.stringify({
      series: [{ type: "line", data: [] }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("empty"))).toBe(true);
  });

  it("converts scatter [x,y,string] tuples to {name,value:[x,y]} objects", () => {
    const code = JSON.stringify({
      xAxis: { type: "value", scale: true },
      yAxis: { type: "value", scale: true },
      series: [{
        type: "scatter",
        symbolSize: 10,
        data: [
          [166.0, 2487, "内蒙古自治区"],
          [21.8, 12601, "广东省"],
        ],
      }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const series = result.spec.series as Record<string, unknown>[];
    const data = series[0].data as Record<string, unknown>[];
    expect(data[0]).toEqual({ name: "内蒙古自治区", value: [166.0, 2487] });
    expect(data[1]).toEqual({ name: "广东省", value: [21.8, 12601] });
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("converted"))).toBe(true);
  });

  it("uses fixed symbolSize=10 when scatter symbolSize function is stripped and 3rd dim is string", () => {
    // Simulate JSON-cleaned spec where symbolSize was a function → null
    const spec = {
      xAxis: { type: "value", scale: true },
      yAxis: { type: "value", scale: true },
      series: [{
        type: "scatter",
        symbolSize: null as unknown,
        data: [
          [166.0, 2487, "内蒙古自治区"],
          [21.8, 12601, "广东省"],
        ],
      }],
    };
    const result = parseEChartsSpecFromCode(JSON.stringify(spec));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const series = result.spec.series as Record<string, unknown>[];
    expect(series[0].symbolSize).toBe(10);
  });

  it("infers radar type for series without type when radar config exists", () => {
    const code = JSON.stringify({
      radar: { indicator: [{ name: "A" }, { name: "B" }] },
      series: [{ name: "Budget", data: [{ value: [100, 80] }] }],
    });
    const result = parseEChartsSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const series = result.spec.series as Record<string, unknown>[];
    expect(series[0].type).toBe("radar");
  });
});

// ============================================================
// Vega-Lite Parser Normalization
// ============================================================
describe("Vega-Lite parser normalization", () => {
  it("wraps bare data array as data.values", () => {
    const code = JSON.stringify({
      mark: "bar",
      data: [{ x: "A", y: 1 }, { x: "B", y: 2 }],
      encoding: {
        x: { field: "x", type: "nominal" },
        y: { field: "y", type: "quantitative" },
      },
    });
    const result = parseVegaLiteSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.spec.data as Record<string, unknown>;
    expect(data.values).toEqual([{ x: "A", y: 1 }, { x: "B", y: 2 }]);
    expect(result.warnings).toContain("data was a bare array, wrapped as data.values");
  });

  it("removes $schema field", () => {
    const code = JSON.stringify({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      mark: "point",
      data: { values: [{ x: 1, y: 2 }] },
      encoding: { x: { field: "x", type: "quantitative" } },
    });
    const result = parseVegaLiteSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.$schema).toBeUndefined();
  });

  it("coerces string quantitative values to numbers", () => {
    const code = JSON.stringify({
      mark: "bar",
      data: { values: [{ cat: "A", val: "100" }, { cat: "B", val: "200" }] },
      encoding: {
        x: { field: "cat", type: "nominal" },
        y: { field: "val", type: "quantitative" },
      },
    });
    const result = parseVegaLiteSpecFromCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.spec.data as Record<string, unknown>;
    const values = data.values as Record<string, unknown>[];
    expect(values[0].val).toBe(100);
    expect(values[1].val).toBe(200);
  });
});

// ============================================================
// Excalidraw Parser Validation
// ============================================================
describe("Excalidraw parser element validation", () => {
  it("validates element types and keeps valid ones", () => {
    const code = JSON.stringify({
      elements: [
        { type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
        { type: "invalid_type", x: 0, y: 0 },
        { type: "ellipse", x: 200, y: 100 },
      ],
    });
    const result = parseExcalidrawData(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.elements.length).toBe(3); // unknown types kept with warning
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("invalid_type"))).toBe(true);
  });

  it("skips elements without type field", () => {
    const code = JSON.stringify({
      elements: [
        { x: 10, y: 20 }, // no type
        { type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
      ],
    });
    const result = parseExcalidrawData(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.elements.length).toBe(1);
  });

  it("provides default x/y/width/height for elements missing them", () => {
    const code = JSON.stringify({
      elements: [{ type: "rectangle" }],
    });
    const result = parseExcalidrawData(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const el = result.data.elements[0] as Record<string, unknown>;
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
    expect(el.width).toBe(100);
    expect(el.height).toBe(100);
  });

  it("does not add width/height defaults for text elements", () => {
    const code = JSON.stringify({
      elements: [{ type: "text", x: 10, y: 20, text: "Hello" }],
    });
    const result = parseExcalidrawData(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const el = result.data.elements[0] as Record<string, unknown>;
    expect(el.width).toBeUndefined();
  });

  it("skips non-object elements", () => {
    const code = JSON.stringify({
      elements: ["invalid", null, 42, { type: "rectangle" }],
    });
    const result = parseExcalidrawData(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.elements.length).toBe(1);
  });
});
