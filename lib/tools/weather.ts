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
    country_code: z.string().optional(),
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

type TaiwanLocation = { canonical: string; query: string; aliases: string[] };

const taiwanLocations: TaiwanLocation[] = [
  { canonical: "臺北市", query: "Taipei", aliases: ["臺北", "臺北市"] },
  { canonical: "新北市", query: "New Taipei", aliases: ["新北", "新北市"] },
  { canonical: "桃園市", query: "Taoyuan", aliases: ["桃園", "桃園市"] },
  { canonical: "臺中市", query: "Taichung", aliases: ["臺中", "臺中市"] },
  { canonical: "臺南市", query: "Tainan", aliases: ["臺南", "臺南市"] },
  { canonical: "高雄市", query: "Kaohsiung", aliases: ["高雄", "高雄市"] },
  { canonical: "基隆市", query: "Keelung", aliases: ["基隆", "基隆市"] },
  { canonical: "新竹市", query: "Hsinchu", aliases: ["新竹", "新竹市"] },
  { canonical: "嘉義市", query: "Chiayi", aliases: ["嘉義", "嘉義市"] },
  { canonical: "新竹縣", query: "Zhubei", aliases: ["新竹縣"] },
  { canonical: "苗栗縣", query: "Miaoli", aliases: ["苗栗", "苗栗縣"] },
  { canonical: "彰化縣", query: "Changhua", aliases: ["彰化", "彰化縣"] },
  { canonical: "南投縣", query: "Nantou", aliases: ["南投", "南投縣"] },
  { canonical: "雲林縣", query: "Douliu", aliases: ["雲林", "雲林縣"] },
  { canonical: "嘉義縣", query: "Taibao", aliases: ["嘉義縣"] },
  { canonical: "屏東縣", query: "Pingtung", aliases: ["屏東", "屏東縣"] },
  { canonical: "宜蘭縣", query: "Yilan", aliases: ["宜蘭", "宜蘭縣"] },
  { canonical: "花蓮縣", query: "Hualien", aliases: ["花蓮", "花蓮縣"] },
  { canonical: "臺東縣", query: "Taitung", aliases: ["臺東", "臺東縣"] },
  { canonical: "澎湖縣", query: "Magong", aliases: ["澎湖", "澎湖縣"] },
  { canonical: "金門縣", query: "Jincheng", aliases: ["金門", "金門縣"] },
  { canonical: "連江縣", query: "Nangan", aliases: ["連江", "連江縣", "馬祖"] },
];

function normalizeTaiwanName(location: string): string {
  return location.trim().replaceAll("台", "臺").replaceAll(/\s+/g, "");
}

const taiwanLocationByAlias = new Map(
  taiwanLocations.flatMap((entry) => entry.aliases.map((alias) => [normalizeTaiwanName(alias), entry] as const)),
);

export function resolveTaiwanLocation(location: string): TaiwanLocation | undefined {
  return taiwanLocationByAlias.get(normalizeTaiwanName(location));
}

export function getGeocodingQueries(location: string): string[] {
  const normalized = normalizeTaiwanName(location);
  const taiwanLocation = resolveTaiwanLocation(normalized);
  const withoutAdministrativeSuffix = normalized.replace(/[市縣區鄉鎮]$/, "");
  return [...new Set([location, taiwanLocation?.query, normalized, withoutAdministrativeSuffix]
    .filter((value): value is string => Boolean(value)))];
}

export async function getWeather(input: z.infer<typeof weatherInputSchema>, signal?: AbortSignal): Promise<WeatherResult> {
  const parsed = weatherInputSchema.parse(input);
  const taiwanLocation = resolveTaiwanLocation(parsed.location);
  const cacheKey = (taiwanLocation?.canonical ?? parsed.location).toLocaleLowerCase("zh-TW");
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const timeout = getConfig().TOOL_TIMEOUT_MS;
  let location: z.infer<typeof geocodingSchema>["results"] extends (infer Entry)[] | undefined ? Entry | undefined : never;
  for (const query of getGeocodingQueries(parsed.location)) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", query);
    geoUrl.searchParams.set("count", taiwanLocation ? "5" : "1");
    geoUrl.searchParams.set("language", "zh");
    geoUrl.searchParams.set("format", "json");
    const geo = geocodingSchema.parse(await fetchJson(geoUrl.toString(), timeout, signal));
    location = taiwanLocation
      ? geo.results?.find((result) => result.country_code?.toUpperCase() === "TW")
      : geo.results?.[0];
    if (location) break;
  }
  if (!location) throw new Error("找不到指定地點");

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code");
  const forecast = forecastSchema.parse(await fetchJson(forecastUrl.toString(), timeout, signal));
  const displayLocation = taiwanLocation?.canonical
    ?? [location.name, location.admin1, location.country].filter(Boolean).join("，");
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
