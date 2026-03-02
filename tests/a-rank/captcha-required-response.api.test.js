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
    writeJson
} = require("../helpers/testSandbox");

describe("Aランク: CAPTCHA要求レスポンス", () => {
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

    test("失敗2回後、secretKeyありならcaptchaRequired=trueが返る", async () => {
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

        const third = await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });
        expect(third.statusCode).toBe(200);
        expect(third.body.success).toBe(false);
        expect(third.body.captchaRequired).toBe(true);
    });

    test("siteKey/secretKey が空なら失敗3回目でもcaptchaRequiredは返らない", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await adminAgent.put("/api/admin/settings").send({
            recaptcha: {
                siteKey: "",
                secretKey: ""
            }
        });

        await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });
        await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });
        const third = await request(app).post("/api/login").send({ id: "TEST002", pass: "WrongPassword!" });

        expect(third.statusCode).toBe(200);
        expect(third.body.success).toBe(false);
        expect(third.body.captchaRequired).toBeUndefined();
    });
});
