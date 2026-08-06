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
    async (input) => getWeather(input, signal),
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
