import { describe, expect, it } from "vitest";
import { parseChartFromText, parseG2SpecFromCode } from "./ChartRenderer";

describe("parseG2SpecFromCode", () => {
  it("parses strict JSON g2 spec", () => {
    const spec = parseG2SpecFromCode(`
{
  "type": "line",
  "data": [{"year": 2024, "value": 1.2}],
  "encode": {"x": "year", "y": "value"}
}
`);

    expect(spec).not.toBeNull();
    expect(spec?.type).toBe("line");
  });

  it("accepts JSON-like g2 with formatter function and trailing commas", () => {
    const spec = parseG2SpecFromCode(`
{
  "type": "view",
  "data": [{"year": 2024, "value": 1.2},],
  "children": [{"type": "line", "encode": {"x": "year", "y": "value"}}],
  "axes": [
    {
      "orient": "right",
      "label": { "formatter": (d) => d + "‰" }
    }
  ]
}
`);

    expect(spec).not.toBeNull();
    expect(spec?.type).toBe("view");
    expect(Array.isArray(spec?.data)).toBe(true);
  });

  it("returns null for truncated spec", () => {
    const spec = parseG2SpecFromCode(`{"type":"line","data":[{"year":2024}]`);
    expect(spec).toBeNull();
  });
});

describe("parseChartFromText", () => {
  it("extracts g2 chart from markdown block using tolerant parser", () => {
    const text = [
      "demo",
      "```g2",
      "{",
      '  "type": "line",',
      '  "data": [{"x": 1, "y": 2},],',
      '  "encode": {"x": "x", "y": "y"}',
      "}",
      "```"
    ].join("\n");

    const chart = parseChartFromText(text);
    expect(chart?.type).toBe("g2");
    expect(chart?.content && typeof chart.content === "object").toBe(true);
  });
});
