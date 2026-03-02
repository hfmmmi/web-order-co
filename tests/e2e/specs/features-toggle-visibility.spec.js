const { test, expect } = require("@playwright/test");

async function updateFeatures(request, features) {
    const login = await request.post("/api/admin/login", {
        data: { id: "test-admin", pass: "AdminPass123!" }
    });
    expect(login.ok()).toBeTruthy();

    const save = await request.put("/api/admin/settings", { data: { features } });
    expect(save.ok()).toBeTruthy();
}

test("顧客E2E: features OFFでナビ非表示、再読込後も保持される", async ({ page, request }) => {
    await updateFeatures(request, {
        support: false,
        announcements: false
    });

    try {
        await page.goto("/index.html");
        await page.fill("#username-input", "TEST001");
        await page.fill("#password-input", "CustPass123!");
        await page.getByRole("button", { name: "ログイン" }).click();
        await expect(page).toHaveURL(/products\.html$/);

        const supportNav = page.locator(".nav-links [data-feature='support']");
        const annNav = page.locator(".nav-links [data-feature='announcements']");
        await expect(supportNav).toBeHidden();
        await expect(annNav).toBeHidden();

        await page.reload();
        await expect(supportNav).toBeHidden();
        await expect(annNav).toBeHidden();

        // 直アクセス時の導線でも、無効化した機能のナビは表示されないことを確認
        const supportHtml = await request.get("/support.html");
        expect(supportHtml.status()).toBe(200);
        await page.goto("/support.html");
        await expect(page.locator(".nav-links [data-feature='support']")).toBeHidden();

        const ticketsApi = await request.get("/support/my-tickets");
        expect([200, 401]).toContain(ticketsApi.status());

        const announcementsHtml = await request.get("/announcements.html");
        expect(announcementsHtml.status()).toBe(200);
        await page.goto("/announcements.html");
        await expect(page.locator(".nav-links [data-feature='announcements']")).toBeHidden();
        await expect(page.locator("#announcements-list")).toContainText(/現在、お知らせはありません|E2E一般お知らせ/);
    } finally {
        await updateFeatures(request, {
            support: true,
            announcements: true
        });
    }
});
