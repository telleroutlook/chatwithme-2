import { describe, it, expect } from "vitest";
import { parseAdcSpecFromCode, isParsedAdcSpec, ADC_CHART_TYPES } from "./adcSpecParser";

describe("adcSpecParser", () => {
  describe("parseAdcSpecFromCode", () => {
    describe("flat format", () => {
      it("should parse a valid flat format line chart", () => {
        const code = `{
  "type": "line",
  "data": [{"year": "1991", "value": 3}, {"year": "1992", "value": 4}],
  "xField": "year",
  "yField": "value"
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("line");
        expect(result?.config.data).toEqual([
          { year: "1991", value: 3 },
          { year: "1992", value: 4 },
        ]);
        expect(result?.config.xField).toBe("year");
        expect(result?.config.yField).toBe("value");
      });

      it("should parse a valid flat format column chart", () => {
        const code = `{
  "type": "column",
  "data": [{"category": "A", "value": 10}],
  "xField": "category",
  "yField": "value"
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("column");
      });

      it("should parse all supported chart types", () => {
        const types = ["line", "column", "bar", "area", "pie", "scatter", "radar", "gauge", "heatmap", "funnel", "histogram", "dualAxes"];
        for (const type of types) {
          const code = `{"type": "${type}", "data": []}`;
          const result = parseAdcSpecFromCode(code);
          expect(result).not.toBeNull();
          expect(result?.type).toBe(type);
        }
      });
    });

    describe("wrapped format", () => {
      it("should parse a valid wrapped format", () => {
        const code = `{
  "type": "line",
  "config": {
    "data": [{"year": "1991", "value": 3}],
    "xField": "year",
    "yField": "value"
  }
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("line");
        expect(result?.config.data).toEqual([{ year: "1991", value: 3 }]);
        expect(result?.config.xField).toBe("year");
      });

      it("should parse dualAxes wrapped format", () => {
        const code = `{
  "type": "dualAxes",
  "config": {
    "data": [
      [{"time": "2024-01", "value": 30}],
      [{"time": "2024-01", "count": 12}]
    ],
    "xField": "time",
    "yField": ["value", "count"]
  }
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result).not.toBeNull();
        expect(result?.type).toBe("dualAxes");
        expect(Array.isArray(result?.config.data)).toBe(true);
      });
    });

    describe("error handling", () => {
      it("should return null for invalid JSON", () => {
        const code = `{ "type": "line", "data": [] `; // Missing closing brace
        expect(parseAdcSpecFromCode(code)).toBeNull();
      });

      it("should return null for JSON with comments (not strict JSON)", () => {
        const code = `{
  // This is a comment
  "type": "line",
  "data": []
}`;
        expect(parseAdcSpecFromCode(code)).toBeNull();
      });

      it("should return null for JSON with trailing commas", () => {
        const code = `{
  "type": "line",
  "data": [],
}`;
        expect(parseAdcSpecFromCode(code)).toBeNull();
      });

      it("should return null for unknown chart type", () => {
        const code = `{"type": "unknown", "data": []}`;
        expect(parseAdcSpecFromCode(code)).toBeNull();
      });

      it("should return null for missing type", () => {
        const code = `{"data": []}`;
        expect(parseAdcSpecFromCode(code)).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(parseAdcSpecFromCode("")).toBeNull();
        expect(parseAdcSpecFromCode("   ")).toBeNull();
      });

      it("should return null for non-object JSON", () => {
        expect(parseAdcSpecFromCode("null")).toBeNull();
        expect(parseAdcSpecFromCode("[]")).toBeNull();
        expect(parseAdcSpecFromCode('"string"')).toBeNull();
        expect(parseAdcSpecFromCode("123")).toBeNull();
      });
    });
  });

  describe("isParsedAdcSpec", () => {
    it("should return true for valid ParsedAdcSpec", () => {
      const spec = { type: "line" as const, config: { data: [] } };
      expect(isParsedAdcSpec(spec)).toBe(true);
    });

    it("should return false for invalid types", () => {
      expect(isParsedAdcSpec(null)).toBe(false);
      expect(isParsedAdcSpec(undefined)).toBe(false);
      expect(isParsedAdcSpec({})).toBe(false);
      expect(isParsedAdcSpec({ type: "invalid" })).toBe(false);
      expect(isParsedAdcSpec({ type: "line" })).toBe(false); // Missing config
    });
  });

  describe("ADC_CHART_TYPES", () => {
    it("should contain all expected chart types", () => {
      expect(ADC_CHART_TYPES).toContain("line");
      expect(ADC_CHART_TYPES).toContain("column");
      expect(ADC_CHART_TYPES).toContain("bar");
      expect(ADC_CHART_TYPES).toContain("area");
      expect(ADC_CHART_TYPES).toContain("pie");
      expect(ADC_CHART_TYPES).toContain("scatter");
      expect(ADC_CHART_TYPES).toContain("radar");
      expect(ADC_CHART_TYPES).toContain("gauge");
      expect(ADC_CHART_TYPES).toContain("heatmap");
      expect(ADC_CHART_TYPES).toContain("funnel");
      expect(ADC_CHART_TYPES).toContain("histogram");
      expect(ADC_CHART_TYPES).toContain("dualAxes");
    });
  });
});
