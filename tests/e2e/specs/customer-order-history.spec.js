const { test, expect } = require("@playwright/test");
const { loginAsCustomer, openProductsPage, openHistoryPage } = require("../helpers/customerAuth");

test("顧客E2E: 注文確定後に履歴へ反映される", async ({ page }) => {
    await loginAsCustomer(page);
    await openProductsPage(page);

    await page.locator(".btn-add-cart").first().click();
    await page.locator("a.nav-cart").click();
    await expect(page).toHaveURL(/cart\.html$/);

    await page.fill("#zip-code", "1000001");
    await page.fill("#tel-number", "03-1111-2222");
    await page.fill("#address", "東京都千代田区1-1");
    await page.fill("#recipient-name", "履歴確認テスト");
    await page.fill("#note", "E2E注文履歴テスト");
    await page.click("#place-order-btn");

    await expect(page).toHaveURL(/home\.html$/, { timeout: 15000 });
    await openHistoryPage(page);
    await expect(page.locator(".orders-list-table .order-summary-row").first()).toBeVisible();
});
