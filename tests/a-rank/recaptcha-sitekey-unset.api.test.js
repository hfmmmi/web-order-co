/**
 * reCAPTCHA 未設定時: 公開APIに recaptchaSiteKey は含まれるが空・secret は含まれない
 * npm run test:api / test:all で実行
 */
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
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Aランク: reCAPTCHA 未設定時の公開API", () => {
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

    test("GET /api/settings/public は recaptcha 未設定時も recaptchaSiteKey を返し、secret は含まない", async () => {
        const settings = await readJson("settings.json");
        settings.recaptcha = { siteKey: "", secretKey: "" };
        await writeJson("settings.json", settings);

        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("recaptchaSiteKey");
        expect(res.body.recaptchaSiteKey).toBe("");
        expect(res.body.recaptchaSecretKey).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toMatch(/secretKey|secret/);
    });

    test("GET /api/settings/public は recaptcha キーが無くても 200 で features を返す", async () => {
        const settings = await readJson("settings.json");
        delete settings.recaptcha;
        await writeJson("settings.json", settings);

        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.features).toBeDefined();
        expect(res.body.recaptchaSiteKey).toBe("");
    });
});
