"use strict";

/**
 * 分岐100本計画 P0: orders-api 8本
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue(true),
    sendSupportNotification: jest.fn().mockResolvedValue(true),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue(true)
}));

const request = require("supertest");
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("branch coverage 100 P0: orders-api", () => {
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

    test("POST /api/reset-export-status は未ログイン 401", async () => {
        const res = await request(app).post("/api/reset-export-status").send({ orderId: 1 });
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/update-order-status は未ログイン 401", async () => {
        const res = await request(app).post("/api/update-order-status").send({ orderId: 1 });
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/register-shipment は未ログイン 401", async () => {
        const res = await request(app).post("/api/register-shipment").send({ orderId: 1 });
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/register-shipment-batch は未ログイン 401", async () => {
        const res = await request(app).post("/api/register-shipment-batch").send({});
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/update-shipment-info は未ログイン 401", async () => {
        const res = await request(app).post("/api/update-shipment-info").send({});
        expect(res.statusCode).toBe(401);
    });

    test("GET /shipper-history は未ログイン success false", async () => {
        const res = await request(app).get("/shipper-history");
        expect(res.body.success).toBe(false);
    });

    test("POST /api/import-orders-csv は管理者以外 401", async () => {
        const res = await request(app)
            .post("/api/import-orders-csv")
            .attach("file", Buffer.from("a,b", "utf-8"), "x.csv");
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/reset-export-status は管理者で JSON 応答", async () => {
        await writeJson("orders.json", [{ orderId: 88001, customerId: "TEST001", items: [], status: "未発送" }]);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/reset-export-status").send({ orderId: 88001 });
        expect(res.body).toHaveProperty("success");
    });
});
