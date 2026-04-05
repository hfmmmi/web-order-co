"use strict";

const fs = require("fs").promises;
const orderService = require("../../services/orderService");
const stockService = require("../../services/stockService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("orderService 分岐90%向け（__testOnly・FLAM・placeOrder・補完）", () => {
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

    test("__testOnly.firstCsvRowValue: row が null", () => {
        const { firstCsvRowValue } = orderService.__testOnly;
        expect(firstCsvRowValue(null, ["a"])).toBe("");
    });

    test("__testOnly.firstCsvRowValue: keys が配列でない", () => {
        const { firstCsvRowValue } = orderService.__testOnly;
        expect(firstCsvRowValue({ a: "1" }, null)).toBe("");
    });

    test("__testOnly.fromPublicId: 空・不正", () => {
        const { fromPublicId } = orderService.__testOnly;
        expect(fromPublicId("")).toBeNull();
        expect(fromPublicId("W")).toBeNull();
        expect(fromPublicId("Wx")).toBeNull();
    });

    test("__testOnly.loadJson: 読込失敗で orders.json / customers.json は []", async () => {
        const { loadJson } = orderService.__testOnly;
        const spy = jest.spyOn(fs, "readFile").mockRejectedValueOnce(new Error("e"));
        await expect(loadJson(dbPath("orders.json"))).resolves.toEqual([]);
        spy.mockRestore();
        const spy2 = jest.spyOn(fs, "readFile").mockRejectedValueOnce(new Error("e2"));
        await expect(loadJson(dbPath("customers.json"))).resolves.toEqual([]);
        spy2.mockRestore();
    });

    test("__testOnly.loadJson: 読込失敗でその他パスは {}", async () => {
        const { loadJson } = orderService.__testOnly;
        const spy = jest.spyOn(fs, "readFile").mockRejectedValueOnce(new Error("e3"));
        await expect(loadJson(dbPath("rank_prices.json"))).resolves.toEqual({});
        spy.mockRestore();
    });

    test("placeOrder: カートキーが id のみ（code / productCode なし）", async () => {
        const o = await orderService.placeOrder(
            "TEST001",
            [{ id: "P001", quantity: 1, price: 1000 }],
            { name: "n", tel: "t", address: "a" },
            "A"
        );
        expect(o.items[0].code).toBe("P001");
    });

    test("placeOrder: マスタ無しで item.name が「不明」→ 商品名不明", async () => {
        const o = await orderService.placeOrder(
            "TEST001",
            [{ productCode: "NOPE_XXX", name: "不明", quantity: 1, price: 100 }],
            { name: "n", tel: "t", address: "a" },
            "A"
        );
        expect(o.items[0].name).toBe("商品名不明");
    });

    test("searchOrders: 削除顧客で deliveryInfo 名なしは未登録ID表示", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9101,
                customerId: "NOBODY",
                orderDate: "2025-04-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 100 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9101);
        expect(o.customerName).toContain("未登録ID");
    });

    test("searchOrders: 明細価格0でマスタありならランク再計算", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9102,
                customerId: "TEST003",
                orderDate: "2025-04-02T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", quantity: 1, price: 0 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9102);
        expect(o.items[0].price).toBeGreaterThan(0);
    });

    test("updateOrderStatus: キャンセルで在庫解放エラー catch", async () => {
        jest.spyOn(stockService, "release").mockRejectedValueOnce(new Error("release fail"));
        await writeJson("orders.json", [
            {
                orderId: 9201,
                customerId: "TEST001",
                orderDate: "2025-04-03T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", quantity: 1, price: 1 }],
                deliveryInfo: {},
                stockSnapshot: {
                    released: false,
                    reservedItems: [{ code: "P001", quantity: 1 }]
                }
            }
        ]);
        await orderService.updateOrderStatus(9201, { status: "キャンセル済" });
        const list = JSON.parse(require("fs").readFileSync(require("../../dbPaths").dbPath("orders.json"), "utf-8"));
        const ord = list.find((x) => x.orderId === 9201);
        expect(ord.stockSnapshot.released).toBe(false);
    });

    test("updateShipment: 最後以外の shipment を更新しても order 先頭配送欄は変えない", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9301,
                customerId: "TEST001",
                orderDate: "2025-04-04T00:00:00.000Z",
                status: "一部発送",
                items: [{ code: "P001", quantity: 2, price: 1 }],
                deliveryInfo: {},
                shipments: [
                    { shipmentId: "s1", deliveryCompany: "A", trackingNumber: "1" },
                    { shipmentId: "s2", deliveryCompany: "B", trackingNumber: "2" }
                ],
                deliveryCompany: "A",
                trackingNumber: "1"
            }
        ]);
        await orderService.updateShipment(9301, "s1", { deliveryCompany: "X", trackingNumber: "Y" });
        const list = JSON.parse(require("fs").readFileSync(require("../../dbPaths").dbPath("orders.json"), "utf-8"));
        const ord = list.find((x) => x.orderId === 9301);
        expect(ord.deliveryCompany).toBe("A");
        expect(ord.shipments[0].deliveryCompany).toBe("X");
    });

    test("markOrdersAsExported: 存在しない orderId はスキップされても成功", async () => {
        await writeJson("orders.json", [{ orderId: 1, customerId: "TEST001", items: [], status: "未発送" }]);
        await orderService.markOrdersAsExported([999999]);
        const list = JSON.parse(require("fs").readFileSync(require("../../dbPaths").dbPath("orders.json"), "utf-8"));
        expect(list[0].exported_at).toBeFalsy();
    });

    test("importFlamData: 正規表現パターン無効でフォールバック", async () => {
        jest.spyOn(settingsService, "getLogisticsCsvImportConfig").mockResolvedValue({
            publicIdPattern: "[",
            memoFields: ["社内メモ"],
            deliveryDate: ["納期"],
            orderNumber: ["注文"],
            customerName: ["顧客"],
            orderTotal: ["合計"],
            orderDate: ["日付"],
            importSourceLabel: "  "
        });
        const csv = "社内メモ,納期\nW00000000001,2025-01-01\n";
        const buf = require("iconv-lite").encode(csv, "Shift_JIS");
        const r = await orderService.importFlamData(buf);
        expect(r.success).toBe(true);
    });

    test("importFlamData: メモが W番号にマッチしない行は新規作成", async () => {
        jest.spyOn(settingsService, "getLogisticsCsvImportConfig").mockResolvedValue({
            publicIdPattern: "W(\\d{11})",
            memoFields: ["社内メモ"],
            deliveryDate: ["納期"],
            orderNumber: ["注文"],
            customerName: ["顧客"],
            orderTotal: ["合計"],
            orderDate: ["日付"],
            importSourceLabel: "カスタム取込"
        });
        await writeJson("orders.json", []);
        const csv = "社内メモ,顧客,合計,日付,納期\nなし,山田,100,2025-01-01,2025-01-02\n";
        const buf = require("iconv-lite").encode(csv, "Shift_JIS");
        const r = await orderService.importFlamData(buf);
        expect(r.stats.created).toBeGreaterThanOrEqual(1);
        expect(r.success).toBe(true);
    });

    test("importExternalOrders: null 行と重複はスキップ", async () => {
        await writeJson("orders.json", [{ orderId: 1, customerId: "X", items: [], status: "未発送" }]);
        const r = await orderService.importExternalOrders([
            null,
            { orderId: null },
            { orderId: 1 },
            { orderId: 2, customerId: "Y", items: [], status: "未発送" }
        ]);
        expect(r.skippedCount).toBeGreaterThanOrEqual(2);
        expect(r.createdCount).toBeGreaterThanOrEqual(1);
    });

    test("importExternalOrders: orders.json が配列でないとき空からマージ", async () => {
        await writeJson("orders.json", {});
        const r = await orderService.importExternalOrders([
            { orderId: 888001, customerId: "Z", items: [], status: "未発送" }
        ]);
        expect(r.createdCount).toBe(1);
        const list = JSON.parse(require("fs").readFileSync(require("../../dbPaths").dbPath("orders.json"), "utf-8"));
        expect(Array.isArray(list)).toBe(true);
        expect(list.some((o) => o.orderId === 888001)).toBe(true);
    });

    test("searchOrders: コード空で品名がマスタと一致すると code を復元", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9105,
                customerId: "TEST001",
                orderDate: "2025-04-05T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "", name: "テストトナーA", quantity: 1, price: 50 }],
                deliveryInfo: {}
            }
        ]);
        const rows = await orderService.searchOrders({ isAdmin: true });
        const o = rows.find((x) => x.orderId === 9105);
        expect(o.items[0].code).toBe("P001");
    });

    test("updateShipment: 最後の shipment を更新すると order 配送欄も更新", async () => {
        await writeJson("orders.json", [
            {
                orderId: 9302,
                customerId: "TEST001",
                orderDate: "2025-04-04T00:00:00.000Z",
                status: "一部発送",
                items: [{ code: "P001", quantity: 2, price: 1 }],
                deliveryInfo: {},
                shipments: [
                    { shipmentId: "s1", deliveryCompany: "A", trackingNumber: "1" },
                    { shipmentId: "s2", deliveryCompany: "B", trackingNumber: "2" }
                ],
                deliveryCompany: "A",
                trackingNumber: "1"
            }
        ]);
        await orderService.updateShipment(9302, "s2", { deliveryCompany: "LASTCO", trackingNumber: "LASTTRK" });
        const list = JSON.parse(require("fs").readFileSync(require("../../dbPaths").dbPath("orders.json"), "utf-8"));
        const ord = list.find((x) => x.orderId === 9302);
        expect(ord.deliveryCompany).toBe("LASTCO");
        expect(ord.trackingNumber).toBe("LASTTRK");
    });

    test("placeOrder: 既存注文に非数 orderId があっても新規 ID を採番", async () => {
        await writeJson("orders.json", [
            {
                orderId: "not-numeric",
                customerId: "TEST001",
                orderDate: "2025-01-01T00:00:00.000Z",
                status: "未発送",
                items: [],
                deliveryInfo: {}
            }
        ]);
        const o = await orderService.placeOrder(
            "TEST001",
            [{ productCode: "P001", quantity: 1, price: 100 }],
            { name: "n", tel: "t", address: "a" },
            "A"
        );
        expect(typeof o.orderId).toBe("number");
        expect(Number.isFinite(o.orderId)).toBe(true);
    });
});
