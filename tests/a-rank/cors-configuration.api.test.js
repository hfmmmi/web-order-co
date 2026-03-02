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

describe("Aランク: CORS許可リスト挙動", () => {
    let backup;

    jest.setTimeout(15000);

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("ALLOWED_ORIGINS 未設定時は Access-Control-Allow-Origin を返さない", async () => {
        const app = loadAppWithEnv({ ALLOWED_ORIGINS: "" });
        const res = await request(app)
            .get("/api/settings/public")
            .set("Origin", "https://evil.example");

        expect(res.statusCode).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    test("許可Originのみ許可し、未許可Originは403で拒否する", async () => {
        const app = loadAppWithEnv({ ALLOWED_ORIGINS: "https://good.example, https://app.example" });

        const allowed = await request(app)
            .get("/api/settings/public")
            .set("Origin", "https://good.example");
        expect(allowed.statusCode).toBe(200);
        expect(allowed.headers["access-control-allow-origin"]).toBe("https://good.example");
        expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

        const denied = await request(app)
            .get("/api/settings/public")
            .set("Origin", "https://evil.example");
        expect(denied.statusCode).toBe(403);
        expect(denied.body.success).toBe(false);
        expect(denied.body.message).toContain("CORS origin is not allowed");
    });

    test("許可Originの preflight(OPTIONS) は 204 と必要ヘッダーを返す", async () => {
        const app = loadAppWithEnv({ ALLOWED_ORIGINS: "https://good.example" });

        const preflight = await request(app)
            .options("/api/settings/public")
            .set("Origin", "https://good.example")
            .set("Access-Control-Request-Method", "GET");

        expect(preflight.statusCode).toBe(204);
        expect(preflight.headers["access-control-allow-origin"]).toBe("https://good.example");
        expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
        expect(preflight.headers["access-control-allow-methods"]).toContain("GET");
    });
});
