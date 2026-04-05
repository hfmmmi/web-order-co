"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const fs = require("fs").promises;
const { app } = require("../../server");
const customerService = require("../../services/customerService");
const mailService = require("../../services/mailService");
const specialPriceService = require("../../services/specialPriceService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("分岐90向け: catalog / customers / 管理者平文パス不一致", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        jest.restoreAllMocks();
    });

    test("GET /api/products は keyword でメーカー名も検索", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products").query({ keyword: "TestMaker", page: 1, limit: 5 });
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
    });

    test("GET /products は products.json 読込失敗で 500", async () => {
        const orig = jest.requireActual("fs").promises.readFile;
        const spy = jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("products.json")) {
                throw new Error("e1");
            }
            return orig(p, enc);
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products");
        expect(res.statusCode).toBe(500);
        spy.mockRestore();
    });

    test("GET /api/products/estimate は見積なしメッセージ", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate").query({ estimateId: "NO-SUCH-EST" });
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toEqual([]);
        expect(String(res.body.message)).toContain("該当");
    });

    test("GET /api/products/estimate は products 読込失敗で 500", async () => {
        jest.spyOn(specialPriceService, "getSpecialPrices").mockResolvedValueOnce([
            {
                estimateId: "EST500",
                productCode: "P001",
                productName: "n",
                unitPrice: 100,
                validUntil: "2099-01-01",
                manufacturer: "m",
                subject: "s"
            }
        ]);
        const orig = fs.readFile.bind(fs);
        jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("products.json")) {
                throw new Error("pe");
            }
            return orig(p, enc);
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate").query({ estimateId: "EST500" });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/cart-details は配列でなければ 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({ cart: {} });
        expect(res.statusCode).toBe(400);
    });

    test("GET /api/products/frequent は履歴ゼロでメッセージ", async () => {
        await writeJson("orders.json", []);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 5 });
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toEqual([]);
    });

    test("GET /api/admin/customers は一覧取得失敗で 500", async () => {
        jest.spyOn(customerService, "getAllCustomers").mockRejectedValueOnce(new Error("db"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/customers");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/send-invite-email は顧客IDなし", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/send-invite-email").send({});
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/send-invite-email はメール未登録", async () => {
        await writeJson("customers.json", [
            {
                customerId: "NOML",
                customerName: "無メール",
                password: "$2a$10$abcdefghijklmnopqrstuv",
                priceRank: "A",
                email: ""
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/send-invite-email").send({ customerId: "NOML" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message)).toContain("メール");
    });

    test("POST /api/admin/send-invite-email は送信失敗メッセージ", async () => {
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "SMTP" });
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
    });

    test("平文パス管理者は誤パスワードで不一致分岐", async () => {
        await writeJson("admins.json", [{ adminId: "plain1", password: "plainsecret", name: "平文" }]);
        const res = await request(app).post("/api/admin/login").send({ id: "plain1", pass: "wrong-pass" });
        expect(res.body.success).toBe(false);
    });
});
