const { test, expect } = require("@playwright/test");

async function fillOrderForm(page, suffix) {
    await page.fill("#zip-code", "1000001");
    await page.fill("#tel-number", "03-1111-2222");
    await page.fill("#address", "東京都千代田区1-1");
    await page.fill("#recipient-name", `再注文テスト-${suffix}`);
    await page.fill("#note", "E2E quick reorder");
}

async function expectCartQty(page, code, expectedQty) {
    const row = page.locator("#cart-list-body tr").filter({
        has: page.locator(`td:text-is("${code}")`)
    }).first();
    await expect(row).toBeVisible();
    await expect(row.locator("td").nth(3)).toHaveText(String(expectedQty));
}

test("顧客E2E: 複数商品のクイック再注文で数量合算と既存カートマージが正しい", async ({ page }) => {
    page.on("dialog", async (dialog) => {
        await dialog.accept();
    });

    await page.goto("/index.html");
    await page.fill("#username-input", "TEST001");
    await page.fill("#password-input", "CustPass123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/products\.html$/);

    // 初回注文: P001 x2, P002 x3
    await page.fill("#qty-P001", "2");
    await page.locator(".btn-add-cart[data-code='P001']").click();
    await page.fill("#qty-P002", "3");
    await page.locator(".btn-add-cart[data-code='P002']").click();
    await page.locator("a.nav-cart").click();
    await expect(page).toHaveURL(/cart\.html$/);
    await expect(page.locator("#cart-list-body tr")).toHaveCount(2);
    await expectCartQty(page, "P001", 2);
    await expectCartQty(page, "P002", 3);

    await fillOrderForm(page, "初回");
    await page.click("#place-order-btn");
    await expect(page).toHaveURL(/products\.html$/, { timeout: 15000 });

    // 既存カートを作成: P001 x4
    await page.fill("#qty-P001", "4");
    await page.locator(".btn-add-cart[data-code='P001']").click();

    await page.getByRole("link", { name: "注文履歴" }).click();
    await expect(page).toHaveURL(/history\.html$/);
    await expect(page.locator(".history-card").first()).toBeVisible();

    await page.locator(".btn-toggle-detail").first().click();
    await page.locator(".btn-reorder").first().click();

    await expect(page).toHaveURL(/cart\.html$/, { timeout: 10000 });
    await expect(page.locator("#cart-list-body tr")).toHaveCount(2);
    // 既存カート(P001 x4) + 再注文(P001 x2, P002 x3)
    await expectCartQty(page, "P001", 6);
    await expectCartQty(page, "P002", 3);

    await fillOrderForm(page, "再注文");
    await page.click("#place-order-btn");
    await expect(page).toHaveURL(/products\.html$/, { timeout: 15000 });
});
