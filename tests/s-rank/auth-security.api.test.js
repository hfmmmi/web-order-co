jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Sランク: 認証セキュリティAPI", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
    });

    test("顧客ログインは6回目でロックメッセージが返る", async () => {
        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post("/api/login")
                .send({ id: "TEST001", pass: "WrongPassword!" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("IDまたはPASS");
        }

        const locked = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "WrongPassword!" });

        expect(locked.statusCode).toBe(200);
        expect(locked.body.success).toBe(false);
        expect(locked.body.message).toContain("15分後");
    });

    test("管理者ログインも6回目でロックメッセージが返る", async () => {
        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post("/api/admin/login")
                .send({ id: "test-admin", pass: "WrongPassword!" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        }

        const locked = await request(app)
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "WrongPassword!" });

        expect(locked.statusCode).toBe(200);
        expect(locked.body.success).toBe(false);
        expect(locked.body.message).toContain("15分後");
    });

    test("失敗2回後はcaptchaRequired=trueが返る（secretKey設定時）", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const saveRecaptcha = await adminAgent.put("/api/admin/settings").send({
            recaptcha: {
                siteKey: "site-key-test",
                secretKey: "secret-key-test"
            }
        });
        expect(saveRecaptcha.statusCode).toBe(200);
        expect(saveRecaptcha.body.success).toBe(true);

        await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });
        await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });

        const third = await request(app)
            .post("/api/login")
            .send({ id: "TEST002", pass: "WrongPassword!" });

        expect(third.statusCode).toBe(200);
        expect(third.body.success).toBe(false);
        expect(third.body.captchaRequired).toBe(true);
    });

    test("request-password-resetは同一IPで15分5回までに制限される", async () => {
        for (let i = 0; i < 6; i += 1) {
            const res = await request(app)
                .post("/api/request-password-reset")
                .send({ id: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        }

        const rate = await readJson("reset_rate_limit.json");
        const firstIp = Object.keys(rate)[0];
        expect(firstIp).toBeTruthy();
        expect(rate[firstIp].length).toBe(5);
    });

    test("setupのリセットトークンは期限切れと1回使用を制御できる", async () => {
        const expiredToken = { TEST001: { token: "expired-token", expiresAt: Date.now() - 1000 } };
        await writeJson("reset_tokens.json", expiredToken);

        const expired = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: "expired-token", newPass: "NewPass123!" });

        expect(expired.statusCode).toBe(200);
        expect(expired.body.success).toBe(false);
        expect(expired.body.message).toContain("有効期限");

        const validToken = { TEST001: { token: "valid-token", expiresAt: Date.now() + 3600_000 } };
        await writeJson("reset_tokens.json", validToken);

        const ok = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: "valid-token", newPass: "NewPass123!" });

        expect(ok.statusCode).toBe(200);
        expect(ok.body.success).toBe(true);

        const reused = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: "valid-token", newPass: "AnotherPass123!" });

        expect(reused.statusCode).toBe(200);
        expect(reused.body.success).toBe(false);
    });
});
