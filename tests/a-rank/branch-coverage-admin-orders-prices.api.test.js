/**
 * admin ordersRoutes / pricesRoutes の未カバー分岐（分岐80%向け）
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
const priceService = require("../../services/priceService");
const settingsService = require("../../services/settingsService");
const orderListExport = require("../../utils/orderListExport");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const sampleOrderRow = {
    orderId: "ORD-BR1",
    orderDate: new Date().toISOString(),
    customerId: "TEST001",
    customerName: "テスト顧客",
    status: "未発送",
    totalAmount: 1000,
    items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 1000 }],
    deliveryInfo: { name: "届先", address: "大阪", tel: "06-0000", note: "", date: "" }
};

describe("Aランク: admin orders / prices 分岐カバレッジ", () => {
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

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("GET /api/admin/orders は注文一覧を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/orders");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.orders)).toBe(true);
    });

    test("GET /api/admin/orders は getAllOrders 失敗時 500", async () => {
        jest.spyOn(orderService, "getAllOrders").mockRejectedValueOnce(new Error("db read"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/orders");
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/orders-list-export は format 不正で 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/admin/orders-list-export")
            .send({ format: "pdf", orders: [sampleOrderRow] });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("csv または xlsx");
    });

    test("POST /api/admin/orders-list-export は orders が配列でないと 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/admin/orders-list-export")
            .send({ format: "csv", orders: "not-array" });
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/orders-list-export は出力行がヘッダのみで 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/orders-list-export").send({ format: "csv", orders: [] });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("出力する注文がありません");
    });

    test("POST /api/admin/orders-list-export は csv でダウンロード成功", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/admin/orders-list-export")
            .send({ format: "csv", orders: [sampleOrderRow] });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/csv");
        expect(res.text.length).toBeGreaterThan(10);
    });

    test("POST /api/admin/orders-list-export は xlsx でダウンロード成功", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/admin/orders-list-export")
            .send({ format: "xlsx", orders: [sampleOrderRow] });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("spreadsheet");
        expect(res.headers["content-disposition"]).toMatch(/orders_list_/);
    });

    test("POST /api/admin/orders-list-export は xlsx 生成失敗時 500", async () => {
        jest.spyOn(orderListExport, "rowsToXlsxBuffer").mockRejectedValueOnce(new Error("xlsx fail"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/admin/orders-list-export")
            .send({ format: "xlsx", orders: [sampleOrderRow] });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/import-flam はファイルなしで 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/import-flam");
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/import-flam は CSV を受け付けて処理完了を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const csv = "社内メモ,備考\nNO_MATCH_MEMO,1\n";
        const res = await agent.post("/api/import-flam").attach("csvFile", Buffer.from(csv, "utf8"), "flam.csv");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stats).toBeDefined();
    });

    test("GET /api/admin/customer-price-list は取得失敗時も空配列 200", async () => {
        jest.spyOn(priceService, "getCustomerPriceList").mockRejectedValueOnce(new Error("price read"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/customer-price-list").query({ customerId: "TEST001" });
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toEqual([]);
    });

    test("GET /api/admin/download-pricelist-excel-by-rank/:rank は Excel を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/download-pricelist-excel-by-rank/A");
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("spreadsheet");
    });

    test("GET /api/admin/download-pricelist-excel-by-rank は生成失敗で 500", async () => {
        jest.spyOn(priceService, "getPricelistExcelForRank").mockRejectedValueOnce(new Error("excel gen"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/download-pricelist-excel-by-rank/B");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/rank-list は getRankList 失敗時 500", async () => {
        jest.spyOn(settingsService, "getRankList").mockRejectedValueOnce(new Error("rank list"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/rank-list");
        expect(res.statusCode).toBe(500);
    });
});
