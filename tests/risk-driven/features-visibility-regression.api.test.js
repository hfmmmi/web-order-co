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
    readJson
} = require("../helpers/testSandbox");

describe("リスク駆動: feature表示制御の回帰", () => {
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

    test("support/announcements を false 保存すると public settings と settings.json に反映される", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const save = await admin.put("/api/admin/settings").send({
            features: {
                support: false,
                announcements: false,
                orders: true
            }
        });
        expect(save.statusCode).toBe(200);
        expect(save.body.success).toBe(true);

        const pub = await request(app).get("/api/settings/public");
        expect(pub.statusCode).toBe(200);
        expect(pub.body.features.support).toBe(false);
        expect(pub.body.features.announcements).toBe(false);

        const settings = await readJson("settings.json");
        expect(settings.features.support).toBe(false);
        expect(settings.features.announcements).toBe(false);
    });

    test("未認証での直アクセスAPIは feature設定に関係なく拒否される", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await admin.put("/api/admin/settings").send({
            features: {
                support: false,
                announcements: false
            }
        });

        const support = await request(app).get("/support/my-tickets");
        expect(support.statusCode).toBe(401);

        const history = await request(app).get("/order-history");
        expect(history.statusCode).toBe(401);
    });

    test("feature OFF時の直アクセスでも応答形式が崩れず、一貫したHTTPステータスを返す", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await admin.put("/api/admin/settings").send({
            features: {
                support: false,
                announcements: false,
                history: false
            }
        });

        const customer = request.agent(app);
        const login = await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const support = await customer.get("/support/my-tickets");
        expect(support.statusCode).toBe(200);
        expect(support.body.success).toBe(true);
        expect(Array.isArray(support.body.tickets)).toBe(true);

        const history = await customer.get("/order-history");
        expect(history.statusCode).toBe(200);
        expect(history.body.success).toBe(true);
        expect(Array.isArray(history.body.history)).toBe(true);

        const publicSettings = await request(app).get("/api/settings/public");
        expect(publicSettings.statusCode).toBe(200);
        expect(publicSettings.body.features.support).toBe(false);
        expect(publicSettings.body.features.announcements).toBe(false);
        expect(publicSettings.body.features.history).toBe(false);
    });
});
