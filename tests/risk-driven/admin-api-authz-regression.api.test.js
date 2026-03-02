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

describe("リスク駆動: 管理APIの認可直アクセス回帰", () => {
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

    test("未認証ユーザーは管理APIに直アクセスできない", async () => {
        const targets = await Promise.all([
            request(app).get("/api/admin/settings"),
            request(app).get("/api/admin/customers"),
            request(app).get("/api/admin/stocks"),
            request(app).post("/api/admin/proxy-request").send({ customerId: "TEST001" })
        ]);

        for (const res of targets) {
            expect(res.statusCode).toBe(401);
            expect(String(res.body.message || "")).toContain("管理者権限");
        }
    });

    test("顧客ログイン済みでも管理APIは直アクセス拒否される", async () => {
        const customer = request.agent(app);
        const login = await customer
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const targets = await Promise.all([
            customer.get("/api/admin/settings"),
            customer.get("/api/admin/customers"),
            customer.get("/api/admin/stocks"),
            customer.post("/api/admin/proxy-request").send({ customerId: "TEST001" })
        ]);

        for (const res of targets) {
            expect(res.statusCode).toBe(401);
            expect(String(res.body.message || "")).toContain("管理者権限");
        }
    });
});
