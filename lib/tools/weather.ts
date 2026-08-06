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

const taiwanLocationAliases: Record<string, string> = {
  "臺北市": "Taipei", "台北市": "Taipei", "新北市": "New Taipei", "桃園市": "Taoyuan",
  "臺中市": "Taichung", "台中市": "Taichung", "臺南市": "Tainan", "台南市": "Tainan",
  "高雄市": "Kaohsiung", "基隆市": "Keelung", "新竹市": "Hsinchu", "嘉義市": "Chiayi",
  "新竹縣": "Hsinchu", "苗栗縣": "Miaoli", "彰化縣": "Changhua", "南投縣": "Nantou",
  "雲林縣": "Yunlin", "嘉義縣": "Chiayi", "屏東縣": "Pingtung", "宜蘭縣": "Yilan",
  "花蓮縣": "Hualien", "臺東縣": "Taitung", "台東縣": "Taitung", "澎湖縣": "Penghu",
  "金門縣": "Kinmen", "連江縣": "Lienchiang",
};

export function getGeocodingQueries(location: string): string[] {
  const alias = taiwanLocationAliases[location];
  const withoutAdministrativeSuffix = location.replace(/[市縣區鄉鎮]$/, "");
  return [...new Set([location, alias, withoutAdministrativeSuffix].filter((value): value is string => Boolean(value)))];
}

export async function getWeather(input: z.infer<typeof weatherInputSchema>, signal?: AbortSignal): Promise<WeatherResult> {
  const parsed = weatherInputSchema.parse(input);
  const cacheKey = parsed.location.toLocaleLowerCase("zh-TW");
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const timeout = getConfig().TOOL_TIMEOUT_MS;
  let location: z.infer<typeof geocodingSchema>["results"] extends (infer Entry)[] | undefined ? Entry | undefined : never;
  for (const query of getGeocodingQueries(parsed.location)) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", query);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "zh");
    geoUrl.searchParams.set("format", "json");
    const geo = geocodingSchema.parse(await fetchJson(geoUrl.toString(), timeout, signal));
    location = geo.results?.[0];
    if (location) break;
  }
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
