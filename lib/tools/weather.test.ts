import { describe, expect, it } from "vitest";
import { weatherInputSchema } from "@/lib/tools/weather";

describe("天氣工具 schema", () => {
  it("接受合理地點", () => expect(weatherInputSchema.parse({ location: "臺北市" }).location).toBe("臺北市"));
  it("拒絕空白與未知欄位", () => {
    expect(weatherInputSchema.safeParse({ location: "   " }).success).toBe(false);
    expect(weatherInputSchema.safeParse({ location: "臺北", url: "http://127.0.0.1" }).success).toBe(false);
  });
});
