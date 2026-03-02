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

export interface ParsedAdcSpec {
  type: AdcChartType;
  config: Record<string, unknown>;
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
 * Parse ADC spec from code string
 *
 * @param code - The code block content (must be strict JSON)
 * @returns ParsedAdcSpec if valid, null otherwise
 */
export function parseAdcSpecFromCode(code: string): ParsedAdcSpec | null {
  if (!code || typeof code !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    return null;
  }

  // Try strict JSON parse
  let parsed: RawAdcSpec;
  try {
    parsed = JSON.parse(trimmedCode) as RawAdcSpec;
  } catch {
    // Invalid JSON (includes comments, trailing commas, etc.)
    return null;
  }

  // Validate it's an object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  // Extract type
  const { type } = parsed;
  if (typeof type !== 'string' || !isValidChartType(type)) {
    return null;
  }

  // Extract config based on format
  let config: Record<string, unknown>;

  if ('config' in parsed && typeof parsed.config === 'object' && parsed.config !== null) {
    // Wrapped format: { type: "line", config: { data: [...], ... } }
    config = parsed.config as Record<string, unknown>;
  } else {
    // Flat format: { type: "line", data: [...], xField: "...", ... }
    // Extract all properties except "type" as config
    const { type: _, ...rest } = parsed;
    config = rest as Record<string, unknown>;
  }

  return {
    type,
    config,
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
