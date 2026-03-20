/**
 * Comprehensive chart normalization tests.
 *
 * Tests real-world AI output patterns against the renderer normalization layer
 * to ensure malformed specs are corrected before rendering.
 */
import { describe, expect, it } from "vitest";
import { normalizeConfigForADC2 } from "./AntDesignChartsRenderer";

// ============================================================
// ADC: yField as non-string (object, number, null, undefined)
// ============================================================
describe("ADC: yField type coercion", () => {
  it("fixes yField when AI outputs it as an object { field: field }", () => {
    const result = normalizeConfigForADC2("column", {
      data: [{ event: "A", probability: 1.1 }, { event: "B", probability: 0.5 }],
      xField: "event",
      yField: { probability: "probability" },
    } as Record<string, unknown>, false);
    expect(result.yField).toBe("probability");
  });

  it("fixes yField when AI outputs it as an object with nested key", () => {
    const result = normalizeConfigForADC2("bar", {
      data: [{ name: "A", count: 10 }],
      xField: "count",
      yField: { value: "count" },
    } as Record<string, unknown>, false);
    expect(result.yField).toBe("count");
  });
});

// ============================================================
// ADC: String-to-number coercion for Y values
// ============================================================
describe("ADC: string Y value coercion", () => {
  it("strips ~ and % from values like '~1.1%'", () => {
    const result = normalizeConfigForADC2("column", {
      data: [
        { event: "A", probability: "~1.1%" },
        { event: "B", probability: "~0.5%" },
      ],
      xField: "event",
      yField: "probability",
    }, false);
    const data = result.data as Record<string, unknown>[];
    expect(data[0].probability).toBe(1.1);
    expect(data[1].probability).toBe(0.5);
  });

  it("strips $ and commas from currency values", () => {
    const result = normalizeConfigForADC2("column", {
      data: [
        { item: "A", price: "$1,234" },
        { item: "B", price: "$5,678.90" },
      ],
      xField: "item",
      yField: "price",
    }, false);
    const data = result.data as Record<string, unknown>[];
    expect(data[0].price).toBe(1234);
    expect(data[1].price).toBe(5678.9);
  });

  it("strips ¥ from Chinese currency values", () => {
    const result = normalizeConfigForADC2("bar", {
      data: [{ item: "A", price: "¥100" }],
      xField: "price",
      yField: "item",
    }, false);
    // yField "item" has value "A" which is a string, but not numeric → kept as-is
    const data = result.data as Record<string, unknown>[];
    expect(data[0].item).toBe("A"); // non-numeric strings left untouched
  });

  it("does not coerce when values are already numbers", () => {
    const result = normalizeConfigForADC2("column", {
      data: [{ x: "A", y: 42 }],
      xField: "x",
      yField: "y",
    }, false);
    const data = result.data as Record<string, unknown>[];
    expect(data[0].y).toBe(42);
  });

  it("does not apply coercion to non-numeric chart types (pie)", () => {
    const result = normalizeConfigForADC2("pie", {
      data: [{ category: "A", value: "50%" }],
      angleField: "value",
      colorField: "category",
    }, false);
    const data = result.data as Record<string, unknown>[];
    expect(data[0].value).toBe("50%"); // pie uses angleField, not yField coercion
  });
});

// ============================================================
// ADC: Legacy v1 property migration
// ============================================================
describe("ADC: legacy property migration", () => {
  it("migrates columnStyle → style for column charts", () => {
    const result = normalizeConfigForADC2("column", {
      data: [{ x: "A", y: 10 }],
      xField: "x",
      yField: "y",
      columnStyle: { fill: "#5B8FF9", fillOpacity: 0.7 },
    }, false);
    expect(result.style).toEqual({ fill: "#5B8FF9", fillOpacity: 0.7 });
    expect(result.columnStyle).toBeUndefined();
  });

  it("does not overwrite existing style with columnStyle", () => {
    const result = normalizeConfigForADC2("column", {
      data: [{ x: "A", y: 10 }],
      xField: "x",
      yField: "y",
      style: { radiusTopLeft: 4 },
      columnStyle: { fill: "#5B8FF9" },
    }, false);
    expect(result.style).toEqual({ radiusTopLeft: 4 }); // original style wins
    expect(result.columnStyle).toBeUndefined();
  });

  it("removes geometryOptions (v1 DualAxes)", () => {
    const result = normalizeConfigForADC2("dualAxes", {
      data: [
        { month: "Jan", revenue: 120, growthRate: 0.12 },
        { month: "Feb", revenue: 180, growthRate: 0.18 },
      ],
      xField: "month",
      yField: ["revenue", "growthRate"],
      geometryOptions: [{ geometry: "column" }, { geometry: "line" }],
    }, false);
    expect(result.geometryOptions).toBeUndefined();
  });

  it("migrates seriesField → colorField", () => {
    const result = normalizeConfigForADC2("radar", {
      data: [
        { dim: "Speed", score: 90, product: "A" },
        { dim: "Speed", score: 70, product: "B" },
      ],
      xField: "dim",
      yField: "score",
      seriesField: "product",
    }, false);
    expect(result.colorField).toBe("product");
    expect(result.seriesField).toBeUndefined();
  });
});

