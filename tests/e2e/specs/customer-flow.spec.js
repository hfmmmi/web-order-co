const { test, expect } = require("@playwright/test");

test("顧客E2E: ログイン -> 注文 -> カート投入 -> カート確認", async ({ page }) => {
    await page.goto("/index.html");

    await page.fill("#username-input", "TEST001");
    await page.fill("#password-input", "CustPass123!");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page).toHaveURL(/products\.html$/);

    const addCartButton = page.locator(".btn-add-cart").first();
    await expect(addCartButton).toBeVisible();
    await addCartButton.click();

    await page.locator("a.nav-cart").click();
    await expect(page).toHaveURL(/cart\.html$/);
    await expect(page.locator("#cart-list-body tr")).toHaveCount(1);

    await expect(page.locator("#cart-list-body tr td").first()).not.toHaveText("");
});
