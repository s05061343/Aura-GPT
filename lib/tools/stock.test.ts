import { describe, expect, it } from "vitest";
import { __stockTesting, stockInputSchema } from "@/lib/tools/stock";

describe("台股工具", () => {
  it("正規化 TWSE 欄位", () => {
    expect(__stockTesting.normalizeRows([{ Code: "2330", Name: "台積電", ClosingPrice: "1,005.00", Date: "1150805" }], "listed")).toEqual([{
      symbol: "2330", name: "台積電", market: "listed", currency: "TWD", closePrice: 1005, tradeDate: "2026-08-05", source: "TWSE", realtime: false,
    }]);
  });

  it("正規化 TPEx 欄位", () => {
    expect(__stockTesting.normalizeRows([{ SecuritiesCompanyCode: "6488", CompanyName: "環球晶", Close: "450.5", Date: "20260805" }], "otc")[0]).toMatchObject({ symbol: "6488", market: "otc", source: "TPEx", closePrice: 450.5 });
  });

  it("拒絕額外參數", () => {
    expect(stockInputSchema.safeParse({ query: "2330", shell: "whoami" }).success).toBe(false);
  });
});
