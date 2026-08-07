import { describe, expect, it } from "vitest";
import { assistantStreamText, findNewToolResults } from "@/lib/agent/stream-utils";

describe("assistantStreamText", () => {
  it("只輸出 AI 訊息，不洩漏工具 JSON", () => {
    expect(assistantStreamText({ _getType: () => "ai", content: "整理後的回答" })).toBe("整理後的回答");
    expect(assistantStreamText({ _getType: () => "tool", content: "{\"status\":\"ok\"}" })).toBe("");
  });
});

describe("findNewToolResults", () => {
  const weatherUi = {
    type: "weather-card",
    version: 1,
    props: { location: "臺北市", timezone: "Asia/Taipei", observedAt: "2026-08-07T23:00", temperatureC: 24.7, source: "Open-Meteo" },
  };
  const stockUi = {
    type: "stock-quote-card",
    version: 1,
    props: { symbol: "2330", name: "台積電", market: "listed", currency: "TWD", closePrice: 2365, tradeDate: "2026-08-06", source: "TWSE", realtime: false },
  };

  it("略過前一輪已送出的 callId，只回傳新卡片", () => {
    const delivered = new Set(["weather-1"]);
    const update = { tools: { messages: [
      { _getType: () => "tool", tool_call_id: "weather-1", name: "get_weather", content: JSON.stringify({ ui: weatherUi }) },
      { _getType: () => "tool", tool_call_id: "stock-1", name: "get_tw_stock_quote", content: JSON.stringify({ ui: stockUi }) },
    ] } };

    const results = findNewToolResults(update, delivered);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ callId: "stock-1", tool: "get_tw_stock_quote", ui: stockUi });
    expect(findNewToolResults(update, delivered)).toEqual([]);
  });

  it("可使用從舊 session 惰性補上的空集合", () => {
    const delivered = new Set<string>();
    const update = { tools: { messages: [
      { _getType: () => "tool", tool_call_id: "weather-legacy", name: "get_weather", content: JSON.stringify({ ui: weatherUi }) },
    ] } };

    expect(findNewToolResults(update, delivered)).toHaveLength(1);
    expect(delivered.has("weather-legacy")).toBe(true);
  });
});
