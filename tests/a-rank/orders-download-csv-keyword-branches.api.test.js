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
const orderService = require("../../services/orderService");
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

    test("start/end で日付範囲外の注文は CSV から除外", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin
            .get("/api/download-csv")
            .query({ start: "2030-01-01", end: "2030-12-31" });
        expect(res.statusCode).toBe(200);
        expect(res.text).not.toContain("501");
    });

    test("status クエリで一致しない注文は除外", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ status: "発送済" });
        expect(res.statusCode).toBe(200);
        expect(res.text).not.toContain("501");
    });

    test("mode=unexported で exported_at 済み注文は CSV から除外", async () => {
        await writeJson("orders.json", [
            {
                orderId: 601,
                customerId: "TEST001",
                customerName: "輸出済",
                orderDate: "2025-06-15T12:00:00.000Z",
                status: "未発送",
                items: [{ code: "E1", name: "品", quantity: 1, price: 100 }],
                deliveryInfo: {},
                exported_at: "2025-07-01T00:00:00.000Z"
            },
            {
                orderId: 602,
                customerId: "TEST001",
                customerName: "未輸出",
                orderDate: "2025-06-16T12:00:00.000Z",
                status: "未発送",
                items: [{ code: "E2", name: "品2", quantity: 1, price: 100 }],
                deliveryInfo: {},
                exported_at: null
            }
        ]);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ mode: "unexported" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("602");
        expect(res.text).not.toContain("601");
    });

    test("orderDate が不正でもフィルタは 1970-01-01 基準で落ちない", async () => {
        await writeJson("orders.json", [
            {
                orderId: 701,
                customerId: "TEST001",
                customerName: "日付壊れ",
                orderDate: "not-a-date",
                status: "未発送",
                items: [{ code: "D1", name: "品", quantity: 1, price: 100 }],
                deliveryInfo: {},
                exported_at: null
            }
        ]);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ start: "1969-01-01", end: "1970-12-31" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("701");
    });

    test("status が空文字のとき全ステータスが対象", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ status: "" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });

    test("status クエリ省略時は matchStatus の undefined 枝", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv");
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });

    test("end のみ指定でも日付フィルタが動く", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ end: "2099-12-31" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });

    test("start のみ指定でも日付フィルタが動く", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ start: "2025-01-01" });
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain("501");
    });

    test("mode=unexported で1件以上なら markOrdersAsExported が呼ばれる", async () => {
        const spy = jest.spyOn(orderService, "markOrdersAsExported").mockResolvedValue(undefined);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ mode: "unexported" });
        expect(res.statusCode).toBe(200);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe("orderMatchesDownloadCsvKeyword 直接", () => {
    const ordersRouter = require("../../routes/orders-api");
    const match = ordersRouter.orderMatchesDownloadCsvKeyword;

    test("キーワード未指定・空は常に true", () => {
        expect(match({ orderId: 1 }, "")).toBe(true);
        expect(match({ orderId: 1 }, undefined)).toBe(true);
        expect(match({ orderId: 1 }, "  ")).toBe(true);
    });

    test("明細の品名で部分一致", () => {
        expect(
            match(
                { orderId: 9, customerId: "C", items: [{ code: "X", name: "超長い商品名トナー" }] },
                "トナー"
            )
        ).toBe(true);
    });
});
