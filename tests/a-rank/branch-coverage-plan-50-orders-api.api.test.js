/**
 * 分岐50本計画: routes/orders-api.js 6 本（認証・一覧 catch・取込400）
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue(true),
    sendSupportNotification: jest.fn().mockResolvedValue(true),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue(true)
}));

const request = require("supertest");
const { app } = require("../../server");
const orderService = require("../../services/orderService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: orders-api 分岐50 追加分岐", () => {
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

    test("GET /orders は未ログインで 401", async () => {
        const res = await request(app).get("/orders");
        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test("POST /place-order は未ログインで success false", async () => {
        const res = await request(app)
            .post("/place-order")
            .send({
                cart: [{ code: "P001", quantity: 1, price: 100 }],
                deliveryInfo: { name: "配送名", address: "東京都", zip: "100", tel: "03-0000-0000" }
            });
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/ログイン/);
    });

    test("GET /order-history は未ログインで 401", async () => {
        const res = await request(app).get("/order-history");
        expect(res.statusCode).toBe(401);
    });

    test("GET /api/download-csv は管理者以外 401", async () => {
        const res = await request(app).get("/api/download-csv");
        expect(res.statusCode).toBe(401);
    });

    test("GET /orders は searchOrders 例外時に success false", async () => {
        jest.spyOn(orderService, "searchOrders").mockRejectedValueOnce(new Error("db fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/orders");
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/読み込み/);
    });

    test("POST /api/import-shipping-csv はファイルなしで 400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/import-shipping-csv");
        expect(res.statusCode).toBe(400);
    });
});
