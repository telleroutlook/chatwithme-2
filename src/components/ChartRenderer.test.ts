import { describe, expect, it } from "vitest";
import { parseG2SpecFromCode } from "../utils/g2SpecParser";

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

