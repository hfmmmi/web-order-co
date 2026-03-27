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

describe("Aランク: server.js 環境差分挙動", () => {
    jest.setTimeout(120000);

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

    test("本番で TRUST_PROXY 無効時は Secure Cookie が発行されない", async () => {
        const os = require("os");
        const path = require("path");
        const app = loadAppWithEnv({
            NODE_ENV: "production",
            TRUST_PROXY: "",
            SESSION_SECRET: "test-secret-prod",
            SESSION_PATH: path.join(os.tmpdir(), `jest-prod-sess-${Date.now()}`)
        });

        const login = await request(app)
            .post("/api/login")
            .set("X-Forwarded-Proto", "https")
            .send({ id: "TEST001", pass: "CustPass123!" });

        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const cookies = login.headers["set-cookie"] || [];
        const sidCookie = cookies.find((c) => c.startsWith("weborder.sid="));
        expect(sidCookie).toBeUndefined();
    }, 30000);

    test("ALLOWED_ORIGINS は空白混在でもtrimして許可判定する", async () => {
        const app = loadAppWithEnv({
            ALLOWED_ORIGINS: " https://a.example.com , https://b.example.com ,https://a.example.com "
        });

        const allowedA = await request(app)
            .get("/api/settings/public")
            .set("Origin", "https://a.example.com");
        expect(allowedA.statusCode).toBe(200);
        expect(allowedA.headers["access-control-allow-origin"]).toBe("https://a.example.com");

        const allowedB = await request(app)
            .get("/api/settings/public")
            .set("Origin", "https://b.example.com");
        expect(allowedB.statusCode).toBe(200);
        expect(allowedB.headers["access-control-allow-origin"]).toBe("https://b.example.com");

        const denied = await request(app)
            .get("/api/settings/public")
            .set("Origin", "https://c.example.com");
        expect(denied.statusCode).toBe(403);
    });

    test("本番で MAIL_PASSWORD 未設定時は getMailConfig が必須エラーを投げる", async () => {
        const origEnv = {
            NODE_ENV: process.env.NODE_ENV,
            MAIL_PASSWORD: process.env.MAIL_PASSWORD
        };
        try {
            process.env.NODE_ENV = "production";
            delete process.env.MAIL_PASSWORD;
            jest.resetModules();
            const settingsService = require("../../services/settingsService");
            await expect(settingsService.getMailConfig()).rejects.toThrow(
                "本番環境では MAIL_PASSWORD の設定が必須です"
            );
        } finally {
            process.env.NODE_ENV = origEnv.NODE_ENV;
            if (origEnv.MAIL_PASSWORD !== undefined) {
                process.env.MAIL_PASSWORD = origEnv.MAIL_PASSWORD;
            } else {
                delete process.env.MAIL_PASSWORD;
            }
            jest.resetModules();
        }
    });
});
