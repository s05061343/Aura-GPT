import { describe, expect, it } from "vitest";
import { getGeocodingQueries, resolveTaiwanLocation, weatherInputSchema } from "@/lib/tools/weather";

describe("天氣工具 schema", () => {
  it("接受合理地點", () => expect(weatherInputSchema.parse({ location: "臺北市" }).location).toBe("臺北市"));
  it("拒絕空白與未知欄位", () => {
    expect(weatherInputSchema.safeParse({ location: "   " }).success).toBe(false);
    expect(weatherInputSchema.safeParse({ location: "臺北", url: "http://127.0.0.1" }).success).toBe(false);
  });
  it("為臺灣行政區提供 Open-Meteo 可辨識的英文候選名稱", () => {
    expect(getGeocodingQueries("桃園市")).toEqual(["桃園市", "Taoyuan", "桃園"]);
    expect(getGeocodingQueries("台北")).toEqual(["台北", "Taipei", "臺北"]);
  });
  it("支援全部臺灣縣市簡稱並區分同名縣市", () => {
    expect(resolveTaiwanLocation("台北")?.canonical).toBe("臺北市");
    expect(resolveTaiwanLocation("台中市")?.canonical).toBe("臺中市");
    expect(resolveTaiwanLocation("新竹")?.canonical).toBe("新竹市");
    expect(resolveTaiwanLocation("新竹縣")?.query).toBe("Zhubei");
    expect(resolveTaiwanLocation("嘉義")?.canonical).toBe("嘉義市");
    expect(resolveTaiwanLocation("嘉義縣")?.query).toBe("Taibao");
    expect(resolveTaiwanLocation("馬祖")?.canonical).toBe("連江縣");
    expect(new Set([
      "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹市", "嘉義市",
      "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣",
      "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
    ].map((name) => resolveTaiwanLocation(name)?.canonical)).size).toBe(22);
  });
});
