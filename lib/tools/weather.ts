import { z } from "zod";
import { MemoryCache } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { fetchJson } from "@/lib/fetch";
import type { UIBlock } from "@/lib/contracts";

export const weatherInputSchema = z.object({
  location: z.string().trim().min(1).max(120).describe("要查詢天氣的城市、行政區或地名"),
}).strict();

const geocodingSchema = z.object({
  results: z.array(z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
    country: z.string().optional(),
    admin1: z.string().optional(),
  })).optional(),
});

const forecastSchema = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number().nullable().optional(),
    relative_humidity_2m: z.number().nullable().optional(),
    precipitation: z.number().nullable().optional(),
    weather_code: z.number().int().nullable().optional(),
  }),
});

export type WeatherResult = {
  status: "ok";
  location: string;
  timezone: string;
  observedAt: string;
  temperatureC: number;
  apparentTemperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  source: "Open-Meteo";
  ui: UIBlock;
};

const cache = new MemoryCache<WeatherResult>(5 * 60_000);

export async function getWeather(input: z.infer<typeof weatherInputSchema>, signal?: AbortSignal): Promise<WeatherResult> {
  const parsed = weatherInputSchema.parse(input);
  const cacheKey = parsed.location.toLocaleLowerCase("zh-TW");
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const timeout = getConfig().TOOL_TIMEOUT_MS;
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", parsed.location);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");
  const geo = geocodingSchema.parse(await fetchJson(geoUrl.toString(), timeout, signal));
  const location = geo.results?.[0];
  if (!location) throw new Error("找不到指定地點");

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code");
  const forecast = forecastSchema.parse(await fetchJson(forecastUrl.toString(), timeout, signal));
  const displayLocation = [location.name, location.admin1, location.country].filter(Boolean).join("，");
  const props = {
    location: displayLocation,
    timezone: forecast.timezone,
    observedAt: forecast.current.time,
    temperatureC: forecast.current.temperature_2m,
    apparentTemperatureC: forecast.current.apparent_temperature ?? null,
    humidityPercent: forecast.current.relative_humidity_2m ?? null,
    precipitationMm: forecast.current.precipitation ?? null,
    weatherCode: forecast.current.weather_code ?? null,
  };
  const result: WeatherResult = {
    status: "ok",
    ...props,
    source: "Open-Meteo",
    ui: { type: "weather-card", version: 1, props },
  };
  cache.set(cacheKey, result);
  return result;
}
