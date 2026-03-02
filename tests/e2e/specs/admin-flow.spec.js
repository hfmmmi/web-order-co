const { test, expect } = require("@playwright/test");

test("管理E2E: 管理ログイン -> 顧客管理画面 -> 設定画面", async ({ page }) => {
    await page.goto("/admin/admin-dashboard.html");

    await page.fill("#admin-id-input", "test-admin");
    await page.fill("#admin-pass-input", "AdminPass123!");
    await page.getByRole("button", { name: "LOGIN" }).click();

    await expect(page.locator("#admin-login-overlay")).toBeHidden();
    await expect(page).toHaveURL(/admin\/admin-dashboard\.html$/);

    await page.locator(".menu-item", { hasText: "顧客管理" }).click();
    await expect(page).toHaveURL(/admin\/admin-customers\.html$/);
    await expect(page.locator("#cust-search-btn")).toBeVisible();
    await expect(page.locator("#btn-add-customer")).toBeVisible();

    await page.locator(".menu-item", { hasText: "システム設定" }).click();
    await expect(page).toHaveURL(/admin\/admin-settings\.html$/);
    await expect(page.locator("#btn-save")).toBeVisible();
});
