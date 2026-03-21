/**
 * Built-in currency exchange rate tool — backed by open.er-api.com (free, no key).
 *
 * Provides real-time exchange rates updated daily. 166 currencies supported.
 * Free tier: ~1500 requests/month without an API key.
 * Cloudflare Workers compatible — single HTTP GET.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_CURRENCY_KEY = "builtin_currency";

// ============ Exchange Rate API ============

interface ExchangeRateResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc?: string;
}

// Simple module-level cache: { base -> { rates, fetchedAt } }
const ratesCache = new Map<
  string,
  { rates: Record<string, number>; fetchedAt: number; lastUpdate: string }
>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchRates(base: string): Promise<{
  rates: Record<string, number>;
  lastUpdate: string;
}> {
  const upperBase = base.toUpperCase();
  const cached = ratesCache.get(upperBase);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { rates: cached.rates, lastUpdate: cached.lastUpdate };
  }

  const url = `https://open.er-api.com/v6/latest/${upperBase}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Exchange rate API failed: HTTP ${resp.status}`);
  const data = (await resp.json()) as ExchangeRateResponse;
  if (data.result !== "success") {
    throw new Error(
      `Currency "${upperBase}" not supported or API error.`
    );
  }

  const entry = {
    rates: data.rates,
    fetchedAt: Date.now(),
    lastUpdate: data.time_last_update_utc ?? "unknown",
  };
  ratesCache.set(upperBase, entry);
  return { rates: entry.rates, lastUpdate: entry.lastUpdate };
}

function formatConversion(
  amount: number,
  from: string,
  to: string,
  rate: number,
  lastUpdate: string
): string {
  const converted = amount * rate;
  const rounded =
    converted >= 1
      ? converted.toFixed(2)
      : converted.toPrecision(4);
  return (
    `**${amount} ${from.toUpperCase()} = ${rounded} ${to.toUpperCase()}**\n` +
    `Exchange rate: 1 ${from.toUpperCase()} = ${rate.toPrecision(6)} ${to.toUpperCase()}\n` +
    `Rates last updated: ${lastUpdate}`
  );
}

// ============ AI Tool Definition ============

export function createCurrencyTool(): ToolSet {
  return {
    [BUILTIN_CURRENCY_KEY]: tool({
      description:
        "Convert between currencies using real-time exchange rates. Supports 166 currencies including USD, EUR, CNY, JPY, GBP, KRW, etc. Use when the user asks to convert money, compare prices across currencies, or check exchange rates.",
      inputSchema: z.object({
        amount: z
          .number()
          .describe("The amount to convert. Use 1 if the user only asks for the exchange rate."),
        from: z
          .string()
          .describe(
            "Source currency ISO 4217 code (e.g. 'USD', 'CNY', 'EUR', 'JPY'). Infer from the user's message context."
          ),
        to: z
          .string()
          .describe(
            "Target currency ISO 4217 code (e.g. 'USD', 'CNY', 'EUR', 'JPY'). Infer from the user's message context."
          ),
      }),
      execute: async ({
        amount,
        from,
        to,
      }: {
        amount: number;
        from: string;
        to: string;
      }) => {
        if (!from?.trim() || !to?.trim()) {
          return "Error: Both 'from' and 'to' currency codes are required.";
        }
        try {
          const { rates, lastUpdate } = await fetchRates(from.trim());
          const upperTo = to.trim().toUpperCase();
          const rate = rates[upperTo];
          if (rate === undefined) {
            return `Error: Currency "${upperTo}" not found. Use ISO 4217 codes like USD, EUR, CNY, JPY.`;
          }
          return formatConversion(amount, from.trim(), to.trim(), rate, lastUpdate);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Currency conversion error: ${msg}`;
        }
      },
    }),
  };
}
