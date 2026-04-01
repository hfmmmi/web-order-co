/**
 * routes/admin/stocksRoutes POST /admin/stocks/import 成功系（adapter.run 分岐）
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: stocks import 成功系", () => {
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

    test("POST /api/admin/stocks/import は CSV を取り込み成功を返す", async () => {
        const csv =
            "product_code,total_qty,warehouse_code,warehouse_qty,timestamp,publish,hidden_message\n" +
            "P001,10,本社,10,2025-02-01T09:00:00+09:00,1,\n";
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/import").attach("stockFile", Buffer.from(csv, "utf-8"), "stock.csv");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary).toBeDefined();
    });
});
