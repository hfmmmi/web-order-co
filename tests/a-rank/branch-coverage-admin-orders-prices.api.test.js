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
const csvService = require("../../services/csvService");
const specialPriceService = require("../../services/specialPriceService");
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

    test("POST /api/admin/orders-create は未ログインで 401", async () => {
        const res = await request(app).post("/api/admin/orders-create").send({
            customerId: "TEST001",
            cart: [{ code: "P001", quantity: 1, price: 0 }],
            deliveryInfo: { name: "届先", zip: "", address: "", tel: "" }
        });
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/admin/orders-create は管理者で受注を作成できる", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/orders-create").send({
            customerId: "TEST001",
            cart: [{ code: "P001", quantity: 1, price: 0 }],
            deliveryInfo: {
                name: "管理画面からの届先",
                zip: "530-0001",
                address: "大阪府",
                tel: "06-0000-0000",
                clientOrderNumber: "ADM-NEW-1"
            }
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.orderId).toBeDefined();
    });

    test("POST /api/admin/orders-create は存在しない顧客で 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/orders-create").send({
            customerId: "NO_SUCH_CUST_999",
            cart: [{ code: "P001", quantity: 1, price: 0 }],
            deliveryInfo: { name: "x" }
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("見つかりません");
    });

    test("POST /api/admin/orders-create は placeOrder 失敗時 500", async () => {
        jest.spyOn(orderService, "placeOrder").mockRejectedValueOnce(new Error("write fail"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/orders-create").send({
            customerId: "TEST001",
            cart: [{ code: "P001", quantity: 1, price: 0 }],
            deliveryInfo: { name: "届先" }
        });
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

    test("POST /api/admin/orders-list-export は buildOrderListExportRows が throw すると 500", async () => {
        jest.spyOn(orderListExport, "buildOrderListExportRows").mockImplementationOnce(() => {
            throw new Error("build rows");
        });
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/admin/orders-list-export")
            .send({ format: "csv", orders: [sampleOrderRow] });
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test("POST /api/update-order-status は顧客セッションでも 200", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const place = await customer.post("/place-order").send({
            cart: [{ code: "P001", name: "テストトナーA", price: 1000, quantity: 1 }],
            deliveryInfo: {
                name: "届先",
                zip: "100-0001",
                address: "大阪",
                tel: "06-0000",
                clientOrderNumber: "BR-ORD-1"
            }
        });
        expect(place.statusCode).toBe(200);
        const res = await customer.post("/api/update-order-status").send({
            orderId: place.body.orderId,
            deliveryEstimate: "顧客からの更新テスト"
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("POST /api/admin/import-estimates は estimateImportAliases を parse に渡す", async () => {
        const aliases = { 見積ID: "estimateId" };
        const parseSpy = jest.spyOn(csvService, "parseEstimatesData").mockResolvedValueOnce([]);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            dataFormats: { estimateImportAliases: aliases }
        });
        const buf = Buffer.from("x", "utf8");
        const res = await admin.post("/api/admin/import-estimates").attach("estimateFile", buf, "named-est.csv");
        expect(res.statusCode).toBe(400);
        const callBuf = parseSpy.mock.calls[0][0];
        expect(Buffer.isBuffer(callBuf)).toBe(true);
        expect(parseSpy).toHaveBeenCalledWith(callBuf, "named-est.csv", aliases);
        parseSpy.mockRestore();
    });

    test("POST /api/admin/delete-estimates-by-manufacturer はサービス失敗で 500", async () => {
        jest.spyOn(specialPriceService, "deleteEstimatesByManufacturer").mockRejectedValueOnce(new Error("del fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/delete-estimates-by-manufacturer").send({ manufacturer: "X社" });
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/delete-estimates-by-products はサービス失敗で 500", async () => {
        jest.spyOn(specialPriceService, "deleteEstimatesByProductCodes").mockRejectedValueOnce(new Error("del pc"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/delete-estimates-by-products").send({ productCodes: ["P001"] });
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
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

    test("POST /api/import-flam は importFlamData が失敗すると 500", async () => {
        jest.spyOn(orderService, "importFlamData").mockRejectedValueOnce(new Error("flam read"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .post("/api/import-flam")
            .attach("csvFile", Buffer.from("a", "utf8"), "x.csv");
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/import-estimates は有効行があれば 200", async () => {
        const row = {
            estimateId: "E-BR",
            customerId: "TEST001",
            productCode: "P001",
            productName: "n",
            price: 100,
            validUntil: "2099-01-01",
            manufacturer: "m",
            subject: "s"
        };
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({ dataFormats: {} });
        jest.spyOn(csvService, "parseEstimatesData").mockResolvedValueOnce([row]);
        jest.spyOn(specialPriceService, "saveEstimates").mockResolvedValueOnce({ count: 1 });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/import-estimates").attach("estimateFile", Buffer.from("x"), "ok.csv");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(1);
    });

    test("POST /api/admin/import-estimates は saveEstimates が失敗すると 500", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({ dataFormats: {} });
        jest.spyOn(csvService, "parseEstimatesData").mockResolvedValueOnce([
            {
                estimateId: "E2",
                customerId: "TEST001",
                productCode: "P002",
                productName: "n",
                price: 1,
                validUntil: "2099-01-01",
                manufacturer: "m",
                subject: "s"
            }
        ]);
        jest.spyOn(specialPriceService, "saveEstimates").mockRejectedValueOnce(new Error("save fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/import-estimates").attach("estimateFile", Buffer.from("x"), "z.csv");
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/delete-estimates-by-manufacturer は manufacturer 不正で 400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/delete-estimates-by-manufacturer").send({ manufacturer: 123 });
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/delete-estimates-by-products は productCodes 空で 400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/delete-estimates-by-products").send({ productCodes: [] });
        expect(res.statusCode).toBe(400);
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
