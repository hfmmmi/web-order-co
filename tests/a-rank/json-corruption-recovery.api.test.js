jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const fs = require("fs").promises;
const path = require("path");
const { DATA_ROOT } = require("../../dbPaths");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson
} = require("../helpers/testSandbox");

describe("Aランク: JSON破損時の復旧耐性", () => {
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

    test("login_rate_limit.json が破損していても failed login 記録で再生成できる", async () => {
        const filePath = path.join(DATA_ROOT, "login_rate_limit.json");
        await fs.writeFile(filePath, "{broken-json", "utf-8");

        const failed = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "WrongPassword!" });

        expect(failed.statusCode).toBe(200);
        expect(failed.body.success).toBe(false);

        const rate = await readJson("login_rate_limit.json");
        expect(rate).toEqual(expect.any(Object));
        expect(rate["customer:TEST001"]).toEqual(expect.any(Object));
        expect(Array.isArray(rate["customer:TEST001"].attempts)).toBe(true);
        expect(rate["customer:TEST001"].attempts.length).toBe(1);
    });

    test("reset_tokens.json が破損していても request-password-reset 実行で再生成できる", async () => {
        const filePath = path.join(DATA_ROOT, "reset_tokens.json");
        await fs.writeFile(filePath, "{broken-json", "utf-8");

        const res = await request(app)
            .post("/api/request-password-reset")
            .send({ id: "TEST001" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        const tokens = await readJson("reset_tokens.json");
        expect(tokens).toEqual(expect.any(Object));
        expect(tokens.TEST001).toEqual(expect.any(Object));
        expect(typeof tokens.TEST001.token).toBe("string");
        expect(tokens.TEST001.expiresAt).toBeGreaterThan(Date.now());
    });

    test("proxy_requests.json が破損していても status確認と再申請で復旧できる", async () => {
        const filePath = path.join(DATA_ROOT, "proxy_requests.json");
        await fs.writeFile(filePath, "{broken-json", "utf-8");

        const admin = request.agent(app);
        const adminLogin = await admin
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.statusCode).toBe(200);
        expect(adminLogin.body.success).toBe(true);

        const status = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(status.statusCode).toBe(200);
        expect(status.body.status).toBe("none");

        const requestRes = await admin
            .post("/api/admin/proxy-request")
            .send({ customerId: "TEST001" });
        expect(requestRes.statusCode).toBe(200);
        expect(requestRes.body.success).toBe(true);

        const requests = await readJson("proxy_requests.json");
        expect(requests).toEqual(expect.any(Object));
        expect(requests.TEST001).toEqual(expect.objectContaining({
            approved: false
        }));
    });
});
