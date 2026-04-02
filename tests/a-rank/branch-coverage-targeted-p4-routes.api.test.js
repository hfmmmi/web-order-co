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
const ordersRouter = require("../../routes/orders-api");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

const matchKw = ordersRouter.orderMatchesDownloadCsvKeyword;

const sampleOrder = (over = {}) => ({
    orderId: "ORD-P4-1",
    customerId: "TEST001",
    customerName: "テスト顧客",
    orderDate: "2026-01-15T00:00:00.000Z",
    status: "未発送",
    deliveryInfo: {
        name: "配送先名",
        address: "東京都千代田区1-1",
        tel: "0312345678",
        shipper: { name: "荷主商事", address: "大阪1", tel: "0666666666" }
    },
    items: [{ code: "P001", name: "テストトナーA", price: 1000, quantity: 1 }],
    ...over
});

describe("branch-coverage-targeted-p4: orderMatchesDownloadCsvKeyword", () => {
    const base = sampleOrder();

    test("keyword 未指定は true", () => {
        expect(matchKw(base, undefined)).toBe(true);
        expect(matchKw(base, null)).toBe(true);
    });

    test("空文字・空白のみは true", () => {
        expect(matchKw(base, "")).toBe(true);
        expect(matchKw(base, "   ")).toBe(true);
    });

    test("注文ID 部分一致", () => {
        expect(matchKw(base, "ord-p4")).toBe(true);
    });

    test("顧客ID 部分一致", () => {
        expect(matchKw(base, "test001")).toBe(true);
    });

    test("顧客名 部分一致", () => {
        expect(matchKw(base, "テスト")).toBe(true);
    });

    test("明細コード 部分一致", () => {
        expect(matchKw(base, "p001")).toBe(true);
    });

    test("明細品名 部分一致", () => {
        expect(matchKw(base, "トナー")).toBe(true);
    });

    test("括弧形式で顧客ID 完全一致", () => {
        expect(matchKw(base, "(TEST001)")).toBe(true);
    });

    test("括弧形式で商品コード 完全一致", () => {
        expect(matchKw(base, "(P001)")).toBe(true);
    });

    test("括弧形式で不一致は false", () => {
        expect(matchKw(base, "(ZZZ)")).toBe(false);
    });

    test("items 無しでも注文IDで一致", () => {
        const o = { ...base, items: undefined };
        expect(matchKw(o, "ORD-P4")).toBe(true);
    });

    test("items が非配列でも落ちない", () => {
        const o = { ...base, items: null };
        expect(matchKw(o, "テスト")).toBe(true);
    });

    test("customerName 無しでも ID で一致", () => {
        const o = { ...base, customerName: "" };
        expect(matchKw(o, "TEST001")).toBe(true);
    });

    test("orderId 数値でも文字列化して一致", () => {
        const o = { ...base, orderId: 999 };
        expect(matchKw(o, "999")).toBe(true);
    });
});

