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

describe("Sランク: 入力検証統一", () => {
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

    test("POST /api/login は unknown key を 400 で拒否する", async () => {
        const res = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!", unknownKey: "x" });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("入力内容に誤りがあります");
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.some((e) => String(e.path).includes("unknownKey"))).toBe(true);
    });

    test("POST /api/admin/login は型不正を 400 で返す", async () => {
        const res = await request(app)
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: 12345 });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test("POST /place-order は strict 検証で unknown key を拒否する", async () => {
        const agent = request.agent(app);
        const login = await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.body.success).toBe(true);

        const res = await agent
            .post("/place-order")
            .send({
                cart: [{ code: "P001", quantity: 1, unexpected: true }],
                deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test("POST /api/add-customer は unknown key を 400 で拒否する", async () => {
        const admin = request.agent(app);
        const login = await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const res = await admin
            .post("/api/add-customer")
            .send({
                customerId: "NEWVAL1",
                customerName: "新規顧客",
                password: "Pass123!",
                email: "newval1@example.com",
                ignoredField: "should-fail"
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test("POST /api/update-customer は形式不正 customerId を拒否する", async () => {
        const admin = request.agent(app);
        const login = await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const res = await admin
            .post("/api/update-customer")
            .send({
                customerId: "BAD ID",
                customerName: "更新失敗顧客"
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test("PUT /api/admin/settings は strict 検証エラーフォーマットを返す", async () => {
        const admin = request.agent(app);
        const login = await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const res = await admin
            .put("/api/admin/settings")
            .send({
                features: { orders: true },
                recaptcha: { siteKey: "k", secretKey: "s", bad: true }
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("入力内容に誤りがあります");
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.some((e) => String(e.path).includes("bad"))).toBe(true);
    });
});
