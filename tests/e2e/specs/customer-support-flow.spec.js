const { test, expect } = require("@playwright/test");
const { loginAsCustomer } = require("../helpers/customerAuth");

test("顧客E2E: サポート申請後に履歴タブへ反映される", async ({ page }) => {
    await loginAsCustomer(page);

    await page.goto("/support.html");
    await expect(page).toHaveURL(/support\.html$/);

    await page.selectOption("#support-type", "システムエラー");
    await page.fill("#support-detail", "E2Eサポート履歴連携テスト");
    await page.locator("button.btn-submit").click();

    await expect(page.locator("#support-history-panel")).toHaveClass(/active/);
    await expect(page.locator(".support-history-item").first()).toBeVisible();
    await expect(page.locator(".support-history-item").first()).toContainText("E2Eサポート履歴連携テスト");
});
