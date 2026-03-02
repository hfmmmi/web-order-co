/**
 * Phase1: auth-api の verifyRecaptcha が false を返す分岐をカバーするテスト
 * https をモックして siteverify のレスポンスを { success: false } にする
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock("https", () => ({
    request: jest.fn((_opts, callback) => {
        setImmediate(() => {
            const res = {
                on: jest.fn((ev, fn) => {
                    if (ev === "data") fn('{"success":false}');
                    if (ev === "end") setImmediate(fn);
                    return res;
                })
            };
            callback(res);
        });
        return {
            on: jest.fn(),
            setTimeout: jest.fn(),
            write: jest.fn(),
            end: jest.fn()
        };
    })
}));

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    writeJson
} = require("../helpers/testSandbox");

describe("Aランク: auth-api CAPTCHA検証失敗分岐", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
    });

    test("失敗2回後、不正なcaptchaToken送信時はLOGIN_CAPTCHA_FAILED_MESSAGEを返す", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await adminAgent.put("/api/admin/settings").send({
            recaptcha: {
                siteKey: "site-key-test",
                secretKey: "secret-key-test"
            }
        });

        await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });
        await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });

        const third = await request(app).post("/api/login").send({
            id: "TEST002",
            pass: "WrongPassword!",
            captchaToken: "invalid-token-from-mock"
        });
        expect(third.statusCode).toBe(200);
        expect(third.body.success).toBe(false);
        expect(third.body.captchaRequired).toBe(true);
        expect(third.body.message).toContain("確認に失敗しました");
    });
});
