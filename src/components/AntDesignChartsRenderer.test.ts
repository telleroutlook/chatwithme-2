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
});
