/**
 * routes/orders-api.js GET /delivery-history と /shipper-history の分岐
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
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("Aランク: orders-api 配送・荷主履歴", () => {
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

    describe("GET /delivery-history", () => {
        test("未ログインは success false", async () => {
            const res = await request(app).get("/delivery-history");
            expect(res.body.success).toBe(false);
        });

        test("住所ありの注文のみ一覧に載る・キーワードで絞り込み", async () => {
            await writeJson("orders.json", [
                {
                    orderId: 88001,
                    customerId: "TEST001",
                    orderDate: "2025-04-01T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 100 }],
                    deliveryInfo: {
                        zip: "100",
                        address: "東京都港区テスト1-1",
                        name: "配送先A",
                        tel: "03-1111-1111",
                        note: "メモ"
                    }
                },
                {
                    orderId: 88002,
                    customerId: "TEST001",
                    orderDate: "2025-04-02T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 100 }],
                    deliveryInfo: { name: "住所なし" }
                }
            ]);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

            const all = await agent.get("/delivery-history");
            expect(all.body.success).toBe(true);
            expect(all.body.list.length).toBe(1);
            expect(all.body.list[0].address).toContain("港区");

            const hit = await agent.get("/delivery-history").query({ keyword: "テスト1" });
            expect(hit.body.list.length).toBe(1);

            const miss = await agent.get("/delivery-history").query({ keyword: "存在しないキーワードxyz" });
            expect(miss.body.list.length).toBe(0);
        });

        test("同一住所キーは重複除外（2件目はスキップ）", async () => {
            const di = {
                address: "同じ住所",
                name: "同じ",
                tel: "00",
                zip: "1"
            };
            await writeJson("orders.json", [
                {
                    orderId: 88010,
                    customerId: "TEST001",
                    orderDate: "2025-04-01T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 1 }],
                    deliveryInfo: { ...di }
                },
                {
                    orderId: 88011,
                    customerId: "TEST001",
                    orderDate: "2025-04-02T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 1 }],
                    deliveryInfo: { ...di }
                }
            ]);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/delivery-history");
            expect(res.body.list.length).toBe(1);
        });

        test("searchOrders が例外のときエラーレスポンス", async () => {
            jest.spyOn(orderService, "searchOrders").mockRejectedValueOnce(new Error("db down"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/delivery-history");
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/エラー/);
        });
    });

    describe("GET /shipper-history", () => {
        test("未ログインは success false", async () => {
            const res = await request(app).get("/shipper-history");
            expect(res.body.success).toBe(false);
        });

        test("荷主名ありのみ一覧・キーワード絞り込み", async () => {
            await writeJson("orders.json", [
                {
                    orderId: 88101,
                    customerId: "TEST001",
                    orderDate: "2025-05-01T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 100 }],
                    deliveryInfo: {
                        shipper: { name: "荷主商事", address: "大阪", tel: "06-0000", zip: "540" }
                    }
                },
                {
                    orderId: 88102,
                    customerId: "TEST001",
                    orderDate: "2025-05-02T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 100 }],
                    deliveryInfo: { shipper: { address: "住所のみ" } }
                }
            ]);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

            const all = await agent.get("/shipper-history");
            expect(all.body.success).toBe(true);
            expect(all.body.list.length).toBe(1);
            expect(all.body.list[0].name).toBe("荷主商事");

            const hit = await agent.get("/shipper-history").query({ keyword: "大阪" });
            expect(hit.body.list.length).toBe(1);

            const miss = await agent.get("/shipper-history").query({ keyword: "zzznone" });
            expect(miss.body.list.length).toBe(0);
        });

        test("同一荷主キーは重複除外", async () => {
            const sp = { name: "同一荷主", address: "A", tel: "T" };
            await writeJson("orders.json", [
                {
                    orderId: 88110,
                    customerId: "TEST001",
                    orderDate: "2025-05-01T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 1 }],
                    deliveryInfo: { shipper: { ...sp } }
                },
                {
                    orderId: 88111,
                    customerId: "TEST001",
                    orderDate: "2025-05-02T00:00:00.000Z",
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1, price: 1 }],
                    deliveryInfo: { shipper: { ...sp } }
                }
            ]);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/shipper-history");
            expect(res.body.list.length).toBe(1);
        });

        test("searchOrders が例外のときエラーレスポンス", async () => {
            jest.spyOn(orderService, "searchOrders").mockRejectedValueOnce(new Error("db down"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/shipper-history");
            expect(res.body.success).toBe(false);
        });
    });
});
