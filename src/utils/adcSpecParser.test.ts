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
        expect(result.ok).toBe(true);
        expect(result.spec?.type).toBe("line");
        expect(result.spec?.config.data).toEqual([
          { year: "1991", value: 3 },
          { year: "1992", value: 4 },
        ]);
        expect(result.spec?.config.xField).toBe("year");
        expect(result.spec?.config.yField).toBe("value");
      });

      it("should parse a valid flat format column chart", () => {
        const code = `{
  "type": "column",
  "data": [{"category": "A", "value": 10}],
  "xField": "category",
  "yField": "value"
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(true);
        expect(result.spec?.type).toBe("column");
      });

      it("should parse all supported chart types", () => {
        const types = ["line", "column", "bar", "area", "pie", "scatter", "radar", "gauge", "heatmap", "funnel", "histogram", "dualAxes"];
        for (const type of types) {
          const code = `{"type": "${type}", "data": []}`;
          const result = parseAdcSpecFromCode(code);
          expect(result.ok).toBe(true);
          expect(result.spec?.type).toBe(type);
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
        expect(result.ok).toBe(true);
        expect(result.spec?.type).toBe("line");
        expect(result.spec?.config.data).toEqual([{ year: "1991", value: 3 }]);
        expect(result.spec?.config.xField).toBe("year");
      });
    });

    describe("tolerant parsing", () => {
      it("should parse JSON with comments", () => {
        const code = `{
  // This is a line comment
  "type": "line",
  /* This is a 
     block comment */
  "data": []
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(true);
        expect(result.spec?.type).toBe("line");
      });

      it("should parse JSON with trailing commas", () => {
        const code = `{
  "type": "line",
  "data": [],
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(true);
      });

      it("should handle simple function callbacks by filtering them", () => {
        const code = `{
  "type": "line",
  "data": [],
  "formatter": (val) => val + "%",
  "label": {
    "text": function(d) { return d.name; }
  }
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(true);
        expect(result.spec?.config.formatter).toBe("[Filtered Callback]");
        // Nested label.text might not be caught by the simple regex if it's too deep or complex
        // But our regex should handle common patterns.
      });
    });

    describe("error handling", () => {
      it("should return error for invalid JSON that cannot be cleaned", () => {
        const code = `{ "type": "line", "data": [] `; // Missing closing brace
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("ADC_PARSE_INVALID_JSON");
      });

      it("should return error for unknown chart type", () => {
        const code = `{"type": "unknown", "data": []}`;
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("ADC_PARSE_INVALID_TYPE");
      });

      it("should return callback error when unsupported callback syntax remains", () => {
        const code = `{
  "type": "line",
  "data": [],
  "onReady": (chart) => chart.render()
}`;
        const result = parseAdcSpecFromCode(code);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("ADC_PARSE_UNSUPPORTED_CALLBACK");
      });

      it("should return error for empty string", () => {
        expect(parseAdcSpecFromCode("").error).toBe("ADC_PARSE_EMPTY");
      });
    });
  });
});
