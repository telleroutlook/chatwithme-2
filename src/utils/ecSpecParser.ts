/**
 * ECharts Spec Parser
 * Parses ECharts option JSON from ```echarts code block content.
 *
 * Tolerant parsing:
 * - Handles trailing commas
 * - Strips comments (// and /* *‌/)
 * - Converts single-quoted keys/values to double quotes (best-effort)
 *
 * Validation:
 * - Must have at least one of: series, xAxis, yAxis, geo, radar, graphic
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EChartsParseErrorCode =
  | "EC_PARSE_EMPTY"
  | "EC_PARSE_INVALID_JSON"
  | "EC_PARSE_MISSING_FIELDS";

export type EChartsOption = Record<string, unknown>;

export interface EChartsParseResult {
  ok: true;
  spec: EChartsOption;
}

export interface EChartsParseError {
  ok: false;
  error: string;
  errorCode: EChartsParseErrorCode;
}

export type EChartsParseOutcome = EChartsParseResult | EChartsParseError;

// ---------------------------------------------------------------------------
// Required top-level fields — at least one must be present
// ---------------------------------------------------------------------------

const VALID_TOP_LEVEL_FIELDS: ReadonlySet<string> = new Set([
  "series",
  "xAxis",
  "yAxis",
  "geo",
  "radar",
  "graphic",
]);

// ---------------------------------------------------------------------------
// Tolerant JSON cleaning
// ---------------------------------------------------------------------------

function cleanJsonForECharts(raw: string): string {
  let cleaned = raw;

  // 1. Remove line comments (// ...)
  cleaned = cleaned.replace(/\/\/.*/g, "");

  // 2. Remove block comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");

  // 3. Replace single-quoted strings with double-quoted strings (best-effort).
  //    This handles simple cases like { 'key': 'value' }.
  //    We avoid replacing apostrophes inside double-quoted strings.
  cleaned = cleaned.replace(
    /(?<=[\[{,:\s])'/g,
    '"',
  );
  cleaned = cleaned.replace(
    /'(?=[,}\]:\s])/g,
    '"',
  );

  // 4. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  // 5. Remove function-like values (function(){...} or () => ...)
  //    Replace with null so the JSON structure stays valid.
  cleaned = cleaned.replace(
    /:\s*(function\s*\([^)]*\)\s*\{[^}]*\}|\([^)]*\)\s*=>[^,}\]]*|[a-zA-Z_$]\w*\s*=>[^,}\]]*)/g,
    ": null",
  );

  return cleaned.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an ECharts option JSON from a code block string.
 *
 * @param code - Raw content of an ```echarts code block
 * @returns Discriminated union: `{ ok: true; spec }` or `{ ok: false; error; errorCode }`
 */
export function parseEChartsSpecFromCode(code: string): EChartsParseOutcome {
  if (!code || typeof code !== "string") {
    return { ok: false, error: "Empty ECharts spec", errorCode: "EC_PARSE_EMPTY" };
  }

  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty ECharts spec", errorCode: "EC_PARSE_EMPTY" };
  }

  // --- Attempt strict JSON parse first ---
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // --- Fall back to tolerant parse ---
    try {
      const cleaned = cleanJsonForECharts(trimmed);
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: "Invalid JSON in ECharts spec",
        errorCode: "EC_PARSE_INVALID_JSON",
      };
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "ECharts spec must be a JSON object",
      errorCode: "EC_PARSE_INVALID_JSON",
    };
  }

  const spec = parsed as EChartsOption;

  // --- Validate required fields ---
  const hasRequiredField = Object.keys(spec).some((key) =>
    VALID_TOP_LEVEL_FIELDS.has(key),
  );

  if (!hasRequiredField) {
    return {
      ok: false,
      error: `ECharts spec must contain at least one of: ${[...VALID_TOP_LEVEL_FIELDS].join(", ")}`,
      errorCode: "EC_PARSE_MISSING_FIELDS",
    };
  }

  return { ok: true, spec };
}
