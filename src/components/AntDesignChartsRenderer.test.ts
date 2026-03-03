import { describe, expect, it } from "vitest";
import { sanitizeAdcConfig } from "./AntDesignChartsRenderer";

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
