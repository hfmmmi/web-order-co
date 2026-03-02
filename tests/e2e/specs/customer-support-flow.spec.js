const { test, expect } = require("@playwright/test");

test("顧客E2E: サポート申請後に履歴タブへ反映される", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#username-input", "TEST001");
    await page.fill("#password-input", "CustPass123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/products\.html$/);

    await page.goto("/support.html");
    await expect(page).toHaveURL(/support\.html$/);

    await page.selectOption("#support-type", "システムエラー");
    await page.fill("#support-detail", "E2Eサポート履歴連携テスト");
    await page.locator("button.btn-submit").click();

    await expect(page.locator("#support-history-panel")).toHaveClass(/active/);
    await expect(page.locator(".support-ticket-card").first()).toBeVisible();
    await expect(page.locator(".support-ticket-card").first()).toContainText("E2Eサポート履歴連携テスト");
});
