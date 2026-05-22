const { test, expect } = require("@playwright/test");
const { loginAsCustomer, openProductsPage } = require("../helpers/customerAuth");

test("顧客E2E: 注文ページに注文関連バナーが表示される", async ({ page }) => {
    await loginAsCustomer(page);
    await openProductsPage(page);

    const bannerContainer = page.locator("#announcements-container");
    await expect(bannerContainer).toBeVisible();
    await expect(bannerContainer).toContainText("E2E注文関連バナー");
});
