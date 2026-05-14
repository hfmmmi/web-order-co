const { test, expect } = require("@playwright/test");

test("顧客E2E: 注文ページに注文関連バナーが表示される", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#username-input", "TEST001");
    await page.fill("#password-input", "CustPass123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/products\.html$/);

    const bannerContainer = page.locator("#announcements-container");
    await expect(bannerContainer).toBeVisible();
    await expect(bannerContainer).toContainText("E2E注文関連バナー");
});
