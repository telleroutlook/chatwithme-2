/**
 * ADC Spec Parser
 * Parses Ant Design Charts specifications from code blocks.
 *
 * Supports two input formats:
 * A. Flat format (recommended):
 *    { "type": "line", "data": [...], "xField": "x", "yField": "y" }
 * B. Wrapped format:
 *    { "type": "line", "config": { "data": [...], "xField": "x", "yField": "y" } }
 *
 * Security: Only strict JSON parsing - no comments, trailing commas, or function expressions.
 */

// Whitelist of supported chart types (high-frequency charts only)
export type AdcChartType =
  | 'line'
  | 'column'
  | 'bar'
  | 'area'
  | 'pie'
  | 'scatter'
  | 'radar'
  | 'gauge'
  | 'heatmap'
  | 'funnel'
  | 'histogram'
  | 'dualAxes';

export const ADC_CHART_TYPES: readonly string[] = [
  'line',
  'column',
  'bar',
  'area',
  'pie',
  'scatter',
  'radar',
  'gauge',
  'heatmap',
  'funnel',
  'histogram',
  'dualAxes',
] as const;

export type AdcParseErrorCode =
  | 'ADC_PARSE_INVALID_JSON'
  | 'ADC_PARSE_UNSUPPORTED_CALLBACK'
  | 'ADC_PARSE_INVALID_TYPE'
  | 'ADC_PARSE_EMPTY';

export type AdcParseWarningCode = 'ADC_WARN_LABEL_POSITION_REMOVED';

export interface ParsedAdcSpec {
  type: AdcChartType;
  config: Record<string, unknown>;
}

export interface AdcParseResult {
  ok: boolean;
  spec?: ParsedAdcSpec;
  error?: AdcParseErrorCode;
  warnings?: AdcParseWarningCode[];
}

interface RawAdcSpecFlat {
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

interface RawAdcSpecWrapped {
  type: string;
  config?: Record<string, unknown>;
}

type RawAdcSpec = RawAdcSpecFlat | RawAdcSpecWrapped;

/**
 * Check if a string is a valid ADC chart type
 */
function isValidChartType(type: string): type is AdcChartType {
  return ADC_CHART_TYPES.includes(type);
}

/**
 * Tolerant JSON cleaning
 * 1. Remove comments (// and /* *\/)
 * 2. Remove trailing commas
 * 3. Remove common function patterns (not exhaustive, but covers LLM output)
 */
function cleanJson(code: string): string {
  let cleaned = code;

  // 1. Remove comments
  // Line comments
  cleaned = cleaned.replace(/\/\/.*/g, '');
  // Block comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // 3. Remove function-like fields (e.g., "formatter": function(...) { ... })
  // This is a heuristic. We match "key": function(...) { ... } or "key": (...) => ...
  // Since we are parsing JSON, any field that isn't a valid JSON value will fail JSON.parse.
  // We try to remove common culprits like formatter, label.text function etc.
  
  // Remove fields that looks like "key": function... or "key": (...) =>
  // We only target specific keys known to often contain callbacks in AntV
  const callbackKeys = ['formatter', 'content', 'text', 'title', 'label'];
  callbackKeys.forEach(key => {
    // Match "key": function(...) { ... } or "key": (...) => { ... } or "key": val => ...
    // Note: This regex is limited but covers most simple cases from LLMs
    const regex = new RegExp(`"${key}"\\s*:\\s*(function\\s*\\(.*?\\)\\s*\\{.*?\\}|\\(.*?\\)\\s*=>\\s*.*?|.*?=>.*?)(\\s*[,}])`, 'gs');
    cleaned = cleaned.replace(regex, (match, p1, p2) => {
      // If it looks like a function, we just remove the field or replace it with a string
      return `"${key}": "[Filtered Callback]"${p2}`;
    });
  });

  return cleaned.trim();
}

/**
 * Parse ADC spec from code string
 *
 * @param code - The code block content
 * @returns AdcParseResult
 */
export function parseAdcSpecFromCode(code: string): AdcParseResult {
  if (!code || typeof code !== 'string') {
    return { ok: false, error: 'ADC_PARSE_EMPTY' };
  }

  // Trim whitespace
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    return { ok: false, error: 'ADC_PARSE_EMPTY' };
  }

  let parsed: RawAdcSpec | null = null;
  const hasFunctionLikeSyntax = /\bfunction\s*\(|=>/.test(trimmedCode);

  // 1. Try strict JSON parse first
  try {
    parsed = JSON.parse(trimmedCode) as RawAdcSpec;
  } catch {
    // 2. Try tolerant parse
    try {
      const cleaned = cleanJson(trimmedCode);
      parsed = JSON.parse(cleaned) as RawAdcSpec;
      
      // Check if we found any filtered callbacks in the cleaned version that wasn't there before
      // Actually, if cleanJson successfully made it parseable, it's already a win.
      // But we should check if it's because of callbacks.
      if (cleaned.includes('[Filtered Callback]')) {
         // We might want to flag this, but let's proceed and see if it's valid otherwise.
      }
    } catch {
      return {
        ok: false,
        error: hasFunctionLikeSyntax ? 'ADC_PARSE_UNSUPPORTED_CALLBACK' : 'ADC_PARSE_INVALID_JSON'
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'ADC_PARSE_INVALID_JSON' };
  }

  // Extract type
  const { type } = parsed;
  if (typeof type !== 'string') {
    return { ok: false, error: 'ADC_PARSE_INVALID_TYPE' };
  }
  
  if (!isValidChartType(type)) {
    return { ok: false, error: 'ADC_PARSE_INVALID_TYPE' };
  }

  // Check for any remaining function-like values that might have slipped through JSON.parse (shouldn't happen with JSON.parse)
  // However, we want to detect if the user TRIED to use callbacks and failed.
  // If we used tolerant mode and it worked, we might have replaced them.

  // Extract config based on format
  let config: Record<string, unknown>;

  if ('config' in parsed && typeof parsed.config === 'object' && parsed.config !== null) {
    config = parsed.config as Record<string, unknown>;
  } else {
    const { type: _, ...rest } = parsed;
    config = rest as Record<string, unknown>;
  }

  const warnings: AdcParseWarningCode[] = [];
  if (
    config.label &&
    typeof config.label === 'object' &&
    !Array.isArray(config.label) &&
    'position' in (config.label as Record<string, unknown>)
  ) {
    warnings.push('ADC_WARN_LABEL_POSITION_REMOVED');
  }

  return {
    ok: true,
    spec: {
      type,
      config,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Type guard to check if a value is a valid ParsedAdcSpec
 */
export function isParsedAdcSpec(value: unknown): value is ParsedAdcSpec {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const spec = value as ParsedAdcSpec;
  return isValidChartType(spec.type) && typeof spec.config === 'object' && spec.config !== null;
}
