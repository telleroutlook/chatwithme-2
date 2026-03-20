/**
 * Dashboard Parser
 * Parses composite dashboard specs from ```dashboard code blocks.
 *
 * A dashboard contains multiple items (stat cards, ADC charts, ECharts, text)
 * arranged in a grid layout.
 *
 * Expected format:
 * {
 *   "title": "Q1 Performance Overview",
 *   "layout": "2x2",
 *   "items": [
 *     { "type": "stat", "data": [{ "title": "Revenue", "value": "$1.2M", "trend": "up" }] },
 *     { "type": "adc",  "data": { "type": "line", "data": [...], "xField": "month", "yField": "value" } },
 *     { "type": "echarts", "data": { "series": [...], "xAxis": {...} }, "span": 2 },
 *     { "type": "text", "data": "Key insight: Revenue grew 12% QoQ." }
 *   ]
 * }
 */

import type { StatCardItem } from "./statCardParser";
import type { ParsedAdcSpec, AdcChartType } from "./adcSpecParser";
import type { EChartsOption } from "./ecSpecParser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardItemType = "stat" | "adc" | "echarts" | "text";

export interface DashboardItem {
  type: DashboardItemType;
  data: unknown;
  span?: number;
}

export interface DashboardSpec {
  title?: string;
  layout?: string; // "2x2", "3x1", "1x3", "2x1", "1x2", "auto"
  items: DashboardItem[];
}

export interface DashboardParseSuccess {
  ok: true;
  spec: DashboardSpec;
}

export interface DashboardParseError {
  ok: false;
  error: string;
}

export type DashboardParseResult = DashboardParseSuccess | DashboardParseError;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_ITEM_TYPES = new Set<string>(["stat", "adc", "echarts", "text"]);

const ADC_CHART_TYPES = new Set<string>([
  "line", "column", "bar", "area", "pie", "scatter",
  "radar", "gauge", "heatmap", "funnel", "histogram", "dualAxes",
]);

const ECHARTS_REQUIRED_FIELDS = new Set<string>([
  "series", "xAxis", "yAxis", "geo", "radar", "graphic",
]);

function isStatCardArray(data: unknown): data is StatCardItem[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const obj = item as Record<string, unknown>;
    return typeof obj.title === "string" && (typeof obj.value === "string" || typeof obj.value === "number");
  });
}

function isAdcSpec(data: unknown): data is { type: AdcChartType; config: Record<string, unknown> } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== "string" || !ADC_CHART_TYPES.has(obj.type)) return false;
  return true;
}

function isEChartsSpec(data: unknown): data is EChartsOption {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  return Object.keys(obj).some((key) => ECHARTS_REQUIRED_FIELDS.has(key));
}

function validateItem(item: unknown, index: number): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return `Item ${index}: must be an object`;
  }

  const obj = item as Record<string, unknown>;

  if (typeof obj.type !== "string" || !VALID_ITEM_TYPES.has(obj.type)) {
    return `Item ${index}: invalid type "${String(obj.type)}" (must be one of: stat, adc, echarts, text)`;
  }

  if (obj.data === undefined || obj.data === null) {
    return `Item ${index}: missing "data" field`;
  }

  // Type-specific validation
  switch (obj.type) {
    case "stat":
      if (!isStatCardArray(obj.data)) {
        return `Item ${index}: stat data must be an array of { title, value } objects`;
      }
      break;
    case "adc":
      if (!isAdcSpec(obj.data)) {
        return `Item ${index}: adc data must be an object with a valid "type" field (line, bar, pie, etc.)`;
      }
      break;
    case "echarts":
      if (!isEChartsSpec(obj.data)) {
        return `Item ${index}: echarts data must have at least one of: series, xAxis, yAxis, geo, radar, graphic`;
      }
      break;
    case "text":
      if (typeof obj.data !== "string" || !obj.data.trim()) {
        return `Item ${index}: text data must be a non-empty string`;
      }
      break;
  }

  // Validate span if present
  if (obj.span !== undefined) {
    if (typeof obj.span !== "number" || obj.span < 1 || obj.span > 4 || !Number.isInteger(obj.span)) {
      return `Item ${index}: span must be an integer between 1 and 4`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a dashboard spec from a code block string.
 *
 * @param code - Raw content of a ```dashboard code block
 * @returns Discriminated union: `{ ok: true; spec }` or `{ ok: false; error }`
 */
export function parseDashboardSpec(code: string): DashboardParseResult {
  if (!code || typeof code !== "string") {
    return { ok: false, error: "Empty dashboard spec" };
  }

  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty dashboard spec" };
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try tolerant parse: remove trailing commas and comments
    try {
      const cleaned = trimmed
        .replace(/\/\/.*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/,\s*([\]}])/g, "$1");
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: "Invalid JSON in dashboard spec" };
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Dashboard spec must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  // Validate items array
  if (!Array.isArray(obj.items)) {
    return { ok: false, error: 'Dashboard spec must have an "items" array' };
  }

  if (obj.items.length === 0) {
    return { ok: false, error: "Dashboard must have at least 1 item" };
  }

  // Validate each item
  for (let i = 0; i < obj.items.length; i++) {
    const error = validateItem(obj.items[i], i);
    if (error) {
      return { ok: false, error };
    }
  }

  // Validate optional fields
  if (obj.title !== undefined && typeof obj.title !== "string") {
    return { ok: false, error: '"title" must be a string' };
  }

  if (obj.layout !== undefined && typeof obj.layout !== "string") {
    return { ok: false, error: '"layout" must be a string' };
  }

  // Build the spec, normalizing ADC items
  const items: DashboardItem[] = (obj.items as Array<Record<string, unknown>>).map((raw) => {
    const item: DashboardItem = {
      type: raw.type as DashboardItemType,
      data: raw.data,
    };

    // Normalize ADC items: extract type + config from flat format
    if (item.type === "adc" && item.data && typeof item.data === "object" && !Array.isArray(item.data)) {
      const adcData = item.data as Record<string, unknown>;
      const { type: adcType, ...config } = adcData;
      item.data = { type: adcType, config } as ParsedAdcSpec;
    }

    // Normalize stat items: ensure values are strings
    if (item.type === "stat" && Array.isArray(item.data)) {
      item.data = (item.data as Array<Record<string, unknown>>).map((s) => ({
        ...s,
        value: String(s.value),
        ...(s.change !== undefined ? { change: String(s.change) } : {}),
      }));
    }

    if (raw.span !== undefined) {
      item.span = raw.span as number;
    }

    return item;
  });

  const spec: DashboardSpec = {
    items,
    ...(obj.title ? { title: obj.title as string } : {}),
    ...(obj.layout ? { layout: obj.layout as string } : {}),
  };

  return { ok: true, spec };
}
