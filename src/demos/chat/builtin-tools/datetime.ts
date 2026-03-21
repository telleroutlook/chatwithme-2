/**
 * Built-in datetime utility tool — pure JS, zero network calls, < 1ms latency.
 *
 * Covers: timezone conversion, date arithmetic, date difference, formatting.
 * Uses the standard Intl.DateTimeFormat API — fully Cloudflare Workers compatible.
 * The AI already knows today's date from the system prompt; this tool handles
 * timezone math and date calculations that the model cannot do reliably alone.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_DATETIME_KEY = "builtin_datetime";

// ============ Timezone Helpers ============

/**
 * Format a Date in a given IANA timezone with full detail.
 */
function formatInTimezone(date: Date, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "long",
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} (${get("weekday")}) [${timezone}]`;
  } catch {
    throw new Error(
      `Invalid timezone: "${timezone}". Use IANA names like "Asia/Shanghai", "America/New_York", "Europe/London", "UTC".`
    );
  }
}

/**
 * Parse a date/time string with an optional timezone context.
 * Accepts ISO 8601 or common formats like "2025-03-15 14:30".
 */
function parseDate(
  dateStr: string,
  timezone?: string
): Date {
  const trimmed = dateStr.trim();

  // If already has timezone offset (Z, +HH:MM, -HH:MM), parse directly
  if (/Z$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Try ISO-like without timezone — interpret as UTC first
  const isoLike = trimmed.replace(" ", "T");
  const d = new Date(isoLike + (isoLike.includes("T") ? "" : "T00:00:00"));
  if (!isNaN(d.getTime())) {
    // If a source timezone is given, adjust: find offset and re-interpret
    if (timezone) {
      // Get the UTC offset for the given timezone at this wall-clock time
      // Trick: format the date in that timezone and compute the diff
      const utcMs = d.getTime();
      const localStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).format(new Date(utcMs));
      // localStr is like "2025-03-15, 14:30:00" — parse it as UTC to find offset
      const localAsUtc = new Date(localStr.replace(", ", "T") + "Z");
      const offsetMs = utcMs - localAsUtc.getTime();
      return new Date(utcMs - offsetMs);
    }
    return d;
  }

  throw new Error(
    `Cannot parse date: "${dateStr}". Use ISO format like "2025-03-15" or "2025-03-15 14:30:00".`
  );
}

// ============ Operation Handlers ============

type DatetimeInput = {
  operation: "convert" | "add" | "diff" | "now" | "format";
  datetime?: string;
  from_timezone?: string;
  to_timezone?: string;
  amount?: number;
  unit?: "days" | "hours" | "minutes" | "months" | "years";
  datetime2?: string;
  format?: string;
};

function handleNow(toTimezone?: string): string {
  const now = new Date();
  const zones = toTimezone ? [toTimezone] : ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];
  return zones.map((tz) => formatInTimezone(now, tz)).join("\n");
}

function handleConvert(input: DatetimeInput): string {
  if (!input.datetime) throw new Error("datetime is required for convert operation.");
  const toZones = input.to_timezone
    ? [input.to_timezone]
    : ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];

  const date = parseDate(input.datetime, input.from_timezone);
  const results = toZones.map((tz) => formatInTimezone(date, tz));

  const lines: string[] = [
    `Input: **${input.datetime}**${input.from_timezone ? ` (${input.from_timezone})` : ""}`,
    "",
    ...results,
  ];
  return lines.join("\n");
}

function handleAdd(input: DatetimeInput): string {
  if (!input.datetime) throw new Error("datetime is required for add operation.");
  if (input.amount === undefined) throw new Error("amount is required for add operation.");
  if (!input.unit) throw new Error("unit is required for add operation.");

  const date = parseDate(input.datetime, input.from_timezone);
  const ms = date.getTime();
  let result: Date;

  switch (input.unit) {
    case "minutes":
      result = new Date(ms + input.amount * 60_000);
      break;
    case "hours":
      result = new Date(ms + input.amount * 3_600_000);
      break;
    case "days":
      result = new Date(ms + input.amount * 86_400_000);
      break;
    case "months": {
      const d = new Date(date);
      d.setUTCMonth(d.getUTCMonth() + input.amount);
      result = d;
      break;
    }
    case "years": {
      const d = new Date(date);
      d.setUTCFullYear(d.getUTCFullYear() + input.amount);
      result = d;
      break;
    }
    default:
      throw new Error(`Unknown unit: ${input.unit}`);
  }

  const tz = input.from_timezone ?? "UTC";
  return [
    `Input: **${input.datetime}**`,
    `Operation: ${input.amount >= 0 ? "+" : ""}${input.amount} ${input.unit}`,
    `Result: ${formatInTimezone(result, tz)}`,
    input.to_timezone && input.to_timezone !== tz
      ? `Also in ${input.to_timezone}: ${formatInTimezone(result, input.to_timezone)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function handleDiff(input: DatetimeInput): string {
  if (!input.datetime) throw new Error("datetime is required for diff operation.");
  if (!input.datetime2) throw new Error("datetime2 is required for diff operation.");

  const d1 = parseDate(input.datetime, input.from_timezone);
  const d2 = parseDate(input.datetime2, input.from_timezone);

  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  const sign = d2 >= d1 ? "later" : "earlier";

  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  const weeks = Math.floor(totalDays / 7);
  const remDays = totalDays % 7;
  const years = Math.floor(totalDays / 365);
  const remDaysAfterYears = totalDays % 365;
  const months = Math.floor(remDaysAfterYears / 30);

  const lines = [
    `**${input.datetime}** → **${input.datetime2}**`,
    `Direction: datetime2 is **${sign}** than datetime`,
    "",
    `Total: ${totalDays} days (${totalHours} hours, ${totalMinutes} minutes)`,
    `Breakdown: ${years > 0 ? `${years} year(s), ` : ""}${months > 0 ? `${months} month(s), ` : ""}${weeks} week(s), ${remDays} day(s)`,
  ];
  return lines.join("\n");
}

// ============ AI Tool Definition ============

export function createDatetimeTool(): ToolSet {
  return {
    [BUILTIN_DATETIME_KEY]: tool({
      description:
        "Perform timezone conversions, date arithmetic (add/subtract days/hours/months), and date difference calculations. Use for: converting times between timezones, calculating how many days between two dates, finding what date it will be in N days, etc. Zero latency — runs entirely in-process.",
      inputSchema: z.object({
        operation: z
          .enum(["convert", "add", "diff", "now"])
          .describe(
            "Operation to perform: 'now' = current time in timezone(s), 'convert' = convert a datetime to another timezone, 'add' = add/subtract time from a datetime, 'diff' = difference between two datetimes."
          ),
        datetime: z
          .string()
          .optional()
          .describe(
            "The starting date/time string. Use ISO format: '2025-03-15' or '2025-03-15 14:30:00'. Required for convert/add/diff."
          ),
        datetime2: z
          .string()
          .optional()
          .describe(
            "The second date/time for diff operation. Same format as datetime."
          ),
        from_timezone: z
          .string()
          .optional()
          .describe(
            "IANA timezone of the input datetime. E.g. 'Asia/Shanghai', 'America/New_York', 'Europe/London', 'UTC'. Defaults to UTC if omitted."
          ),
        to_timezone: z
          .string()
          .optional()
          .describe(
            "Target IANA timezone to convert to. If omitted for 'now'/'convert', shows UTC + major timezones."
          ),
        amount: z
          .number()
          .optional()
          .describe(
            "Number of units to add (positive) or subtract (negative). Required for add operation."
          ),
        unit: z
          .enum(["minutes", "hours", "days", "months", "years"])
          .optional()
          .describe("Time unit for add operation."),
      }),
      execute: async (input: DatetimeInput) => {
        try {
          switch (input.operation) {
            case "now":
              return handleNow(input.to_timezone);
            case "convert":
              return handleConvert(input);
            case "add":
              return handleAdd(input);
            case "diff":
              return handleDiff(input);
            default:
              return `Unknown operation: ${(input as { operation: string }).operation}`;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Datetime error: ${msg}`;
        }
      },
    }),
  };
}
