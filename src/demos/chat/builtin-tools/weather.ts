/**
 * Built-in weather tool — backed by Open-Meteo (completely free, no API key).
 *
 * Two-step: city name → lat/lon via Nominatim geocoding → weather via Open-Meteo.
 * Both APIs are free, no authentication required, Cloudflare Workers compatible.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_WEATHER_KEY = "builtin_weather";

// ============ Geocoding ============

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

async function geocode(
  location: string
): Promise<{ lat: number; lon: number; displayName: string }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "ChatWithMe/2.0 (weather tool)" },
  });
  if (!resp.ok) throw new Error(`Geocoding failed: HTTP ${resp.status}`);
  const data = (await resp.json()) as NominatimResult[];
  if (!data.length) throw new Error(`Location not found: "${location}"`);
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// ============ Weather ============

interface OpenMeteoCurrentWeather {
  temperature: number;
  windspeed: number;
  weathercode: number;
  is_day: number;
  time: string;
}

interface OpenMeteoDailyUnits {
  temperature_2m_max: string;
  temperature_2m_min: string;
  precipitation_sum: string;
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  weathercode: number[];
}

interface OpenMeteoResponse {
  current_weather: OpenMeteoCurrentWeather;
  daily_units: OpenMeteoDailyUnits;
  daily: OpenMeteoDaily;
}

// WMO weather codes → human-readable description
const WMO_CODES: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "icy fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "heavy drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  71: "slight snow",
  73: "moderate snow",
  75: "heavy snow",
  77: "snow grains",
  80: "slight showers",
  81: "moderate showers",
  82: "violent showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

function describeWeather(code: number): string {
  return WMO_CODES[code] ?? `weather code ${code}`;
}

async function fetchWeather(
  lat: number,
  lon: number,
  timezone: string
): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current_weather: "true",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
    forecast_days: "5",
    timezone,
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Weather API failed: HTTP ${resp.status}`);
  return (await resp.json()) as OpenMeteoResponse;
}

function formatWeatherReport(
  locationName: string,
  weather: OpenMeteoResponse
): string {
  const cw = weather.current_weather;
  const daily = weather.daily;

  const lines: string[] = [
    `**Current weather in ${locationName}**`,
    `- Temperature: ${cw.temperature}°C`,
    `- Condition: ${describeWeather(cw.weathercode)}`,
    `- Wind speed: ${cw.windspeed} km/h`,
    `- Time: ${cw.time}`,
    "",
    "**5-day forecast:**",
  ];

  for (let i = 0; i < daily.time.length; i++) {
    const precip = daily.precipitation_sum[i];
    const precipStr = precip > 0 ? `, precip: ${precip}mm` : "";
    lines.push(
      `- ${daily.time[i]}: ${describeWeather(daily.weathercode[i])}, ` +
        `${daily.temperature_2m_min[i]}°C – ${daily.temperature_2m_max[i]}°C${precipStr}`
    );
  }

  return lines.join("\n");
}

// ============ AI Tool Definition ============

export function createWeatherTool(): ToolSet {
  return {
    [BUILTIN_WEATHER_KEY]: tool({
      description:
        "Get current weather and 5-day forecast for any city or location worldwide. Free, real-time data. Use when the user asks about weather, temperature, rain, or forecast.",
      inputSchema: z.object({
        location: z
          .string()
          .describe(
            "City name or location to get weather for. Examples: 'Beijing', 'New York', 'London, UK', '东京'. Be specific for ambiguous names."
          ),
        timezone: z
          .string()
          .optional()
          .describe(
            "IANA timezone string for the location, e.g. 'Asia/Shanghai', 'America/New_York'. Defaults to 'auto' (detected from coordinates)."
          ),
      }),
      execute: async ({
        location,
        timezone,
      }: {
        location: string;
        timezone?: string;
      }) => {
        if (!location?.trim()) return "Error: No location provided.";
        try {
          const { lat, lon, displayName } = await geocode(location.trim());
          const tz = timezone ?? "auto";
          const weather = await fetchWeather(lat, lon, tz);
          return formatWeatherReport(displayName.split(",")[0], weather);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Weather error: ${msg}`;
        }
      },
    }),
  };
}
