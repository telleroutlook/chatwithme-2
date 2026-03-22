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
  warnings?: string[];
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
  //    NOTE: Vega-Lite specs should not use JS functions (use expr strings instead),
  //    so this cleanup is rare. normalizeVegaLiteSpec() removes null formatters afterwards.
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

  // --- Normalize and auto-fix common AI mistakes ---
  const warnings: string[] = [];
  const normalized = normalizeVegaLiteSpec(spec, warnings);

  return {
    ok: true,
    spec: normalized,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// Vega-Lite spec normalization — auto-fix common AI output mistakes
// ---------------------------------------------------------------------------

function normalizeVegaLiteSpec(
  spec: VegaLiteSpec,
  warnings: string[],
): VegaLiteSpec {
  const result = { ...spec };

  // 1. Remove $schema — renderer provides it
  if (result.$schema) {
    delete result.$schema;
    warnings.push("$schema removed (renderer adds it automatically)");
  }

  // 2. Ensure data.values exists when data is present but values is missing
  if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
    const data = result.data as Record<string, unknown>;
    // If data has url, that's fine (external source)
    // If data has no values and no url, check if it's an array masquerading as object
    if (!data.values && !data.url && !data.name) {
      warnings.push("data object has no values, url, or name field");
    }
  }
  // AI sometimes puts data as a direct array instead of { values: [...] }
  if (Array.isArray(result.data)) {
    result.data = { values: result.data };
    warnings.push("data was a bare array, wrapped as data.values");
  }

  // 3. Normalize mark: AI sometimes outputs { "mark": { "type": "boxplot" } }
  //    where simpler { "mark": "boxplot" } suffices — both are valid but keep as-is

  // 4. Coerce string numbers in data.values
  if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
    const data = result.data as Record<string, unknown>;
    if (Array.isArray(data.values)) {
      const values = data.values as Record<string, unknown>[];
      if (values.length > 0) {
        // Detect encoding fields that should be quantitative
        const quantFields = new Set<string>();
        const encoding = result.encoding as Record<string, Record<string, unknown>> | undefined;
        if (encoding) {
          for (const channel of Object.values(encoding)) {
            if (channel && typeof channel === "object" && channel.type === "quantitative" && typeof channel.field === "string") {
              quantFields.add(channel.field);
            }
          }
        }

        // Coerce quantitative fields from string to number
        if (quantFields.size > 0) {
          data.values = values.map((row) => {
            let changed = false;
            const newRow = { ...row };
            for (const field of quantFields) {
              if (typeof newRow[field] === "string") {
                const cleaned = (newRow[field] as string).replace(/[~%$¥€,\s]/g, "");
                const num = Number(cleaned);
                if (!isNaN(num)) {
                  newRow[field] = num;
                  changed = true;
                }
              }
            }
            return changed ? newRow : row;
          });
        }
      }
    }
  }

  // 5. Remove null formatters caused by function stripping.
  //    Vega-Lite format specs must be strings (e.g. "~s", ".2f") or objects.
  //    A null format breaks axis/tooltip formatting — remove it so Vega-Lite uses defaults.
  const encoding = result.encoding as Record<string, Record<string, unknown>> | undefined;
  if (encoding && typeof encoding === "object") {
    for (const channel of Object.values(encoding)) {
      if (channel && typeof channel === "object") {
        if (channel.format === null) {
          delete channel.format;
          warnings.push("encoding channel format=null (function stripped) removed");
        }
        if (channel.title === null) {
          delete channel.title;
          warnings.push("encoding channel title=null (function stripped) removed");
        }
      }
    }
  }

  return result;
}
