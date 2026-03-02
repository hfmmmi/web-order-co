/**
 * 代理ログインE2E: 管理者が申請 → 顧客が許可 → 管理者が「代理ログインを実行」→ 顧客画面に遷移（F-5）
 * npm run test:e2e / test:all で実行
 */
const { test, expect } = require("@playwright/test");

test("代理ログイン: 申請→顧客許可→実行で顧客画面に遷移する", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const customerContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const customerPage = await customerContext.newPage();

    try {
        await adminPage.goto("/admin/admin-dashboard.html");
        await adminPage.fill("#admin-id-input", "test-admin");
        await adminPage.fill("#admin-pass-input", "AdminPass123!");
        await adminPage.getByRole("button", { name: "LOGIN" }).click();
        await expect(adminPage.locator("#admin-login-overlay")).toBeHidden();

        await adminPage.locator(".menu-item", { hasText: "顧客管理" }).click();
        await expect(adminPage).toHaveURL(/admin\/admin-customers\.html$/);

        await adminPage.waitForSelector(".btn-proxy-login", { state: "visible" });
        adminPage.once("dialog", (d) => d.accept());
        await adminPage.locator(".btn-proxy-login").first().click();

        await expect(adminPage.locator("#proxy-request-modal")).toBeVisible();

        await customerPage.goto("/index.html");
        await customerPage.fill("#username-input", "TEST001");
        await customerPage.fill("#password-input", "CustPass123!");
        await customerPage.getByRole("button", { name: "ログイン" }).click();
        await expect(customerPage).toHaveURL(/products\.html$/);

        const allowBtn = customerPage.getByRole("button", { name: "許可" });
        await allowBtn.waitFor({ state: "visible", timeout: 10000 });
        await allowBtn.click();

        await adminPage.locator("#proxy-execute-btn").waitFor({ state: "visible", timeout: 5000 });
        await expect(adminPage.locator("#proxy-execute-btn")).toBeEnabled({ timeout: 10000 });
        await adminPage.locator("#proxy-execute-btn").click();

        await expect(adminPage).toHaveURL(/products\.html$/, { timeout: 10000 });
        await expect(adminPage.locator("body")).toContainText(/商品|カート|発注/);
    } finally {
        await adminContext.close();
        await customerContext.close();
    }
});
