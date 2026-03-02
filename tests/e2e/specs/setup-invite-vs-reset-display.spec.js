/**
 * setup.html: id&key 付きURLで開いたとき、ID・現在PW欄が非表示で新パスワードのみ表示される（F-2）
 * npm run test:e2e / test:all で実行
 */
const { test, expect } = require("@playwright/test");

test("setup.html は id&key 付きURLでID・現在PW欄を非表示にし新パスワード欄のみ表示する", async ({ page }) => {
    await page.goto("/setup.html?id=TEST001&key=some-invite-or-reset-key");

    const wrapperId = page.locator("#wrapper-id");
    const wrapperCurrent = page.locator("#wrapper-current");
    const newPassInput = page.locator("#setup-new-pass");

    await expect(wrapperId).toBeHidden();
    await expect(wrapperCurrent).toBeHidden();
    await expect(newPassInput).toBeVisible();
    await expect(newPassInput).toBeEditable();

    const pageTitle = page.locator("#page-title");
    await expect(pageTitle).toHaveText("ようこそ");
});
