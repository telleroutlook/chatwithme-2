/**
 * Stat Card Parser
 * Parses KPI/metric stat card data from ```stat code blocks.
 *
 * Expected format: JSON array of objects
 * [
 *   { "title": "Revenue", "value": "$1.2M", "change": "+12.5%", "trend": "up" },
 *   { "title": "Users", "value": "8,430", "change": "-3.1%", "trend": "down" },
 *   { "title": "Uptime", "value": "99.9%", "trend": "neutral" }
 * ]
 */

export type StatTrend = "up" | "down" | "neutral";

export interface StatCardItem {
  title: string;
  value: string;
  change?: string;
  trend?: StatTrend;
}

function isValidTrend(value: unknown): value is StatTrend {
  return value === "up" || value === "down" || value === "neutral";
}

function isStatCardItem(item: unknown): item is StatCardItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const obj = item as Record<string, unknown>;
  if (typeof obj.title !== "string" || !obj.title.trim()) return false;
  if (typeof obj.value !== "string" && typeof obj.value !== "number") return false;
  if (obj.change !== undefined && typeof obj.change !== "string" && typeof obj.change !== "number") return false;
  if (obj.trend !== undefined && !isValidTrend(obj.trend)) return false;
  return true;
}

/**
 * Parse stat card data from a code block string.
 * Returns a typed array of StatCardItem, or null if parsing fails.
 */
export function parseStatCardData(code: string): StatCardItem[] | null {
  if (!code || typeof code !== "string") return null;

  const trimmed = code.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try removing trailing commas and comments
    try {
      const cleaned = trimmed
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/,\s*([\]}])/g, "$1");
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const items: StatCardItem[] = [];
  for (const raw of parsed) {
    if (!isStatCardItem(raw)) continue;
    items.push({
      title: raw.title.trim(),
      value: String(raw.value),
      ...(raw.change !== undefined ? { change: String(raw.change) } : {}),
      ...(raw.trend !== undefined ? { trend: raw.trend } : {}),
    });
  }

  return items.length > 0 ? items : null;
}
