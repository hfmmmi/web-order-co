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

describe("Aランク: /api/settings/public レスポンス契約", () => {
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

    test("public settings は契約フィールドのみを返し型が安定している", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await admin.put("/api/admin/settings").send({
            features: {
                orders: true,
                support: false,
                announcements: true
            },
            recaptcha: {
                siteKey: "public-site-key",
                secretKey: "private-secret-key"
            },
            announcements: [
                {
                    id: "order-a",
                    title: "配送遅延",
                    body: "遅延のお知らせ",
                    type: "warning",
                    target: "customer",
                    category: "order",
                    enabled: true,
                    startDate: null,
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "general-a",
                    title: "一般告知",
                    body: "定期メンテ",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: null,
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                }
            ]
        });

        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);

        expect(typeof res.body).toBe("object");
        expect(typeof res.body.features).toBe("object");
        expect(Array.isArray(res.body.orderBanners)).toBe(true);
        expect(Array.isArray(res.body.announcements)).toBe(true);
        expect(typeof res.body.recaptchaSiteKey).toBe("string");
        expect(typeof res.body.publicBranding).toBe("object");

        expect(typeof res.body.features.orders).toBe("boolean");
        expect(typeof res.body.features.support).toBe("boolean");
        expect(typeof res.body.features.announcements).toBe("boolean");
        expect(res.body.features.support).toBe(false);

        expect(res.body.orderBanners.every((a) => a.category === "order")).toBe(true);
        expect(res.body.announcements.some((a) => a.id === "general-a")).toBe(true);
        expect(res.body.recaptchaSiteKey).toBe("public-site-key");

        expect(res.body.recaptchaSecretKey).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain("private-secret-key");
        expect(res.body.mail).toBeUndefined();
    });
});
