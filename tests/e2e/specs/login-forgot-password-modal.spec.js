const { test, expect } = require("@playwright/test");

test("顧客E2E: パスワード再設定モーダル送信後に閉じる", async ({ page }) => {
    await page.goto("/index.html");

    await page.click("#forgot-password-link");
    const modal = page.locator("#forgot-password-modal");
    await expect(modal).toHaveClass(/active/);

    await page.fill("#forgot-password-input", "TEST001");
    await page.click("#forgot-password-submit");

    await expect(modal).not.toHaveClass(/active/);
});
