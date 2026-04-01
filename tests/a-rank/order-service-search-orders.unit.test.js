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

    test("管理検索: start/end で注文日をフィルタする", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9101,
                customerId: "TEST001",
                orderDate: "2025-06-15T12:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 100 }],
                deliveryInfo: {}
            }
        ]);
        const inside = await orderService.searchOrders({
            isAdmin: true,
            start: "2025-06-01",
            end: "2025-06-30"
        });
        expect(inside.some((x) => x.orderId === 9101)).toBe(true);
        const outside = await orderService.searchOrders({
            isAdmin: true,
            start: "2025-07-01",
            end: "2025-07-31"
        });
        expect(outside.some((x) => x.orderId === 9101)).toBe(false);
    });

    test("管理検索: status で絞り込む", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9102,
                customerId: "TEST001",
                orderDate: "2025-03-01T00:00:00.000Z",
                status: "発送済",
                items: [{ code: "P001", quantity: 1, price: 100 }],
                deliveryInfo: {}
            }
        ]);
        const ok = await orderService.searchOrders({ isAdmin: true, status: "発送済" });
        const no = await orderService.searchOrders({ isAdmin: true, status: "未発送" });
        expect(ok.some((x) => x.orderId === 9102)).toBe(true);
        expect(no.some((x) => x.orderId === 9102)).toBe(false);
    });

    test("キーワードで顧客IDの部分一致にマッチ", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9103,
                customerId: "ZZKEYWORD99",
                orderDate: "2025-03-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", quantity: 1, price: 100 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true, keyword: "keyword" });
        expect(rows.some((x) => x.orderId === 9103)).toBe(true);
    });

    test("マスタに無いコードで商品名が空のとき取扱終了表示", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9104,
                customerId: "TEST001",
                orderDate: "2025-03-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "NO_SUCH_P", quantity: 1, price: 100 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9104);
        expect(o.items[0].name).toContain("取扱終了");
    });

    test("商品名が不明のみのときプレースホルダ名に正規化", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9105,
                customerId: "TEST001",
                orderDate: "2025-03-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "BADX", name: "不明", quantity: 1, price: 10 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9105);
        expect(o.items[0].name).toContain("取扱終了");
    });

    test("顧客ありでランク未設定は空文字として扱われる", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9106,
                customerId: "TEST001",
                orderDate: "2025-03-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", quantity: 1, price: 1000 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9106);
        expect(o.customerName).toBeTruthy();
        expect(o.items[0].price).toBe(1000);
    });
});
