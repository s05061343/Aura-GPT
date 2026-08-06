import { tool } from "langchain";
import { getTaiwanStockQuote, stockInputSchema } from "@/lib/tools/stock";
import { getWeather, weatherInputSchema } from "@/lib/tools/weather";

export const TOOL_NAMES = {
  weather: "get_weather",
  stock: "get_tw_stock_quote",
} as const;

export const externalToolNames = [TOOL_NAMES.weather, TOOL_NAMES.stock] as const;

export function createTools(signal?: AbortSignal) {
  const weatherTool = tool(
    async (input) => {
      try {
        return await getWeather(input, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : "天氣服務暫時無法使用";
        return {
          status: "error" as const,
          code: message === "找不到指定地點" ? "LOCATION_NOT_FOUND" as const : "WEATHER_UNAVAILABLE" as const,
          message: message === "找不到指定地點"
            ? "找不到這個地點，請提供城市、縣市或鄉鎮區名稱。"
            : "目前無法取得天氣資料，請稍後再試。",
        };
      }
    },
    {
      name: TOOL_NAMES.weather,
      description: "查詢指定地點的目前天氣。這是外部唯讀工具，會將地點文字送往 Open-Meteo。",
      schema: weatherInputSchema,
    },
  );
  const stockTool = tool(
    async (input) => getTaiwanStockQuote(input, signal),
    {
      name: TOOL_NAMES.stock,
      description: "查詢臺灣上市或上櫃股票的最新官方收盤價。資料不是即時盤中行情，也不是投資建議。",
      schema: stockInputSchema,
    },
  );
  return [weatherTool, stockTool];
}
