import { describe, expect, it } from "vitest";
import { getGeocodingQueries, weatherInputSchema } from "@/lib/tools/weather";

describe("天氣工具 schema", () => {
  it("接受合理地點", () => expect(weatherInputSchema.parse({ location: "臺北市" }).location).toBe("臺北市"));
  it("拒絕空白與未知欄位", () => {
    expect(weatherInputSchema.safeParse({ location: "   " }).success).toBe(false);
    expect(weatherInputSchema.safeParse({ location: "臺北", url: "http://127.0.0.1" }).success).toBe(false);
  });
  it("為臺灣行政區提供 Open-Meteo 可辨識的英文候選名稱", () => {
    expect(getGeocodingQueries("桃園市")).toEqual(["桃園市", "Taoyuan", "桃園"]);
    expect(getGeocodingQueries("臺北市")).toEqual(["臺北市", "Taipei", "臺北"]);
  });
});
