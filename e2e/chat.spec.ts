import { expect, test } from "@playwright/test";

function ndjson(events: Array<Record<string, unknown>>) {
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

test("顯示本機 Agent 聊天介面", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Aura-GPT", { exact: true })).toBeVisible();
  await expect(page.getByLabel("聊天訊息")).toBeVisible();
  await expect(page.getByText("最新官方收盤價", { exact: false })).toBeVisible();
});

test("顯示工作台導覽、starter prompts 與 planned 狀態", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "主要導覽" })).toBeVisible();
  await expect(page.getByRole("button", { name: "搜尋紀錄 待補" })).toBeDisabled();
  await expect(page.getByText("重新整理後不保留對話")).toBeVisible();

  await page.getByRole("button", { name: /查詢台北天氣/ }).click();
  await expect(page.getByLabel("聊天訊息")).toHaveValue("幫我查台北今天的天氣");

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByText("首次使用每個外部工具前會要求授權。")).toBeVisible();
});

test("行動版使用 drawer 並在關閉時移出焦點順序", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "主要導覽" });
  await expect(sidebar).toHaveAttribute("inert", "");

  await page.getByRole("button", { name: "開啟側邊欄" }).click();
  await expect(sidebar).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "新增對話" })).toBeVisible();

  await sidebar.getByRole("button", { name: "關閉側邊欄" }).click();
  await expect(sidebar).toHaveAttribute("inert", "");
});

test("AI 回覆完成後將焦點放回輸入框", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      contentType: "application/x-ndjson; charset=utf-8",
      body: ndjson([
        { type: "message-start", messageId: "assistant-focus" },
        { type: "text-delta", messageId: "assistant-focus", delta: "完成" },
        { type: "message-end", messageId: "assistant-focus", finishReason: "stop" },
      ]),
    });
  });
  await page.goto("/");

  const composer = page.getByLabel("聊天訊息");
  await composer.fill("測試焦點");
  await composer.press("Enter");

  await expect(page.getByText("完成", { exact: true })).toBeVisible();
  await expect(composer).toBeFocused();
});

test("拒絕工具後關閉視窗，下一次工具請求可重新批准", async ({ page }) => {
  let messageRound = 0;
  const decisions: string[] = [];
  await page.route("**/api/chat", async (route) => {
    const command = route.request().postDataJSON() as { type: string; decision?: string };
    if (command.type === "message") {
      messageRound += 1;
      await route.fulfill({
        contentType: "application/x-ndjson; charset=utf-8",
        body: ndjson([
          { type: "message-start", messageId: `assistant-approval-${messageRound}` },
          {
            type: "tool-awaiting-approval",
            approvalId: `approval-${messageRound}`,
            callId: `call-${messageRound}`,
            tool: "get_weather",
            summary: "允許查詢天氣？",
            arguments: { location: "台北" },
          },
          { type: "message-end", messageId: `assistant-approval-${messageRound}`, finishReason: "approval-required" },
        ]),
      });
      return;
    }
    if (command.decision) decisions.push(command.decision);
    if (command.decision === "reject") {
      await route.fulfill({
        contentType: "application/x-ndjson; charset=utf-8",
        body: ndjson([
          { type: "message-start", messageId: "assistant-rejected" },
          { type: "text-delta", messageId: "assistant-rejected", delta: "已拒絕工具" },
          { type: "message-end", messageId: "assistant-rejected", finishReason: "stop" },
        ]),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/x-ndjson; charset=utf-8",
      body: ndjson([
        { type: "message-start", messageId: "assistant-approved" },
        { type: "text-delta", messageId: "assistant-approved", delta: "已批准" },
        { type: "message-end", messageId: "assistant-approved", finishReason: "stop" },
      ]),
    });
  });
  await page.goto("/");

  await page.getByLabel("聊天訊息").fill("查詢台北天氣");
  await page.getByLabel("聊天訊息").press("Enter");
  const approve = page.getByRole("button", { name: "批准並繼續" });
  await expect(approve).toBeFocused();

  await page.getByRole("button", { name: "拒絕", exact: true }).click();
  await expect(approve).toBeHidden();
  await expect(page.getByText("已拒絕工具", { exact: true })).toBeVisible();

  const composer = page.getByLabel("聊天訊息");
  await expect(composer).toBeFocused();
  await composer.fill("再次查詢台北天氣");
  await composer.press("Enter");
  await expect(approve).toBeFocused();
  await approve.click();

  await expect(page.getByText("已批准", { exact: true })).toBeVisible();
  expect(messageRound).toBe(2);
  expect(decisions).toEqual(["reject", "approve"]);
});
