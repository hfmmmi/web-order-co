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
    readJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("リスク駆動: 回帰抑止テスト", () => {
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

    test("reCAPTCHA secretKey は空保存時に既存値を維持する", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await admin.put("/api/admin/settings").send({
            recaptcha: { siteKey: "site-A", secretKey: "secret-A" }
        });

        const update = await admin.put("/api/admin/settings").send({
            recaptcha: { siteKey: "site-B", secretKey: "" }
        });
        expect(update.statusCode).toBe(200);
        expect(update.body.success).toBe(true);

        const settings = await readJson("settings.json");
        expect(settings.recaptcha.siteKey).toBe("site-B");
        expect(settings.recaptcha.secretKey).toBe("secret-A");
    });

    test("features false は public settings に反映される", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await admin.put("/api/admin/settings").send({
            features: {
                support: false,
                announcements: false,
                orders: true
            }
        });

        const pub = await request(app).get("/api/settings/public");
        expect(pub.statusCode).toBe(200);
        expect(pub.body.features.support).toBe(false);
        expect(pub.body.features.announcements).toBe(false);
        expect(pub.body.features.orders).toBe(true);
    });
});
