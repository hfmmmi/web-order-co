const { test, expect } = require("@playwright/test");
const { loginAsCustomer, openProductsPage } = require("../helpers/customerAuth");

test("顧客E2E: ログイン -> 注文 -> カート投入 -> カート確認", async ({ page }) => {
    await loginAsCustomer(page);
    await openProductsPage(page);

    const addCartButton = page.locator(".btn-add-cart").first();
    await expect(addCartButton).toBeVisible();
    await addCartButton.click();

    await page.locator("a.nav-cart").click();
    await expect(page).toHaveURL(/cart\.html$/);
    await expect(page.locator("#cart-list-body tr")).toHaveCount(1);

    await expect(page.locator("#cart-list-body tr td").first()).not.toHaveText("");
});
