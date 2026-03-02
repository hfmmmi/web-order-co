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

describe("Aランク: 代理ログイン申請の10分期限切れ詳細", () => {
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

    test("期限切れ後の status は none になり、申請データが削除される", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });

        const requests = await readJson("proxy_requests.json");
        requests.TEST001.requestedAt = Date.now() - (11 * 60 * 1000);
        await writeJson("proxy_requests.json", requests);

        const status = await adminAgent.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(status.statusCode).toBe(200);
        expect(status.body.status).toBe("none");

        const after = await readJson("proxy_requests.json");
        expect(after.TEST001).toBeUndefined();
    });

    test("期限切れ後の顧客 approve は拒否される", async () => {
        const adminAgent = request.agent(app);
        const customerAgent = request.agent(app);

        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });

        const requests = await readJson("proxy_requests.json");
        requests.TEST001.requestedAt = Date.now() - (11 * 60 * 1000);
        await writeJson("proxy_requests.json", requests);

        const approve = await customerAgent.post("/api/account/proxy-request/approve").send({});
        expect(approve.statusCode).toBe(200);
        expect(approve.body.success).toBe(false);
        expect(approve.body.message).toContain("有効期限");

        const after = await readJson("proxy_requests.json");
        expect(after.TEST001).toBeUndefined();
    });

    test("期限切れ後の proxy-login 実行は拒否される", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });

        const requests = await readJson("proxy_requests.json");
        requests.TEST001.approved = true;
        requests.TEST001.requestedAt = Date.now() - (11 * 60 * 1000);
        await writeJson("proxy_requests.json", requests);

        const proxyLogin = await adminAgent.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(proxyLogin.statusCode).toBe(200);
        expect(proxyLogin.body.success).toBe(false);
        expect(proxyLogin.body.message).toContain("有効期限");

        const after = await readJson("proxy_requests.json");
        expect(after.TEST001).toBeUndefined();
    });
});
