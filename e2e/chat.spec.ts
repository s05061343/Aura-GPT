import { expect, test } from "@playwright/test";

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
