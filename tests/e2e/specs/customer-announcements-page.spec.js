const { test, expect } = require("@playwright/test");

test("顧客E2E: お知らせページに一般お知らせが表示される", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#username-input", "TEST001");
    await page.fill("#password-input", "CustPass123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/products\.html$/);

    await page.getByRole("link", { name: "お知らせ" }).click();
    await expect(page).toHaveURL(/announcements\.html$/);
    await expect(page.locator(".announcement-card")).toHaveCount(1);
    await expect(page.locator(".announcement-card h3")).toContainText("E2E一般お知らせ");
});
