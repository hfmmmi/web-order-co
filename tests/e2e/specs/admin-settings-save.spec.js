const { test, expect } = require("@playwright/test");

async function openFeaturesCustomerPanel(page) {
    await page.locator('.tab-btn[data-tab="features"]').click();
    const customerLink = page.locator('#tab-features .settings-linkbox[data-panel="customer"]');
    await expect(customerLink).toBeVisible();
    await customerLink.click();
    await expect(page.locator("#feat-support")).toBeVisible();
}

async function waitForAdminSettingsLoaded(page) {
    await page.waitForResponse(
        (res) =>
            res.url().includes("/api/admin/settings") &&
            res.request().method() === "GET" &&
            res.ok()
    );
}

async function clickSaveSettings(page) {
    await expect(page.locator("#btn-save")).toBeVisible();
    const saveDone = page.waitForResponse(
        (res) =>
            res.url().includes("/api/admin/settings") &&
            res.request().method() === "PUT" &&
            res.ok()
    );
    await page.locator("#btn-save").click();
    await saveDone;
    await expect(page.locator("#btn-save")).toBeEnabled();
}

test("管理E2E: 設定保存後に再読込しても状態を維持する", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/admin/admin-dashboard.html");
    await page.fill("#admin-id-input", "test-admin");
    await page.fill("#admin-pass-input", "AdminPass123!");
    await page.getByRole("button", { name: "LOGIN" }).click();
    await expect(page.locator("#admin-login-overlay")).toBeHidden();

    await page.locator(".menu-item", { hasText: "システム設定" }).click();
    await expect(page).toHaveURL(/admin\/admin-settings\.html$/);

    await openFeaturesCustomerPanel(page);
    const supportCheckbox = page.locator("#feat-support");
    const before = await supportCheckbox.isChecked();
    await supportCheckbox.setChecked(!before);

    await clickSaveSettings(page);

    const settingsLoaded = waitForAdminSettingsLoaded(page);
    await page.reload();
    await settingsLoaded;
    await expect(page.locator("#admin-login-overlay")).toBeHidden();

    await openFeaturesCustomerPanel(page);
    await expect(page.locator("#feat-support")).toBeChecked({ checked: !before });

    // 他E2Eに影響しないよう、変更したフラグを元に戻して終了する
    await supportCheckbox.setChecked(before);
    await clickSaveSettings(page);
});
