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
    seedBaseData
} = require("../helpers/testSandbox");

function loadAppWithEnv(envPatch) {
    const originalEnv = { ...process.env };
    process.env = { ...process.env, ...envPatch };
    jest.resetModules();
    const { app } = require("../../server");
    process.env = originalEnv;
    return app;
}

describe("Sランク: セッションCookieセキュリティ属性", () => {
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

    test("Cookieに httpOnly / sameSite=lax / weborder.sid が設定される", async () => {
        const app = loadAppWithEnv({ NODE_ENV: "test" });
        const login = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });

        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const cookies = login.headers["set-cookie"] || [];
        const sidCookie = cookies.find((c) => c.startsWith("weborder.sid="));
        expect(sidCookie).toBeTruthy();
        expect(sidCookie).toContain("HttpOnly");
        expect(sidCookie).toContain("SameSite=Lax");
        expect(sidCookie).not.toContain("Secure");
    });

    test("本番環境では Cookie に Secure が付与される", async () => {
        const app = loadAppWithEnv({
            NODE_ENV: "production",
            SESSION_SECRET: "test-production-secret",
            TRUST_PROXY: "1"
        });
        const login = await request(app)
            .post("/api/login")
            .set("X-Forwarded-Proto", "https")
            .send({ id: "TEST001", pass: "CustPass123!" });

        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const cookies = login.headers["set-cookie"] || [];
        const sidCookie = cookies.find((c) => c.startsWith("weborder.sid="));
        expect(sidCookie).toBeTruthy();
        expect(sidCookie).toContain("HttpOnly");
        expect(sidCookie).toContain("SameSite=Lax");
        expect(sidCookie).toContain("Secure");
    });
});
