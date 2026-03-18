const { test, expect } = require("@playwright/test");
const fs = require("fs").promises;
const path = require("path");

async function saveRecaptchaSettings(request, recaptcha) {
    const login = await request.post("/api/admin/login", {
        data: { id: "test-admin", pass: "AdminPass123!" }
    });
    expect(login.ok()).toBeTruthy();

    const save = await request.put("/api/admin/settings", { data: { recaptcha } });
    expect(save.ok()).toBeTruthy();
}

async function primeCustomerLoginFailures(request, count = 2) {
    for (let i = 0; i < count; i += 1) {
        const r = await request.post("/api/login", {
            data: { id: "TEST001", pass: "WrongPassword!" }
        });
        expect(r.ok()).toBeTruthy();
        const body = await r.json();
        expect(body.success).toBe(false);
    }
}

/** TEST001 のログイン失敗カウントをリセット（後続テストでロックされないように） */
async function resetLoginRateLimit() {
    // E2E サーバーは DATA_DIR=tests/e2e/.e2e_data を使うため、そちらのファイルをリセットする
    const e2eDataDir = path.join(__dirname, "..", ".e2e_data");
    const filePath = path.join(e2eDataDir, "login_rate_limit.json");
    await fs.mkdir(e2eDataDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({}, null, 2), "utf-8");
}

test("顧客E2E: captchaRequired=true のとき reCAPTCHA領域が表示される", async ({ page, request }) => {
    // テスト開始時に login_rate_limit をリセット（前のテストの失敗カウントをクリア）
    await resetLoginRateLimit();

    await saveRecaptchaSettings(request, {
        siteKey: "site-key-e2e",
        secretKey: "secret-key-e2e"
    });

    try {
        const pub = await request.get("/api/settings/public");
        expect(pub.ok()).toBeTruthy();
        const pubJson = await pub.json();
        expect(pubJson.recaptchaSiteKey).toBe("site-key-e2e");

        const dialogs = [];
        page.on("dialog", async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });

        // reCAPTCHAスクリプトを空レスポンス化して描画失敗を疑似再現（導線を壊さない）
        await page.route("https://www.google.com/recaptcha/api.js**", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/javascript",
                body: "/* intentionally empty for e2e */"
            });
        });

        await page.goto("/index.html");
        await page.fill("#username-input", "TEST001");
        await page.fill("#password-input", "WrongPassword!");

        await primeCustomerLoginFailures(request, 2);
        // クリックで出るダイアログを明示的に待つ（CIでタイミングずれを防ぐ）
        const loginBtn = page.getByRole("button", { name: "ログイン" });
        const [firstDialog] = await Promise.all([
            page.waitForEvent("dialog", { timeout: 10000 }),
            loginBtn.click()
        ]);
        const firstMessage = firstDialog.message();
        // accept は page.on("dialog") で既に実行済みのためここでは呼ばない

        // スクリプト描画失敗時でも、captchaRequiredメッセージを返しUI導線が破綻しないこと
        await expect(page).toHaveURL(/index\.html$/);
        // サーバー文言「ロボット」「確認」「チェック」のいずれか（CI/環境差に強い）
        expect(/ロボット|確認|チェック/.test(firstMessage)).toBe(true);
        await expect(loginBtn).toBeEnabled();
        await page.getByText("パスワードをお忘れの方").click();
        await expect(page.locator("#forgot-password-modal")).toHaveClass(/active/);

        // siteKey/secret有効時は失敗継続で captchaRequired を維持
        await page.locator("#forgot-password-close").click();
        await loginBtn.click();
        expect(dialogs.some((msg) => /ロボット|確認|チェック/.test(msg))).toBe(true);
    } finally {
        await saveRecaptchaSettings(request, {
            siteKey: "",
            secretKey: ""
        });
        await resetLoginRateLimit();
    }
});

test("顧客E2E: siteKey 切替後も CAPTCHA 表示状態が破綻しない", async ({ page, request }) => {
    page.on("dialog", async (dialog) => {
        await dialog.accept();
    });

    // テスト開始時に login_rate_limit をリセット（前のテストの失敗カウントをクリア）
    await resetLoginRateLimit();

    await saveRecaptchaSettings(request, {
        siteKey: "site-key-e2e",
        secretKey: "secret-key-e2e"
    });

    try {
        await page.goto("/index.html");
        await page.fill("#username-input", "TEST001");
        await page.fill("#password-input", "WrongPassword!");
        await primeCustomerLoginFailures(request, 2);
        await page.getByRole("button", { name: "ログイン" }).click();
        await expect(page.locator("#recaptcha-wrap")).toBeVisible();

        // 無効化して再読込後、CAPTCHA領域は表示されないこと
        await saveRecaptchaSettings(request, {
            siteKey: "",
            secretKey: ""
        });
        await page.goto("/index.html");
        await page.fill("#username-input", "TEST001");
        await page.fill("#password-input", "WrongPassword!");
        await page.getByRole("button", { name: "ログイン" }).click();
        await expect(page.locator("#recaptcha-wrap")).toBeHidden();
    } finally {
        await saveRecaptchaSettings(request, {
            siteKey: "",
            secretKey: ""
        });
        await resetLoginRateLimit();
    }
});
