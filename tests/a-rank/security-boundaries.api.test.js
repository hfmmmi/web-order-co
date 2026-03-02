jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Aランク: セキュリティ境界", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("代理ログイン申請は10分を超えると無効化される", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const reqRes = await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        expect(reqRes.statusCode).toBe(200);
        expect(reqRes.body.success).toBe(true);

        const requests = await readJson("proxy_requests.json");
        requests.TEST001.requestedAt = Date.now() - (11 * 60 * 1000);
        await writeJson("proxy_requests.json", requests);

        const status = await adminAgent.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(status.statusCode).toBe(200);
        expect(status.body.status).toBe("none");

        const after = await readJson("proxy_requests.json");
        expect(after.TEST001).toBeUndefined();
    });

    test("招待メール送信APIはtokenを保存し成功応答を返す", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const res = await adminAgent
            .post("/api/admin/send-invite-email")
            .send({ customerId: "TEST001", isPasswordReset: false });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        const tokens = await readJson("invite_tokens.json");
        expect(typeof tokens.TEST001).toBe("number");
        expect(tokens.TEST001).toBeGreaterThan(Date.now());
    });

    test("settings/public は secretKey を公開しない", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await adminAgent.put("/api/admin/settings").send({
            recaptcha: {
                siteKey: "public-site-key",
                secretKey: "private-secret-key"
            }
        });

        const pub = await request(app).get("/api/settings/public");
        expect(pub.statusCode).toBe(200);
        expect(pub.body.recaptchaSiteKey).toBe("public-site-key");
        expect(pub.body.recaptchaSecretKey).toBeUndefined();
        expect(JSON.stringify(pub.body)).not.toContain("private-secret-key");
    });
});
