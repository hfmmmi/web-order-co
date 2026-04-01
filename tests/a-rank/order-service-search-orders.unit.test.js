"use strict";

const orderService = require("../../services/orderService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("orderService.searchOrders 追加分岐", () => {
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

    test("管理検索: keyword が orderId / customerId に部分一致", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9001,
                customerId: "TEST001",
                orderDate: "2025-03-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 1000 }],
                deliveryInfo: {}
            }
        ]);
        const byId = await orderService.searchOrders({ isAdmin: true, keyword: "9001" });
        expect(byId.length).toBe(1);
        const byCust = await orderService.searchOrders({ isAdmin: true, keyword: "test001" });
        expect(byCust.length).toBe(1);
    });

    test("顧客がDBにいないとき deliveryInfo.name でラベル化", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9002,
                customerId: "GHOST99",
                orderDate: "2025-03-02T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 1000 }],
                deliveryInfo: { name: "配送先名" }
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9002);
        expect(o.customerName).toContain("配送先名");
        expect(o.customerName).toContain("削除済");
    });

    test("顧客IDなしはゲスト表示", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9003,
                orderDate: "2025-03-03T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 100 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9003);
        expect(o.customerName).toContain("ゲスト");
    });

    test("商品コードなし・名前でマスタ逆引き", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9004,
                customerId: "TEST001",
                orderDate: "2025-03-04T00:00:00.000Z",
                status: "未発送",
                items: [{ name: "テストトナーA", quantity: 1, price: 500 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9004);
        expect(o.items[0].code).toBe("P001");
    });

    test("価格0かつマスタありでランク価格から再計算", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9005,
                customerId: "TEST001",
                orderDate: "2025-03-05T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 0 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9005);
        expect(o.items[0].price).toBeGreaterThan(0);
    });
});
