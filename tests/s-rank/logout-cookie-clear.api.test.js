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

function findSidCookie(setCookieHeader) {
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [];
    return cookies.find((c) => c.startsWith("weborder.sid=")) || "";
}

describe("Sランク: ログアウト時のCookieクリア", () => {
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

    test("顧客のみログイン時の /api/logout は weborder.sid を失効させる", async () => {
        const agent = request.agent(app);
        const login = await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const logout = await agent.post("/api/logout").send({});
        expect(logout.statusCode).toBe(200);
        expect(logout.body.success).toBe(true);

        const sidCookie = findSidCookie(logout.headers["set-cookie"]);
        expect(sidCookie).toContain("weborder.sid=");
        expect(sidCookie).toContain("Expires=");
    });

    test("管理者のみログイン時の /api/admin/logout は weborder.sid を失効させる", async () => {
        const agent = request.agent(app);
        const login = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const logout = await agent.post("/api/admin/logout").send({});
        expect(logout.statusCode).toBe(200);
        expect(logout.body.success).toBe(true);

        const sidCookie = findSidCookie(logout.headers["set-cookie"]);
        expect(sidCookie).toContain("weborder.sid=");
        expect(sidCookie).toContain("Expires=");
    });
});
