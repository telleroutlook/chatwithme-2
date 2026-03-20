/**
 * Vega-Lite Spec Parser
 * Parses Vega-Lite JSON spec from ```vega-lite code block content.
 *
 * Tolerant parsing:
 * - Handles trailing commas
 * - Strips comments (// and /* *‌/)
 * - Converts single-quoted keys/values to double quotes (best-effort)
 *
 * Validation:
 * - Must have at least one of: mark, layer, hconcat, vconcat, concat
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VegaLiteParseErrorCode =
  | "VL_PARSE_EMPTY"
  | "VL_PARSE_INVALID_JSON"
  | "VL_PARSE_MISSING_FIELDS";

export type VegaLiteSpec = Record<string, unknown>;

export interface VegaLiteParseResult {
  ok: true;
  spec: VegaLiteSpec;
}

export interface VegaLiteParseError {
  ok: false;
  error: string;
  errorCode: VegaLiteParseErrorCode;
}

export type VegaLiteParseOutcome = VegaLiteParseResult | VegaLiteParseError;

// ---------------------------------------------------------------------------
// Required top-level fields -- at least one must be present
// ---------------------------------------------------------------------------

const VALID_TOP_LEVEL_FIELDS: ReadonlySet<string> = new Set([
  "mark",
  "layer",
  "hconcat",
  "vconcat",
  "concat",
]);

// ---------------------------------------------------------------------------
// Tolerant JSON cleaning
// ---------------------------------------------------------------------------

function cleanJsonForVegaLite(raw: string): string {
  let cleaned = raw;

  // 1. Remove line comments (// ...)
  cleaned = cleaned.replace(/\/\/.*/g, "");

  // 2. Remove block comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");

  // 3. Replace single-quoted strings with double-quoted strings (best-effort).
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

  // 5. Remove function-like values — replace with null
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
 * Parse a Vega-Lite spec JSON from a code block string.
 *
 * @param code - Raw content of a ```vega-lite code block
 * @returns Discriminated union: `{ ok: true; spec }` or `{ ok: false; error; errorCode }`
 */
export function parseVegaLiteSpecFromCode(code: string): VegaLiteParseOutcome {
  if (!code || typeof code !== "string") {
    return { ok: false, error: "Empty Vega-Lite spec", errorCode: "VL_PARSE_EMPTY" };
  }

  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty Vega-Lite spec", errorCode: "VL_PARSE_EMPTY" };
  }

  // --- Attempt strict JSON parse first ---
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // --- Fall back to tolerant parse ---
    try {
      const cleaned = cleanJsonForVegaLite(trimmed);
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: "Invalid JSON in Vega-Lite spec",
        errorCode: "VL_PARSE_INVALID_JSON",
      };
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "Vega-Lite spec must be a JSON object",
      errorCode: "VL_PARSE_INVALID_JSON",
    };
  }

  const spec = parsed as VegaLiteSpec;

  // --- Validate required fields ---
  const hasRequiredField = Object.keys(spec).some((key) =>
    VALID_TOP_LEVEL_FIELDS.has(key),
  );

  if (!hasRequiredField) {
    return {
      ok: false,
      error: `Vega-Lite spec must contain at least one of: ${[...VALID_TOP_LEVEL_FIELDS].join(", ")}`,
      errorCode: "VL_PARSE_MISSING_FIELDS",
    };
  }

  return { ok: true, spec };
}
