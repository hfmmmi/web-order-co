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

describe("Aランク: CSPヘッダー", () => {
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

    test("settings/public レスポンスに必要なCSPディレクティブが含まれる", async () => {
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);

        const csp = res.headers["content-security-policy"];
        expect(typeof csp).toBe("string");
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com");
        expect(csp).toContain("script-src-attr 'unsafe-inline'");
        expect(csp).toContain("frame-src 'self' https://www.google.com https://www.recaptcha.net");
        expect(csp).toContain("style-src 'self' 'unsafe-inline'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).toContain("img-src 'self' data:");
        expect(csp).toContain("font-src 'self'");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("form-action 'self'");
    });
});
