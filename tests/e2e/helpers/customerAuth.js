const { expect } = require("@playwright/test");

/** 顧客ログイン後は home.html へ遷移する（API redirectUrl / script.js successUrl） */
async function loginAsCustomer(page, credentials = { id: "test001@example.com", pass: "CustPass123!" }) {
    await page.goto("/index.html");
    await page.fill("#username-input", credentials.id);
    await page.fill("#password-input", credentials.pass);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/home\.html$/);
}

async function openProductsPage(page) {
    await page.goto("/products.html");
    await expect(page).toHaveURL(/products\.html$/);
}

async function openHistoryPage(page) {
    await page.goto("/history.html");
    await expect(page).toHaveURL(/history\.html$/);
}

module.exports = { loginAsCustomer, openProductsPage, openHistoryPage };
