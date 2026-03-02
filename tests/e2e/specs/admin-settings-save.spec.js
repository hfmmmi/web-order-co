const { test, expect } = require("@playwright/test");

test("管理E2E: 設定保存後に再読込しても状態を維持する", async ({ page }) => {
    await page.goto("/admin/admin-dashboard.html");
    await page.fill("#admin-id-input", "test-admin");
    await page.fill("#admin-pass-input", "AdminPass123!");
    await page.getByRole("button", { name: "LOGIN" }).click();
    await expect(page.locator("#admin-login-overlay")).toBeHidden();

    await page.locator(".menu-item", { hasText: "システム設定" }).click();
    await expect(page).toHaveURL(/admin\/admin-settings\.html$/);

    await page.getByRole("button", { name: "🔘 機能ON/OFF" }).click();
    const supportCheckbox = page.locator("#feat-support");
    await expect(supportCheckbox).toBeVisible();
    const before = await supportCheckbox.isChecked();
    await supportCheckbox.setChecked(!before);

    await page.click("#btn-save");
    await page.reload();
    await page.getByRole("button", { name: "🔘 機能ON/OFF" }).click();
    await expect(page.locator("#feat-support")).toBeChecked({ checked: !before });

    // 他E2Eに影響しないよう、変更したフラグを元に戻して終了する
    await supportCheckbox.setChecked(before);
    await page.click("#btn-save");
});
