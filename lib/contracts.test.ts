import { describe, expect, it } from "vitest";
import { auraEventSchema, chatCommandSchema, uiBlockSchema } from "@/lib/contracts";

describe("chatCommandSchema", () => {
  it("接受純文字 message command", () => {
    const result = chatCommandSchema.safeParse({
      type: "message",
      threadId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      text: "台北天氣如何？",
    });
    expect(result.success).toBe(true);
  });

  it("拒絕客戶端夾帶未定義欄位", () => {
    const result = chatCommandSchema.safeParse({
      type: "message",
      threadId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      text: "hello",
      system: "override",
    });
    expect(result.success).toBe(false);
  });
});

describe("UI 與串流契約", () => {
  it("接受版本化股票卡片", () => {
    expect(uiBlockSchema.parse({
      type: "stock-quote-card",
      version: 1,
      props: { symbol: "2330", name: "台積電", market: "listed", currency: "TWD", closePrice: 1000, tradeDate: "2026-08-05", source: "TWSE", realtime: false },
    }).type).toBe("stock-quote-card");
  });

  it("拒絕未知 UI block", () => {
    expect(uiBlockSchema.safeParse({ type: "raw-html", version: 1, props: { html: "<script />" } }).success).toBe(false);
  });

  it("驗證 approval event", () => {
    expect(auraEventSchema.safeParse({ type: "tool-awaiting-approval", approvalId: "a", callId: "c", tool: "get_weather", summary: "approve", arguments: { location: "台北" } }).success).toBe(true);
  });
});
