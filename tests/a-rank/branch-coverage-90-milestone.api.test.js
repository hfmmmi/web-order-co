"use strict";

/**
 * 分岐90%向け: セッション・ルートの細かい分岐（priceRank || ""、履歴・注文API 等）
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
const orderService = require("../../services/orderService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("branch coverage 90 milestone: session & orders-api", () => {
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

    test("place-order: priceRank 未設定顧客で priceRank||空文字の右辺を通す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST003", pass: "CustPass123!" });
        const res = await agent.post("/place-order").send({
            cart: [{ productCode: "P001", quantity: 1 }],
            deliveryInfo: { name: "a", tel: "1", address: "東京都" }
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("GET /orders: 管理者は isAdmin で一覧取得", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/orders");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.orders)).toBe(true);
    });

    test("GET /order-history: searchOrders 失敗時 catch", async () => {
        jest.spyOn(orderService, "searchOrders").mockRejectedValueOnce(new Error("boom"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/order-history");
        expect(res.body.success).toBe(false);
        orderService.searchOrders.mockRestore();
    });

    test("GET /delivery-history: searchOrders 失敗時 catch", async () => {
        jest.spyOn(orderService, "searchOrders").mockRejectedValueOnce(new Error("boom"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/delivery-history");
        expect(res.body.success).toBe(false);
        orderService.searchOrders.mockRestore();
    });

    test("GET /shipper-history: 荷主あり・keyword で一致しない行はスキップ", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            {
                orderId: "O1",
                customerId: "TEST001",
                deliveryInfo: {
                    shipper: { name: "荷主A", address: "大阪", tel: "06" }
                }
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/shipper-history").query({ keyword: "存在しないZZZ" });
        expect(res.body.success).toBe(true);
        expect(res.body.list.length).toBe(0);
        orderService.searchOrders.mockRestore();
    });

    test("POST /api/update-order-status: 顧客セッションでも更新可能", async () => {
        jest.spyOn(orderService, "updateOrderStatus").mockResolvedValueOnce(undefined);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/api/update-order-status").send({ orderId: "X1", status: "未発送" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        orderService.updateOrderStatus.mockRestore();
    });

    test("POST /api/update-order-status: updateOrderStatus 失敗で500", async () => {
        jest.spyOn(orderService, "updateOrderStatus").mockRejectedValueOnce(new Error("save"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/api/update-order-status").send({ orderId: "X1" });
        expect(res.statusCode).toBe(500);
        orderService.updateOrderStatus.mockRestore();
    });

    test("GET /delivery-history: 同一住所キーは1件にユニーク化", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            {
                orderId: "D1",
                deliveryInfo: { address: "東京都千代田区", name: "山田", tel: "03", zip: "100", note: "n1" }
            },
            {
                orderId: "D2",
                deliveryInfo: { address: "東京都千代田区", name: "山田", tel: "03", zip: "100", note: "n2" }
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/delivery-history");
        expect(res.body.success).toBe(true);
        expect(res.body.list.length).toBe(1);
        orderService.searchOrders.mockRestore();
    });

    test("GET /delivery-history: keyword なしで複数住所をそのまま返す", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            {
                orderId: "D1",
                deliveryInfo: { address: "北海道", name: "A", tel: "1" }
            },
            {
                orderId: "D2",
                deliveryInfo: { address: "沖縄県", name: "B", tel: "2" }
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/delivery-history");
        expect(res.body.list.length).toBe(2);
        orderService.searchOrders.mockRestore();
    });

    test("GET /delivery-history: 住所なしの注文はスキップ", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            { orderId: "D0", deliveryInfo: { name: "のみ", tel: "1" } },
            { orderId: "D1", deliveryInfo: { address: "福岡", name: "C", tel: "3" } }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/delivery-history");
        expect(res.body.list.length).toBe(1);
        expect(res.body.list[0].address).toBe("福岡");
        orderService.searchOrders.mockRestore();
    });

    test("GET /delivery-history: keyword ありで部分一致のみ残る", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            { orderId: "D1", deliveryInfo: { address: "愛知県名古屋", name: "X", tel: "1" } },
            { orderId: "D2", deliveryInfo: { address: "大阪府", name: "Y", tel: "2" } }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/delivery-history").query({ keyword: "名古屋" });
        expect(res.body.list.length).toBe(1);
        orderService.searchOrders.mockRestore();
    });

    test("GET /shipper-history: 同一荷主キーは1件にユニーク化", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            {
                orderId: "S1",
                deliveryInfo: { shipper: { name: "荷主Z", address: "横浜", tel: "045" } }
            },
            {
                orderId: "S2",
                deliveryInfo: { shipper: { name: "荷主Z", address: "横浜", tel: "045" } }
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/shipper-history");
        expect(res.body.list.length).toBe(1);
        orderService.searchOrders.mockRestore();
    });

    test("GET /shipper-history: keyword なしで荷主2件を返す", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            { orderId: "S1", deliveryInfo: { shipper: { name: "荷主1", address: "a", tel: "1" } } },
            { orderId: "S2", deliveryInfo: { shipper: { name: "荷主2", address: "b", tel: "2" } } }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/shipper-history");
        expect(res.body.list.length).toBe(2);
        orderService.searchOrders.mockRestore();
    });

    test("GET /shipper-history: 荷主名が無い注文はスキップ", async () => {
        jest.spyOn(orderService, "searchOrders").mockResolvedValueOnce([
            { orderId: "S0", deliveryInfo: { shipper: { address: "only", tel: "1" } } },
            { orderId: "S1", deliveryInfo: { shipper: { name: "正式名", address: "c", tel: "9" } } }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/shipper-history");
        expect(res.body.list.length).toBe(1);
        orderService.searchOrders.mockRestore();
    });
});
