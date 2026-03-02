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

function extractSid(setCookieHeader) {
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [];
    const raw = cookies.find((c) => c.startsWith("weborder.sid="));
    if (!raw) return "";
    return raw.split(";")[0];
}

describe("Sランク: セッション固定化対策とレート制限境界", () => {
    let backup;
    let nowSpy;
    let fakeNow;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
        fakeNow = Date.UTC(2026, 0, 1, 0, 0, 0);
        nowSpy = jest.spyOn(Date, "now").mockImplementation(() => fakeNow);
    });

    afterEach(() => {
        nowSpy.mockRestore();
    });

    test("顧客ログイン後に管理者ログインするとセッションIDがローテーションされる", async () => {
        const agent = request.agent(app);

        const customerLogin = await agent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(customerLogin.statusCode).toBe(200);
        expect(customerLogin.body.success).toBe(true);
        const sidAfterCustomerLogin = extractSid(customerLogin.headers["set-cookie"]);
        expect(sidAfterCustomerLogin).toContain("weborder.sid=");

        const adminLogin = await agent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.statusCode).toBe(200);
        expect(adminLogin.body.success).toBe(true);
        const sidAfterAdminLogin = extractSid(adminLogin.headers["set-cookie"]);
        expect(sidAfterAdminLogin).toContain("weborder.sid=");
        expect(sidAfterAdminLogin).not.toBe(sidAfterCustomerLogin);

        const session = await agent.get("/api/session");
        expect(session.statusCode).toBe(200);
        expect(session.body.loggedIn).toBe(true);
        expect(session.body.customerId).toBe("TEST001");

        const adminCheck = await agent.get("/api/admin/check");
        expect(adminCheck.statusCode).toBe(200);
        expect(adminCheck.body.loggedIn).toBe(true);
    });

    test("管理者ログイン後に顧客ログインするとセッションIDがローテーションされる", async () => {
        const agent = request.agent(app);

        const adminLogin = await agent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.statusCode).toBe(200);
        expect(adminLogin.body.success).toBe(true);
        const sidAfterAdminLogin = extractSid(adminLogin.headers["set-cookie"]);
        expect(sidAfterAdminLogin).toContain("weborder.sid=");

        const customerLogin = await agent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(customerLogin.statusCode).toBe(200);
        expect(customerLogin.body.success).toBe(true);
        const sidAfterCustomerLogin = extractSid(customerLogin.headers["set-cookie"]);
        expect(sidAfterCustomerLogin).toContain("weborder.sid=");
        expect(sidAfterCustomerLogin).not.toBe(sidAfterAdminLogin);

        const session = await agent.get("/api/session");
        expect(session.statusCode).toBe(200);
        expect(session.body.loggedIn).toBe(true);
        expect(session.body.customerId).toBe("TEST001");

        const adminCheck = await agent.get("/api/admin/check");
        expect(adminCheck.statusCode).toBe(200);
        expect(adminCheck.body.loggedIn).toBe(true);
    });

    test("代理ログイン実行時にセッションIDがローテーションされる", async () => {
        const adminAgent = request.agent(app);
        const customerAgent = request.agent(app);

        const adminLogin = await adminAgent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.statusCode).toBe(200);
        expect(adminLogin.body.success).toBe(true);
        const sidAfterAdminLogin = extractSid(adminLogin.headers["set-cookie"]);
        expect(sidAfterAdminLogin).toContain("weborder.sid=");

        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        await customerAgent.post("/api/account/proxy-request/approve").send({});

        const proxyLogin = await adminAgent
            .post("/api/admin/proxy-login")
            .send({ customerId: "TEST001" });
        expect(proxyLogin.statusCode).toBe(200);
        expect(proxyLogin.body.success).toBe(true);
        const sidAfterProxyLogin = extractSid(proxyLogin.headers["set-cookie"]);
        expect(sidAfterProxyLogin).toContain("weborder.sid=");
        expect(sidAfterProxyLogin).not.toBe(sidAfterAdminLogin);

        const session = await adminAgent.get("/api/session");
        expect(session.statusCode).toBe(200);
        expect(session.body.loggedIn).toBe(true);
        expect(session.body.customerId).toBe("TEST001");
        expect(session.body.proxyByAdmin).toBeTruthy();
    });

    test("ログイン失敗ロックは 14:59 で継続し 15:00 で解除される", async () => {
        for (let i = 0; i < 5; i += 1) {
            const fail = await request(app)
                .post("/api/login")
                .send({ id: "TEST001", pass: "WrongPassword!" });
            expect(fail.statusCode).toBe(200);
            expect(fail.body.success).toBe(false);
        }

        fakeNow += (15 * 60 * 1000) - 1000;
        const stillLocked = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(stillLocked.statusCode).toBe(200);
        expect(stillLocked.body.success).toBe(false);
        expect(stillLocked.body.message).toContain("15分後");

        fakeNow += 1000;
        const unlocked = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(unlocked.statusCode).toBe(200);
        expect(unlocked.body.success).toBe(true);
    });

    test("再設定申込レート制限は 14:59 で維持され 15:00 で再計測される", async () => {
        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post("/api/request-password-reset")
                .send({ id: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        }

        fakeNow += (15 * 60 * 1000) - 1000;
        await request(app).post("/api/request-password-reset").send({ id: "TEST001" });
        const beforeBoundary = await readJson("reset_rate_limit.json");
        const ip = Object.keys(beforeBoundary)[0];
        expect(ip).toBeTruthy();
        expect(beforeBoundary[ip]).toHaveLength(5);

        fakeNow += 1000;
        await request(app).post("/api/request-password-reset").send({ id: "TEST001" });
        const afterBoundary = await readJson("reset_rate_limit.json");
        const nextIp = Object.keys(afterBoundary)[0];
        expect(nextIp).toBeTruthy();
        expect(afterBoundary[nextIp]).toHaveLength(1);
    });
});