describe("branch-coverage-targeted-p4: orders & support routes", () => {
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

    test("GET /orders 未ログイン 401", async () => {
        const res = await request(app).get("/orders");
        expect(res.statusCode).toBe(401);
    });

    test("GET /orders 管理者 200", async () => {
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/orders");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("GET /orders 顧客 200", async () => {
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/orders");
        expect(res.body.success).toBe(true);
    });

    test("GET /orders 管理者 status クエリ", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/orders").query({ status: "未発送" });
        expect(res.body.orders.length).toBeGreaterThanOrEqual(1);
    });

    test("GET /orders keyword 絞り込み", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/orders").query({ keyword: "test001" });
        expect(res.body.orders.some((o) => String(o.orderId).includes("ORD-P4"))).toBe(true);
    });

    test("GET /orders start end 日付", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/orders").query({ start: "2026-01-01", end: "2026-12-31" });
        expect(res.body.success).toBe(true);
    });

    test("GET /order-history 未ログイン 401", async () => {
        const res = await request(app).get("/order-history");
        expect(res.statusCode).toBe(401);
    });

    test("GET /order-history 顧客 200", async () => {
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/order-history");
        expect(res.body.success).toBe(true);
    });

    test("GET /delivery-history 未ログイン", async () => {
        const res = await request(app).get("/delivery-history");
        expect(res.body.success).toBe(false);
    });

    test("GET /delivery-history 住所ユニーク化", async () => {
        await writeJson("orders.json", [sampleOrder(), sampleOrder({ orderId: "ORD-P4-2" })]);
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/delivery-history");
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.list)).toBe(true);
    });

    test("GET /delivery-history keyword フィルタ", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/delivery-history").query({ keyword: "千代田" });
        expect(res.body.list.length).toBeGreaterThanOrEqual(1);
    });

    test("GET /delivery-history keyword 不一致は空に近い", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/delivery-history").query({ keyword: "存在しない地名ZZ" });
        expect(res.body.list.length).toBe(0);
    });

    test("GET /shipper-history 未ログイン", async () => {
        const res = await request(app).get("/shipper-history");
        expect(res.body.success).toBe(false);
    });

    test("GET /shipper-history 荷主一覧", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/shipper-history");
        expect(res.body.list.some((x) => String(x.name || "").includes("荷主"))).toBe(true);
    });

    test("GET /shipper-history keyword", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/shipper-history").query({ keyword: "荷主" });
        expect(res.body.list.length).toBeGreaterThanOrEqual(1);
    });

    test("GET /api/download-csv 未管理者 401", async () => {
        const res = await request(app).get("/api/download-csv");
        expect(res.statusCode).toBe(401);
    });

    test("GET /api/download-csv 管理者", async () => {
        await writeJson("orders.json", [sampleOrder()]);
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/api/download-csv");
        expect(res.statusCode).toBe(200);
        expect(String(res.headers["content-type"] || "")).toContain("csv");
    });

    test("GET /api/download-csv mode=unexported", async () => {
        await writeJson("orders.json", [sampleOrder({ exported_at: null, orderId: "ORD-UE-1" })]);
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/api/download-csv").query({ mode: "unexported" });
        expect(res.statusCode).toBe(200);
    });

    test("POST /api/import-shipping-csv 401", async () => {
        const res = await request(app).post("/api/import-shipping-csv");
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/import-shipping-csv ファイルなし 400", async () => {
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.post("/api/import-shipping-csv");
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/import-shipping-csv 空データ", async () => {
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.post("/api/import-shipping-csv").attach("file", Buffer.from("a\n"), "x.csv");
        expect(res.body.success).toBe(false);
    });

    test("POST /api/import-shipping-csv 配送伝票番号キー", async () => {
        await writeJson("orders.json", [
            {
                orderId: "MEMO1",
                customerId: "TEST001",
                customerName: "c",
                orderDate: new Date().toISOString(),
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const csv = "社内メモ,配送伝票番号,運送会社\nMEMO1,TRK99,ヤマト\n";
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.post("/api/import-shipping-csv").attach("file", Buffer.from(csv), "s.csv");
        expect(res.statusCode).toBe(200);
    });

    test("POST /api/import-orders-csv 401", async () => {
        const res = await request(app).post("/api/import-orders-csv").attach("file", Buffer.from("a"), "o.csv");
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/import-orders-csv 最小CSV", async () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            `EXT-P4-${Date.now()},TEST001,顧客,PX99,品,10,1,2026-01-01\n`;
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.post("/api/import-orders-csv").attach("file", Buffer.from(csv), "o.csv");
        expect(res.body.success).toBe(true);
    });

    test("POST /api/reset-export-status 401", async () => {
        const res = await request(app).post("/api/reset-export-status").send({ orderId: "x" });
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/reset-export-status 存在しない注文", async () => {
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.post("/api/reset-export-status").send({ orderId: "NOPE999" });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/update-order-status 401", async () => {
        const res = await request(app).post("/api/update-order-status").send({ orderId: "x" });
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/register-shipment 401", async () => {
        const res = await request(app).post("/api/register-shipment").send({});
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/register-shipment-batch 401", async () => {
        const res = await request(app).post("/api/register-shipment-batch").send({});
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/update-shipment-info 401", async () => {
        const res = await request(app).post("/api/update-shipment-info").send({});
        expect(res.statusCode).toBe(401);
    });

    test("POST /place-order 未ログイン", async () => {
        const res = await request(app).post("/place-order").send({ cart: [], deliveryInfo: {} });
        expect(res.body.success).toBe(false);
    });

    test("GET /support/my-tickets 401", async () => {
        const res = await request(app).get("/support/my-tickets");
        expect(res.statusCode).toBe(401);
    });

    test("GET /support/my-tickets 顧客", async () => {
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.get("/support/my-tickets");
        expect(res.body.success).toBe(true);
    });

    test("GET /admin/support-tickets 401", async () => {
        const res = await request(app).get("/admin/support-tickets");
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/support-tickets 管理者", async () => {
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.get("/admin/support-tickets");
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("POST /request-support 401", async () => {
        const res = await request(app).post("/request-support").send({ category: "support", detail: "d" });
        expect(res.statusCode).toBe(401);
    });

    test("POST /request-support JSON 成功", async () => {
        const c = request.agent(app);
        await c.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await c.post("/request-support").send({ category: "support", detail: "p4テスト" });
        expect(res.body.success).toBe(true);
    });

    test("GET /support/attachment 不正 ticketId 400", async () => {
        const res = await request(app).get("/support/attachment/bad-id/0_0_abcdef12.pdf");
        expect(res.statusCode).toBe(400);
    });

    test("GET /support/attachment 不正 storedName 400", async () => {
        const res = await request(app).get("/support/attachment/T-ABCDEFGH/badname");
        expect(res.statusCode).toBe(400);
    });

    test("GET /support/attachment 未ログイン 401", async () => {
        const res = await request(app).get("/support/attachment/T-ABCDEFGH/0_0_abcdef12.pdf");
        expect(res.statusCode).toBe(401);
    });

    test("POST /admin/update-ticket 401", async () => {
        const res = await request(app).post("/admin/update-ticket").send({ ticketId: "T-X", status: "open" });
        expect(res.statusCode).toBe(401);
    });

    test("POST /admin/update-ticket 不正 ticketId は updated false", async () => {
        const a = request.agent(app);
        await a.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await a.post("/admin/update-ticket").send({ ticketId: "T-NOPE99999", status: "open" });
        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });
});
