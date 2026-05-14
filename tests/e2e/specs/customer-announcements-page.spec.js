const { test, expect } = require("@playwright/test");

test("顧客E2E: ホームに一般お知らせが表示される", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#username-input", "TEST001");
    await page.fill("#password-input", "CustPass123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/home\.html$/);

    await expect(page.locator("#home-announcements-block .announcement-card")).toHaveCount(1);
    await expect(page.locator("#home-announcements-block .announcement-card h3")).toContainText("E2E一般お知らせ");
});
