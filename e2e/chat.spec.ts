import { expect, test } from "@playwright/test";

test("顯示本機 Agent 聊天介面", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Aura-GPT" })).toBeVisible();
  await expect(page.getByLabel("聊天訊息")).toBeVisible();
  await expect(page.getByText("最新官方收盤價", { exact: false })).toBeVisible();
});
