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
  //    NOTE: normalizeEChartsSpec() recovers known fields that must not be null
  //    (e.g. symbolSize for scatter) by applying sensible defaults afterwards.
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

  // 6. Recover fields that become null when AI outputs a JS function — these are
  //    fields where null is invalid and a sensible default can be inferred.
  if (Array.isArray(result.series)) {
    for (const s of result.series as Record<string, unknown>[]) {
      const seriesType = typeof s.type === "string" ? s.type : "";

      // symbolSize: used by scatter / scatter3D / tree / graph.
      // When null (function stripped), fall back to a fixed integer.
      // For scatter with a 3-element data tuple [x, y, size], derive from data.
      if (s.symbolSize === null) {
        if (seriesType === "scatter" || seriesType === "scatter3D") {
          // Check if data items are [x, y, size] triples; if so scale from 3rd element
          const rawData = Array.isArray(s.data) ? s.data as unknown[] : [];
          // Support two data formats:
          // - Tuple: [x, y, size]
          // - Object: { name, value: [x, y, size] }
          const hasThirdDim = rawData.length > 0 && (() => {
            const first = rawData[0];
            if (Array.isArray(first)) return (first as unknown[]).length >= 3;
            if (first && typeof first === "object") {
              const v = (first as Record<string, unknown>).value;
              return Array.isArray(v) && (v as unknown[]).length >= 3;
            }
            return false;
          })();

          if (hasThirdDim) {
            // Compute a sensible scale factor from the third dimension values
            const extractSize = (d: unknown): number => {
              if (Array.isArray(d) && (d as unknown[]).length >= 3) {
                const v = (d as unknown[])[2];
                return typeof v === "number" ? v : 0;
              }
              if (d && typeof d === "object") {
                const val = (d as Record<string, unknown>).value;
                if (Array.isArray(val) && (val as unknown[]).length >= 3) {
                  const v = (val as unknown[])[2];
                  return typeof v === "number" ? v : 0;
                }
              }
              return 0;
            };
            const sizes = rawData.map(extractSize);
            const hasNumericSizes = sizes.some((v) => v > 0);
            if (hasNumericSizes) {
              const maxSize = Math.max(...sizes, 1);
              // Target max bubble diameter ~50px; min 6px
              const scale = 50 / Math.sqrt(maxSize);
              s.symbolSize = sizes.map((v) => Math.max(6, Math.round(Math.sqrt(v) * scale)));
              warnings.push("symbolSize function stripped; auto-computed from data third dimension");
            } else {
              // 3rd element is a string label, not a size — use fixed size
              s.symbolSize = 10;
              warnings.push("symbolSize function stripped; defaulted to 10 (3rd data dim is string label)");
            }
          } else {
            s.symbolSize = 10;
            warnings.push("symbolSize function stripped; defaulted to 10");
          }
        } else if (seriesType === "tree" || seriesType === "graph") {
          s.symbolSize = 8;
          warnings.push(`${seriesType} symbolSize function stripped; defaulted to 8`);
        } else {
          // Generic: remove null so ECharts uses its built-in default
          delete s.symbolSize;
          warnings.push("symbolSize function stripped; removed (ECharts default will apply)");
        }
      }

      // label.formatter: null is fine — ECharts shows default label. Remove to avoid confusion.
      if (s.label && typeof s.label === "object") {
        const label = s.label as Record<string, unknown>;
        if (label.formatter === null) {
          delete label.formatter;
          warnings.push("label.formatter function stripped; removed (ECharts default applies)");
        }
      }

      // tooltip.formatter inside series: same as above
      if (s.tooltip && typeof s.tooltip === "object") {
        const tt = s.tooltip as Record<string, unknown>;
        if (tt.formatter === null) {
          delete tt.formatter;
          warnings.push("series tooltip.formatter function stripped; removed");
        }
      }
    }
  }

  // Recover top-level tooltip.formatter if stripped to null
  if (result.tooltip && typeof result.tooltip === "object" && !Array.isArray(result.tooltip)) {
    const tt = result.tooltip as Record<string, unknown>;
    if (tt.formatter === null) {
      delete tt.formatter;
      warnings.push("tooltip.formatter function stripped; removed (ECharts default applies)");
    }
  }

  // 6b. Fix visualMap: auto-set type:"piecewise" when categories is present but type is missing.
  //     Without this, ECharts defaults to "continuous" which ignores string categories → invisible dots.
  if (result.visualMap && typeof result.visualMap === "object" && !Array.isArray(result.visualMap)) {
    const vm = result.visualMap as Record<string, unknown>;
    if (Array.isArray(vm.categories) && !vm.type) {
      vm.type = "piecewise";
      warnings.push("visualMap.type set to 'piecewise' (categories present but type was missing)");
    }
  }

  // 7. Fix string numbers in series data; auto-upgrade scatter [x,y,name] tuples
  if (Array.isArray(result.series)) {
    for (const s of result.series as Record<string, unknown>[]) {
      const seriesType7 = typeof s.type === "string" ? s.type : "";

      // 7a. Scatter-specific: convert tuple data to {name, value:[...]} objects
      //     so that ECharts labels and tooltips can access the name via {b}.
      //
      //     Handles two tuple shapes:
      //     - [x, y, "name"]           → {name, value:[x,y]}
      //     - [x, y, "name", category] → {name, value:[x,y,category]}
      //       and adjusts visualMap.dimension from 3 → 2 when applicable.
      if ((seriesType7 === "scatter" || seriesType7 === "scatter3D") && Array.isArray(s.data)) {
        const firstItem = (s.data as unknown[])[0];
        const isTupleWithStringLabel =
          Array.isArray(firstItem) &&
          (firstItem as unknown[]).length >= 3 &&
          typeof (firstItem as unknown[])[2] === "string";

        if (isTupleWithStringLabel) {
          const hasCategory =
            (firstItem as unknown[]).length >= 4 &&
            typeof (firstItem as unknown[])[3] === "string";

          s.data = (s.data as unknown[]).map((item) => {
            if (Array.isArray(item) && (item as unknown[]).length >= 2) {
              const arr = item as unknown[];
              const name = typeof arr[2] === "string" ? (arr[2] as string) : "";
              if (hasCategory) {
                // Preserve category at value[2] for visualMap.dimension:2
                const cat = typeof arr[3] === "string" ? arr[3] : arr[3];
                return { name, value: [arr[0], arr[1], cat] };
              }
              return { name, value: [arr[0], arr[1]] };
            }
            return item;
          });

          if (hasCategory) {
            // visualMap.dimension was 3 (4th tuple element); after conversion it's value[2]
            const vm = result.visualMap;
            if (vm && typeof vm === "object" && !Array.isArray(vm)) {
              const vmObj = vm as Record<string, unknown>;
              if (vmObj.dimension === 3) {
                vmObj.dimension = 2;
                warnings.push("visualMap.dimension adjusted 3→2 after scatter tuple conversion");
              }
            }
            warnings.push("scatter data converted from [x,y,name,category] tuples to {name,value:[x,y,category]} objects");
          } else {
            warnings.push("scatter data converted from [x,y,name] tuples to {name,value:[x,y]} objects");
          }
        }
      }

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
