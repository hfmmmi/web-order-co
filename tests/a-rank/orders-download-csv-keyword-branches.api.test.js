/**
 * routes/orders-api.js orderMatchesDownloadCsvKeyword の分岐（GET /api/download-csv）
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
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("Aランク: download-csv キーワード分岐", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("orders.json", [
            {
                orderId: 501,
                customerId: "TEST001",
                customerName: "キーワード社",
                orderDate: "2025-06-15T12:00:00.000Z",
                status: "未発送",
                items: [{ code: "PX99", name: "特殊トナー", quantity: 1, price: 500 }],
                deliveryInfo: { name: "届先", address: "東京都" },
                exported_at: null
            },
            {
                orderId: 502,
                customerId: "TEST002",
                customerName: "別顧客",
                orderDate: "2025-06-16T12:00:00.000Z",
                status: "未発送",
                items: [{ code: "P002", name: "別商品", quantity: 2, price: 300 }],
                deliveryInfo: {},
                exported_at: null
            }
        ]);
    });

    test("keyword=(顧客ID) で該当注文のみ CSV に含まれる", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ keyword: "(TEST001)" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
        expect(res.text).not.toContain("502");
    });

    test("keyword=(商品コード) で該当明細の注文が含まれる", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ keyword: "(PX99)" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });

    test("keyword=(一致しないコード) では行が除外される", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ keyword: "(NO_SUCH)" });
        expect(res.statusCode).toBe(200);
        expect(res.text).not.toContain("501");
        expect(res.text).not.toContain("502");
    });

    test("keyword が通常文字列のとき社名の部分一致で含まれる", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ keyword: "キーワード" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });

    test("keyword が注文IDの一部にマッチする", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ keyword: "501" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });
});
