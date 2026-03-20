import { describe, expect, it } from "vitest";
import { normalizeConfigForADC2, sanitizeAdcConfig } from "./AntDesignChartsRenderer";

describe("sanitizeAdcConfig", () => {
  it("removes label.position to avoid ADC runtime errors", () => {
    const input = {
      data: [{ category: "A", value: 1 }],
      xField: "category",
      yField: "value",
      label: {
        position: "middle",
        text: "value",
        style: { fill: "#fff" },
      },
    };

    const result = sanitizeAdcConfig(input);

    expect(result.removedFields).toContain("label.position");
    expect(result.config.label).toEqual({
      text: "value",
      style: { fill: "#fff" },
    });
  });

  it("keeps config intact when label.position is absent", () => {
    const input = {
      data: [{ year: "2024", value: 10 }],
      xField: "year",
      yField: "value",
      label: {
        text: "value",
      },
    };

    const result = sanitizeAdcConfig(input);

    expect(result.removedFields).toHaveLength(0);
    expect(result.config).toEqual(input);
  });
});

describe("normalizeConfigForADC2", () => {
  it("normalizes flat dualAxes data into two datasets and preserves geometry options", () => {
    const input = {
      data: [
        { country: "美国", gdp: 27.4, population: 339 },
        { country: "中国", gdp: 18.5, population: 1424 },
      ],
      xField: "country",
      yField: ["gdp", "population"],
      geometryOptions: [{ geometry: "column" }, { geometry: "line" }],
      meta: {
        gdp: { alias: "GDP（万亿美元）" },
        population: { alias: "人口（百万）" },
      },
    };

    const result = normalizeConfigForADC2("dualAxes", input, false);

    expect(Array.isArray(result.data)).toBe(true);
    const normalizedData = result.data as unknown[];
    expect(normalizedData).toHaveLength(2);
    expect(normalizedData[0]).toEqual(input.data);
    expect(normalizedData[1]).toEqual(input.data);
    expect(result.geometryOptions).toEqual(input.geometryOptions);
    expect(result.meta).toEqual(input.meta);
  });

  it("keeps non-dualAxes custom config fields", () => {
    const input = {
      data: [
        { year: "2021", value: 120 },
        { year: "2022", value: 132 },
      ],
      xField: "year",
      yField: "value",
      smooth: true,
      point: { size: 4, shape: "circle" },
      tooltip: { title: "year" },
    };

    const result = normalizeConfigForADC2("line", input, false);

    expect(result.smooth).toBe(true);
    expect(result.point).toEqual({ size: 4, shape: "circle" });
    expect(result.tooltip).toEqual({ title: "year" });
  });

  it("injects themed xAxis/yAxis config for heatmap charts", () => {
    const input = {
      data: [{ scenario: "A", robotType: "X", value: 80 }],
      xField: "scenario",
      yField: "robotType",
      colorField: "value",
    };

    const result = normalizeConfigForADC2("heatmap", input, false);
    const xAxis = result.xAxis as Record<string, unknown>;
    const yAxis = result.yAxis as Record<string, unknown>;
    const xLabel = xAxis.label as Record<string, unknown>;
    const xLabelStyle = xLabel.style as Record<string, unknown>;
    const yLabel = yAxis.label as Record<string, unknown>;
    const yLabelStyle = yLabel.style as Record<string, unknown>;

    expect(xLabelStyle.fill).toBe("#374151");
    expect(yLabelStyle.fill).toBe("#374151");
  });

  it("preserves user axis style while applying theme colors", () => {
    const input = {
      data: [{ year: "2024", value: 10 }],
      xField: "year",
      yField: "value",
      xAxis: {
        label: {
          style: {
            fontSize: 15,
          },
        },
      },
    };

    const result = normalizeConfigForADC2("line", input, true);
    const xAxis = result.xAxis as Record<string, unknown>;
    const label = xAxis.label as Record<string, unknown>;
    const style = label.style as Record<string, unknown>;

    expect(style.fontSize).toBe(15);
    expect(style.fill).toBe("#e5e7eb");
  });

  it("converts wide-format data with yField array to long format for column charts", () => {
    const input = {
      data: [
        { category: "核弹头", "美国": 5244, "中国": 500 },
        { category: "军机", "美国": 13200, "中国": 3300 },
      ],
      xField: "category",
      yField: ["美国", "中国"],
    };

    const result = normalizeConfigForADC2("column", input, false);
    const data = result.data as Record<string, unknown>[];

    // Should be pivoted to long format: 2 categories × 2 series = 4 rows
    expect(data).toHaveLength(4);
    expect(data[0]).toEqual({ category: "核弹头", _value: 5244, _series: "美国" });
    expect(data[1]).toEqual({ category: "核弹头", _value: 500, _series: "中国" });
    expect(result.yField).toBe("_value");
    expect(result.colorField).toBe("_series");
    expect(result.group).toBe(true);
  });

  it("converts wide-format radar data with missing yField value to long format", () => {
    const input = {
      data: [
        { item: "航母", "美国": 10, "中国": 2.5 },
        { item: "潜艇", "美国": 65, "中国": 60 },
      ],
      xField: "item",
      yField: "value", // doesn't exist in data
      seriesField: "type", // legacy v1 field
    };

    const result = normalizeConfigForADC2("radar", input, false);
    const data = result.data as Record<string, unknown>[];

    // Should pivot: 2 items × 2 series = 4 rows
    expect(data).toHaveLength(4);
    expect(data[0]).toEqual({ item: "航母", _value: 10, _series: "美国" });
    expect(result.yField).toBe("_value");
    expect(result.colorField).toBe("_series");
    // seriesField should be removed
    expect(result.seriesField).toBeUndefined();
  });

  it("migrates legacy seriesField to colorField for properly formatted data", () => {
    const input = {
      data: [
        { dim: "Speed", score: 90, product: "A" },
        { dim: "Speed", score: 70, product: "B" },
      ],
      xField: "dim",
      yField: "score",
      seriesField: "product",
    };

    const result = normalizeConfigForADC2("radar", input, false);

    expect(result.colorField).toBe("product");
    expect(result.seriesField).toBeUndefined();
  });

  it("does not convert long-format data that is already correct", () => {
    const input = {
      data: [
        { quarter: "Q1", revenue: 120, department: "Sales" },
        { quarter: "Q1", revenue: 90, department: "Marketing" },
      ],
      xField: "quarter",
      yField: "revenue",
      colorField: "department",
      group: true,
    };

    const result = normalizeConfigForADC2("column", input, false);
    const data = result.data as Record<string, unknown>[];

    // Should remain unchanged — already long format
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual(input.data[0]);
    expect(result.yField).toBe("revenue");
    expect(result.colorField).toBe("department");
  });
});
