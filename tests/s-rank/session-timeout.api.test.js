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

describe("Sランク: セッション120分タイムアウト", () => {
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
        fakeNow = Date.UTC(2026, 0, 1, 0, 0, 0);
        nowSpy = jest.spyOn(Date, "now").mockImplementation(() => fakeNow);
    });

    afterEach(() => {
        nowSpy.mockRestore();
    });

    test("顧客ログインは 119:59 で有効・120:00+ で失効し、その後未認証状態を維持する", async () => {
        const agent = request.agent(app);

        const login = await agent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        // 境界値: 119:59 はセッション有効
        fakeNow += (120 * 60 * 1000) - 1000;
        const aliveAtBoundary = await agent.get("/api/session");
        expect(aliveAtBoundary.statusCode).toBe(200);
        expect(aliveAtBoundary.body.loggedIn).toBe(true);
        expect(aliveAtBoundary.body.customerId).toBe("TEST001");

        // スライディング更新後、再度 120:00 を超えると失効
        fakeNow += (120 * 60 * 1000) + 1;

        const expired = await agent.get("/api/session");
        expect(expired.statusCode).toBe(401);
        expect(expired.body.success).toBe(false);
        expect(expired.body.message).toBe("再ログインが必要です。");

        const after = await agent.get("/api/session");
        expect(after.statusCode).toBe(200);
        expect(after.body.loggedIn).toBe(false);
        expect(after.body.customerId).toBeNull();
    });

    test("顧客/管理者同居セッションは 120:00+ でまとめて失効し、再ログイン時に副作用を残さない", async () => {
        const agent = request.agent(app);

        const customerLogin = await agent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(customerLogin.statusCode).toBe(200);
        expect(customerLogin.body.success).toBe(true);

        const adminLogin = await agent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.statusCode).toBe(200);
        expect(adminLogin.body.success).toBe(true);

        // 同居セッション中は双方にアクセス可能
        const beforeExpireSession = await agent.get("/api/session");
        expect(beforeExpireSession.statusCode).toBe(200);
        expect(beforeExpireSession.body.loggedIn).toBe(true);
        expect(beforeExpireSession.body.customerId).toBe("TEST001");
        const beforeExpireAdmin = await agent.get("/api/admin/settings");
        expect(beforeExpireAdmin.statusCode).toBe(200);

        fakeNow += (120 * 60 * 1000) + 1;

        const expired = await agent.get("/api/admin/settings");
        expect(expired.statusCode).toBe(401);
        expect(expired.body.success).toBe(false);
        expect(expired.body.message).toBe("再ログインが必要です。");

        const after = await agent.get("/api/admin/settings");
        expect(after.statusCode).toBe(401);
        expect(after.body.message).toContain("管理者権限");

        const afterSession = await agent.get("/api/session");
        expect(afterSession.statusCode).toBe(200);
        expect(afterSession.body.loggedIn).toBe(false);
        expect(afterSession.body.customerId).toBeNull();
        expect(afterSession.body.proxyByAdmin).toBeNull();

        // 失効後に顧客として再ログインしても管理者状態が復活しない
        const relogin = await agent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(relogin.statusCode).toBe(200);
        expect(relogin.body.success).toBe(true);

        const reloginSession = await agent.get("/api/session");
        expect(reloginSession.statusCode).toBe(200);
        expect(reloginSession.body.loggedIn).toBe(true);
        expect(reloginSession.body.customerId).toBe("TEST001");

        const adminCheck = await agent.get("/api/admin/check");
        expect(adminCheck.statusCode).toBe(200);
        expect(adminCheck.body.loggedIn).toBe(false);
    });
});
