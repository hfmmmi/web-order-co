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
    seedBaseData
} = require("../helpers/testSandbox");

describe("Aランク: proxy-logout 復元挙動", () => {
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

    test("代理前に顧客ログイン済みなら proxy-logout で復元される", async () => {
        const adminAgent = request.agent(app);
        const targetCustomerAgent = request.agent(app);

        await adminAgent.post("/api/login").send({ id: "TEST002", pass: "CustPass123!" });
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        await targetCustomerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        await targetCustomerAgent.post("/api/account/proxy-request/approve").send({});

        const proxyLogin = await adminAgent.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(proxyLogin.statusCode).toBe(200);
        expect(proxyLogin.body.success).toBe(true);

        const during = await adminAgent.get("/api/session");
        expect(during.statusCode).toBe(200);
        expect(during.body.loggedIn).toBe(true);
        expect(during.body.customerId).toBe("TEST001");
        expect(during.body.proxyByAdmin).toBeTruthy();

        const proxyLogout = await adminAgent.post("/api/admin/proxy-logout").send({});
        expect(proxyLogout.statusCode).toBe(200);
        expect(proxyLogout.body.success).toBe(true);

        const after = await adminAgent.get("/api/session");
        expect(after.statusCode).toBe(200);
        expect(after.body.loggedIn).toBe(true);
        expect(after.body.customerId).toBe("TEST002");
        expect(after.body.proxyByAdmin).toBeNull();

        const adminCheck = await adminAgent.get("/api/admin/check");
        expect(adminCheck.statusCode).toBe(200);
        expect(adminCheck.body.loggedIn).toBe(true);
    });

    test("代理前に顧客ログインが無ければ proxy-logout 後は顧客未ログインになる", async () => {
        const adminAgent = request.agent(app);
        const targetCustomerAgent = request.agent(app);

        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await targetCustomerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        await targetCustomerAgent.post("/api/account/proxy-request/approve").send({});

        const proxyLogin = await adminAgent.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(proxyLogin.body.success).toBe(true);

        const proxyLogout = await adminAgent.post("/api/admin/proxy-logout").send({});
        expect(proxyLogout.statusCode).toBe(200);
        expect(proxyLogout.body.success).toBe(true);

        const after = await adminAgent.get("/api/session");
        expect(after.statusCode).toBe(200);
        expect(after.body.loggedIn).toBe(false);
        expect(after.body.customerId).toBeNull();
        expect(after.body.proxyByAdmin).toBeNull();

        const adminCheck = await adminAgent.get("/api/admin/check");
        expect(adminCheck.body.loggedIn).toBe(true);
    });
});
