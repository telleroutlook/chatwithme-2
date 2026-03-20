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
  | "EC_PARSE_MISSING_FIELDS"
  | "EC_PARSE_EMPTY_SERIES";

export type EChartsOption = Record<string, unknown>;

export interface EChartsParseResult {
  ok: true;
  spec: EChartsOption;
  warnings?: string[];
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

  // --- Normalize and auto-fix common AI mistakes ---
  const warnings: string[] = [];
  const normalized = normalizeEChartsSpec(spec, warnings);

  // --- Validate series has data ---
  if (Array.isArray(normalized.series)) {
    const series = normalized.series as Record<string, unknown>[];
    const hasEmptySeries = series.length > 0 && series.every((s) => {
      if (!s.data) return true;
      if (Array.isArray(s.data) && s.data.length === 0) return true;
      return false;
    });
    if (hasEmptySeries && !normalized.dataset) {
      warnings.push("All series have empty or missing data arrays");
    }
  }

  return {
    ok: true,
    spec: normalized,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// ECharts spec normalization — auto-fix common AI output mistakes
// ---------------------------------------------------------------------------

function normalizeEChartsSpec(
  spec: EChartsOption,
  warnings: string[],
): EChartsOption {
  const result = { ...spec };

  // 1. Ensure series is an array (AI sometimes outputs a single object)
  if (result.series && !Array.isArray(result.series) && typeof result.series === "object") {
    result.series = [result.series];
    warnings.push("series was a single object, wrapped in array");
  }

  // 2. Ensure each series item has a type field
  if (Array.isArray(result.series)) {
    const series = result.series as Record<string, unknown>[];
    for (const s of series) {
      if (!s.type && typeof s.name === "string") {
        // Try to infer type from spec context
        if (result.radar) {
          s.type = "radar";
        } else if (result.geo) {
          s.type = "map";
        }
      }
    }
  }

  // 3. Fix gauge detail.formatter as string "{value}%" — ECharts accepts this natively
  //    but AI sometimes outputs formatter as a function string — already handled by JSON cleaning

  // 4. Normalize xAxis/yAxis: ensure they're in correct format
  //    AI sometimes outputs xAxis.data as a string instead of array
  if (result.xAxis && typeof result.xAxis === "object" && !Array.isArray(result.xAxis)) {
    const xAxis = result.xAxis as Record<string, unknown>;
    if (typeof xAxis.data === "string") {
      // Attempt to parse comma-separated string as array
      xAxis.data = xAxis.data.split(",").map((s: string) => s.trim());
      warnings.push("xAxis.data was a string, split into array");
    }
  }

  // 5. Remove $schema if AI included it (not used by ECharts)
  delete result.$schema;

  // 6. Fix string numbers in series data
  if (Array.isArray(result.series)) {
    for (const s of result.series as Record<string, unknown>[]) {
      if (Array.isArray(s.data)) {
        s.data = (s.data as unknown[]).map((item) => {
          if (typeof item === "string") {
            const num = Number(item);
            if (!isNaN(num)) return num;
          }
          // For {name, value} objects, coerce value
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const obj = item as Record<string, unknown>;
            if (typeof obj.value === "string") {
              const cleaned = (obj.value as string).replace(/[~%$¥€,\s]/g, "");
              const num = Number(cleaned);
              if (!isNaN(num)) {
                return { ...obj, value: num };
              }
            }
          }
          return item;
        });
      }
    }
  }

  return result;
}