// ============================================================
// ADC: DualAxes long→wide pivot
// ============================================================
describe("ADC: DualAxes long-format auto-pivot", () => {
  it("pivots long-format data with 2 groups into dual-axes wide format", () => {
    const result = normalizeConfigForADC2("dualAxes", {
      data: [
        { period: "1-2月", metric: "航次", value: 52 },
        { period: "3月", metric: "航次", value: 20 },
        { period: "1-2月", metric: "旅客", value: 18 },
        { period: "3月", metric: "旅客", value: 6.9 },
      ],
      xField: "period",
      yField: "value",
      colorField: "metric",
      group: true,
    }, false);

    expect(result.yField).toEqual(["航次", "旅客"]);
    const data = result.data as Record<string, unknown>[][];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual([
      { period: "1-2月", "航次": 52, "旅客": 18 },
      { period: "3月", "航次": 20, "旅客": 6.9 },
    ]);
    expect(result.colorField).toBeUndefined();
    expect(result.group).toBeUndefined();
  });

  it("handles standard wide-format dualAxes with yField array", () => {
    const result = normalizeConfigForADC2("dualAxes", {
      data: [
        { month: "Jan", revenue: 120, growthRate: 0.12 },
        { month: "Feb", revenue: 180, growthRate: 0.18 },
      ],
      xField: "month",
      yField: ["revenue", "growthRate"],
    }, false);

    const data = result.data as unknown[][];
    expect(data).toHaveLength(2);
    expect(result.yField).toEqual(["revenue", "growthRate"]);
  });

  it("does not pivot when 3+ groups exist (unsupported)", () => {
    const result = normalizeConfigForADC2("dualAxes", {
      data: [
        { x: "A", metric: "a", value: 1 },
        { x: "A", metric: "b", value: 2 },
        { x: "A", metric: "c", value: 3 },
      ],
      xField: "x",
      yField: "value",
      colorField: "metric",
    }, false);

    // Should NOT pivot — 3 groups don't map to dual axes
    expect(result.yField).toBe("value");
  });
});

// ============================================================
// ADC: Wide-format auto-conversion (existing but retested)
// ============================================================
describe("ADC: wide-format auto-conversion", () => {
  it("converts wide-format radar with multiple numeric keys and missing yField", () => {
    const result = normalizeConfigForADC2("radar", {
      data: [
        { axis: "社会关注度", "原油": 7.5, "港股": 5.0, "英伟达": 9.0 },
        { axis: "经济影响度", "原油": 9.0, "港股": 6.5, "英伟达": 8.5 },
      ],
      xField: "axis",
      yField: "value", // doesn't exist in data
      seriesField: "metric",
      area: { style: { fillOpacity: 0.2 } },
    }, false);

    const data = result.data as Record<string, unknown>[];
    // 2 axes × 3 series = 6 rows
    expect(data).toHaveLength(6);
    expect(result.yField).toBe("_value");
    expect(result.colorField).toBe("_series");
    expect(result.seriesField).toBeUndefined();
  });

  it("converts wide-format column with yField as array", () => {
    const result = normalizeConfigForADC2("column", {
      data: [
        { category: "A", "美国": 100, "中国": 50 },
        { category: "B", "美国": 200, "中国": 80 },
      ],
      xField: "category",
      yField: ["美国", "中国"],
    }, false);

    const data = result.data as Record<string, unknown>[];
    expect(data).toHaveLength(4);
    expect(result.yField).toBe("_value");
    expect(result.colorField).toBe("_series");
    expect(result.group).toBe(true);
  });
});

// ============================================================
// ADC: Combined issues (yField object + string values)
// ============================================================
describe("ADC: combined malformed spec handling", () => {
  it("fixes yField object AND coerces string values in one pass", () => {
    const result = normalizeConfigForADC2("column", {
      data: [
        { event: "春分", month: 3, probability: "~1.1%" },
        { event: "龙抬头", month: 2, probability: "~0.5%" },
      ],
      xField: "event",
      yField: { probability: "probability" },
    } as Record<string, unknown>, false);

    expect(result.yField).toBe("probability");
    const data = result.data as Record<string, unknown>[];
    expect(data[0].probability).toBe(1.1);
    expect(data[1].probability).toBe(0.5);
  });
});
