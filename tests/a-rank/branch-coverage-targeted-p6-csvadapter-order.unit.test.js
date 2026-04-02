"use strict";

const CsvAdapter = require("../../services/stockAdapters/csvAdapter");
const stockService = require("../../services/stockService");
const orderService = require("../../services/orderService");
const { calculateFinalPrice } = require("../../utils/priceCalc");
const csvService = require("../../services/csvService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

function makeAdapter() {
    return new CsvAdapter({ id: "p6-csv", type: "csv", options: { encoding: "utf-8" } }, stockService);
}

describe("branch-coverage-targeted-p6: CsvAdapter.normalize", () => {
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

    test("空バッファは []", async () => {
        const a = makeAdapter();
        await expect(a.normalize(Buffer.alloc(0), { filename: "a.csv" })).resolves.toEqual([]);
    });

    test("product_code + total_qty", async () => {
        const a = makeAdapter();
        const csv = "product_code,total_qty\nCA1,42\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "a.csv" });
        expect(r[0].productCode).toBe("CA1");
        expect(r[0].totalQty).toBe(42);
    });

    test("productCode + stock 別名", async () => {
        const a = makeAdapter();
        const csv = "productCode,stock\nCA2,7\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "b.csv" });
        expect(r[0].totalQty).toBe(7);
    });

    test("code + qty", async () => {
        const a = makeAdapter();
        const csv = "code,qty\nCA3,8\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "c.csv" });
        expect(r[0].productCode).toBe("CA3");
        expect(r[0].totalQty).toBe(8);
    });

    test("totalQty 数値文字にカンマ", async () => {
        const a = makeAdapter();
        const csv = "code,totalQty\nCA4,\"1,234\"\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "d.csv" });
        expect(r[0].totalQty).toBe(1234);
    });

    test("reserved_qty", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,reserved_qty\nCA5,10,2\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "e.csv" });
        expect(r[0].reservedQty).toBe(2);
    });

    test("reservedQty キャメル", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,reservedQty\nCA6,10,3\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "f.csv" });
        expect(r[0].reservedQty).toBe(3);
    });

    test("publish 1", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,publish\nCA7,1,1\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "g.csv" });
        expect(r[0].publish).toBe(true);
    });

    test("visible true", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,visible\nCA8,1,true\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "h.csv" });
        expect(r[0].publish).toBe(true);
    });

    test("publish 公開", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,publish\nCA9,1,公開\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "i.csv" });
        expect(r[0].publish).toBe(true);
    });

    test("hidden_message", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,hidden_message\nCA10,1,非表示理由\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "j.csv" });
        expect(r[0].hiddenMessage).toBe("非表示理由");
    });

    test("manual_lock 1", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,manual_lock\nCA11,1,1\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "k.csv" });
        expect(r[0].manualLock).toBe(true);
    });

    test("manualLock lock", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,manualLock\nCA12,1,lock\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "l.csv" });
        expect(r[0].manualLock).toBe(true);
    });

    test("倉庫コードと数量", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,warehouse_code,warehouse_qty\nCA13,0,W1,4\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "m.csv" });
        expect(r[0].warehouses.some((w) => w.code === "W1" && w.qty === 4)).toBe(true);
    });

    test("倉庫名のみで code default", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,warehouse_name,warehouse_qty\nCA14,0,名倉,2\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "n.csv" });
        expect(r[0].warehouses.length).toBeGreaterThan(0);
    });

    test("同一倉庫行の加算", async () => {
        const a = makeAdapter();
        const csv =
            "code,total_qty,warehouse_code,warehouse_qty\nCA15,0,W2,1\nCA15,0,W2,2\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "o.csv" });
        const w = r[0].warehouses.find((x) => x.code === "W2");
        expect(w.qty).toBe(3);
    });

    test("timestamp 列", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,timestamp\nCA16,1,2026-01-01T00:00:00Z\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "p.csv" });
        expect(r[0].timestamp).toBeTruthy();
    });

    test("last_synced_at", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,last_synced_at\nCA17,1,2026-02-02\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "q.csv" });
        expect(r[0].timestamp).toBe("2026-02-02");
    });

    test("updated_at", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty,updated_at\nCA18,1,2026-03-03\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "r.csv" });
        expect(r[0].timestamp).toBe("2026-03-03");
    });

    test("コード空行はスキップ", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty\n,1\nCA19,5\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "s.csv" });
        expect(r.length).toBe(1);
    });

    test("encoding utf_8 オプション", async () => {
        const a = makeAdapter();
        const csv = "code,total_qty\nCA20,1\n";
        const r = await a.normalize(Buffer.from(csv), { filename: "t.csv", encoding: "utf_8" });
        expect(r[0].productCode).toBe("CA20");
    });

    test("pull rawText", async () => {
        const a = makeAdapter();
        const buf = await a.pull({ rawText: "code,total_qty\nCA21,9\n" });
        const r = await a.normalize(buf, { filename: "u.csv" });
        expect(r[0].totalQty).toBe(9);
    });

    test("pull fileBuffer", async () => {
        const a = makeAdapter();
        const buf = await a.pull({ fileBuffer: Buffer.from("code,total_qty\nCA22,3\n") });
        const r = await a.normalize(buf, { filename: "v.csv" });
        expect(r[0].productCode).toBe("CA22");
    });
});

describe("branch-coverage-targeted-p6: orderService 追加", () => {
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

    test("updateShipment 無い注文は例外", async () => {
        await expect(orderService.updateShipment("N", 1, {})).rejects.toThrow("Order not found");
    });

    test("updateShipment 更新", async () => {
        await writeJson("orders.json", [
            {
                orderId: "SH1",
                customerId: "TEST001",
                orderDate: "2026-01-01T00:00:00.000Z",
                status: "未発送",
                shipments: [{ shipmentId: 100, trackingNumber: "old" }],
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        await expect(
            orderService.updateShipment("SH1", 100, { trackingNumber: "newtrk" })
        ).resolves.toBe(true);
    });

    test("registerShipment 無い注文", async () => {
        await expect(
            orderService.registerShipment("ZZ", [{ deliveryCompany: "a", trackingNumber: "b", items: [] }])
        ).rejects.toThrow("Order not found");
    });

    test("updateOrderStatus 無い注文", async () => {
        await expect(orderService.updateOrderStatus("NONE", { status: "x" })).rejects.toThrow("Order not found");
    });

    test("searchOrders キーワード は注文ID・顧客ID のみ（明細名は未検索）", async () => {
        await writeJson("orders.json", [
            {
                orderId: "KWITEM-1",
                customerId: "TEST001",
                orderDate: "2026-06-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "ZZZ999", name: "明細だけの名前", price: 1, quantity: 1 }]
            }
        ]);
        const byItem = await orderService.searchOrders({
            isAdmin: true,
            customerId: null,
            keyword: "明細だけ"
        });
        expect(byItem.length).toBe(0);
        const byCust = await orderService.searchOrders({
            isAdmin: true,
            customerId: null,
            keyword: "test001"
        });
        expect(byCust.some((o) => o.orderId === "KWITEM-1")).toBe(true);
    });

    test("searchOrders キーワード 注文ID 部分文字列", async () => {
        await writeJson("orders.json", [
            {
                orderId: "ABC-99",
                customerId: "TEST001",
                orderDate: "2026-06-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({
            isAdmin: true,
            customerId: null,
            keyword: "99"
        });
        expect(r.length).toBe(1);
    });

    test("markOrdersAsExported 空配列でも可", async () => {
        await expect(orderService.markOrdersAsExported([])).resolves.toBeUndefined();
    });
});

describe("branch-coverage-targeted-p6: priceCalc + csvService spec", () => {
    test("calculateFinalPrice 特価優先", () => {
        expect(
            calculateFinalPrice({ basePrice: 100, rankPrices: { A: 80 } }, "A", { specialPrice: 50 })
        ).toBe(50);
    });

    test("calculateFinalPrice ランク", () => {
        expect(calculateFinalPrice({ basePrice: 100, rankPrices: { B: 70 } }, "B", null)).toBe(70);
    });

    test("calculateFinalPrice ベース", () => {
        expect(calculateFinalPrice({ basePrice: 99, rankPrices: {} }, "Z", null)).toBe(99);
    });

    test("calculateFinalPrice ランクなしはベース", () => {
        expect(calculateFinalPrice({ basePrice: 55, rankPrices: { A: 1 } }, "", null)).toBe(55);
    });

    test("getDefaultOrderCsvSpec", () => {
        const s = csvService.getDefaultOrderCsvSpec();
        expect(s).toBeTruthy();
    });

    test("resolveOrderCsvSpec 未設定", () => {
        const s = csvService.resolveOrderCsvSpec(undefined);
        expect(s).toBeTruthy();
    });

    test("resolveOrderCsvSpec 空オブジェクト", () => {
        const s = csvService.resolveOrderCsvSpec({});
        expect(s).toBeTruthy();
    });

    test("generateOrdersCsv 空配列", () => {
        const csv = csvService.generateOrdersCsv([], [], [], [], {}, false, csvService.getDefaultOrderCsvSpec());
        expect(typeof csv).toBe("string");
        expect(csv.length).toBeGreaterThan(0);
    });
});

describe("branch-coverage-targeted-p6: CsvAdapter 追加分岐", () => {
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

    test("pull は path 無しで例外", async () => {
        const a = makeAdapter();
        await expect(a.pull({})).rejects.toThrow("パス");
    });

    test("CsvAdapter.run fileBuffer で sync まで", async () => {
        const a = makeAdapter();
        const buf = Buffer.from("code,total_qty\nRUN1,11\n");
        const r = await a.run({ fileBuffer: buf, filename: "z.csv", skipLocked: false });
        expect(r.rows).toBe(1);
        expect(r.summary.successCount).toBeGreaterThanOrEqual(1);
    });

    test("saveAdapterConfig null は例外", async () => {
        await expect(stockService.saveAdapterConfig(null)).rejects.toThrow("required");
    });

    test("saveAdapterConfig 成功", async () => {
        const c = await stockService.getAdapterConfig();
        const r = await stockService.saveAdapterConfig({ ...c, version: 1 });
        expect(r.updatedAt).toBeTruthy();
    });

    test("normalize publish false", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty,publish\nPB0,1,0\n"), { filename: "a.csv" });
        expect(r[0].publish).toBe(false);
    });

    test("normalize publish yes", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty,publish\nPB1,1,yes\n"), { filename: "a.csv" });
        expect(r[0].publish).toBe(true);
    });

    test("normalize reserved 非数は無視", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty,reserved_qty\nRSX,1,abc\n"), { filename: "a.csv" });
        expect(r[0].reservedQty).toBeUndefined();
    });

    test("normalize total_qty 全無効は totalQty 未設定に近い", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty\nTX1,\n"), { filename: "a.csv" });
        expect(r[0].productCode).toBe("TX1");
    });

    test("normalize warehouse_qty 非数は 0", async () => {
        const a = makeAdapter();
        const r = await a.normalize(
            Buffer.from("code,total_qty,warehouse_code,warehouse_qty\nWQ1,0,W,x\n"),
            { filename: "a.csv" }
        );
        const w = r[0].warehouses.find((x) => x.code === "W");
        expect(w.qty).toBe(0);
    });

    test("normalize hiddenMessage キャメル", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty,hiddenMessage\nHM1,1,msg\n"), { filename: "a.csv" });
        expect(r[0].hiddenMessage).toBe("msg");
    });

    test("normalize manual_lock false 文字", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty,manual_lock\nML1,1,0\n"), { filename: "a.csv" });
        expect(r[0].manualLock).toBe(false);
    });

    test("getAllStocks 配列", async () => {
        const s = await stockService.getAllStocks();
        expect(Array.isArray(s)).toBe(true);
    });

    test("reserve code 別名", async () => {
        await stockService.saveStock({ productCode: "RV3", totalQty: 5, reservedQty: 0, warehouses: [] });
        await expect(stockService.reserve([{ code: "RV3", quantity: 1 }])).resolves.toBe(true);
    });

    test("reserve quantity 0 はスキップされ在庫不足にならない", async () => {
        await stockService.saveStock({ productCode: "RV4", totalQty: 0, reservedQty: 0, warehouses: [] });
        await expect(stockService.reserve([{ productCode: "RV4", quantity: 0 }])).resolves.toBe(true);
    });

    test("release quantity 0 は無視", async () => {
        await stockService.saveStock({ productCode: "RL2", totalQty: 1, reservedQty: 0, warehouses: [] });
        await expect(stockService.release([{ productCode: "RL2", quantity: 0 }])).resolves.toBe(true);
    });

    test("release 存在しないコード", async () => {
        await expect(stockService.release([{ productCode: "NONE", quantity: 1 }])).resolves.toBe(true);
    });

    test("toggleManualLock 切替", async () => {
        await stockService.saveStock({ productCode: "TL1", totalQty: 1, reservedQty: 0, warehouses: [] });
        await stockService.toggleManualLock("TL1", true);
        const s = await stockService.getStock("TL1");
        expect(s.manualLock).toBe(true);
    });

    test("syncStocks inputList 非配列は例外", async () => {
        await expect(stockService.syncStocks(null)).rejects.toThrow("array");
    });

    test("parseEstimatesData フリー 顧客スキップ", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価\nフリー,P001,1\n", "utf-8");
        return expect(csvService.parseEstimatesData(buf, "e.csv")).resolves.toEqual([]);
    });

    test("parseEstimatesData 空 得意先 行スキップ", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価\n,P001,1\n", "utf-8");
        return expect(csvService.parseEstimatesData(buf, "e.csv")).resolves.toEqual([]);
    });

    test("parseEstimatesData 空 商品 スキップ", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価\nTEST001,,1\n", "utf-8");
        return expect(csvService.parseEstimatesData(buf, "e.csv")).resolves.toEqual([]);
    });

    test("parseEstimatesData 空 単価 スキップ", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価\nTEST001,P001,\n", "utf-8");
        return expect(csvService.parseEstimatesData(buf, "e.csv")).resolves.toEqual([]);
    });

    test("parseExternalOrdersCsv 1行のみ", () => {
        expect(csvService.parseExternalOrdersCsv(Buffer.from("only\n", "utf-8"))).toEqual([]);
    });

    test("parseShippingCsv 1行のみ", () => {
        expect(csvService.parseShippingCsv(Buffer.from("only\n", "utf-8"))).toEqual([]);
    });

    test("calculateFinalPrice basePrice 0", () => {
        expect(calculateFinalPrice({ basePrice: 0, rankPrices: {} }, "", null)).toBe(0);
    });

    test("calculateFinalPrice basePrice undefined", () => {
        expect(calculateFinalPrice({ rankPrices: {} }, "", null)).toBe(0);
    });

    test("mergeAlias 推定: 得意先CD+品番+売価", async () => {
        const buf = Buffer.from("得意先CD,品番,売価\nTEST001,P001,50\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r.length).toBe(1);
        expect(r[0].unitPrice).toBe(50);
    });

    test("mergeAlias 推定: ProductName 列", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価,ProductName\nTEST001,P001,1,PN\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productName).toBe("PN");
    });

    test("mergeAlias ValidUntil 列", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価,ValidUntil\nTEST001,P001,1,2026-05-05\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].validUntil).toBeTruthy();
    });

    test("mergeAlias Maker 列", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価,Maker\nTEST001,P001,1,Mk\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].manufacturer).toBe("Mk");
    });

    test("mergeAlias タイトル 列", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価,タイトル\nTEST001,P001,1,Tt\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].subject).toBe("Tt");
    });

    test("mergeAlias 見積NO 小文字区別", async () => {
        const buf = Buffer.from("見積NO,得意先コード,商品コード,単価\nN2,TEST001,P001,2\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].estimateId).toBe("N2");
    });

    test("parseEstimatesData 有効期限日 別名", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価,有効期限日\nTEST001,P001,1,2026-06-06\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].validUntil).toBeTruthy();
    });

    test("parseEstimatesData Price 列（別名）", async () => {
        const buf = Buffer.from("得意先コード,商品コード,Price\nTEST001,P001,77\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].unitPrice).toBe(77);
    });

    test("orderService importExternalOrders 空配列", async () => {
        const r = await orderService.importExternalOrders([]);
        expect(r.createdCount).toBe(0);
    });

    test("stock getStock 存在", async () => {
        await stockService.saveStock({ productCode: "GS1", totalQty: 2, reservedQty: 0, warehouses: [] });
        const g = await stockService.getStock("GS1");
        expect(g.productCode).toBe("GS1");
    });

    test("normalize totalQty にマイナス記号付き数値", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty\nMN1,-5\n"), { filename: "a.csv" });
        expect(r[0].totalQty).toBe(-5);
    });

    test("normalize reserved_qty マイナス除去パース", async () => {
        const a = makeAdapter();
        const r = await a.normalize(Buffer.from("code,total_qty,reserved_qty\nMN2,10,-3\n"), { filename: "a.csv" });
        expect(r[0].reservedQty).toBe(-3);
    });

    test("parseEstimatesData 商品番号 ヘッダ", async () => {
        const buf = Buffer.from("得意先コード,商品番号,単価\nTEST001,P001,3\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productCode).toBe("P001");
    });

    test("parseEstimatesData 商品CD ヘッダ", async () => {
        const buf = Buffer.from("得意先コード,商品CD,単価\nTEST001,P002,4\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productCode).toBe("P002");
    });

    test("parseEstimatesData 決定単価 のみ価格列", async () => {
        const buf = Buffer.from("得意先コード,商品コード,決定単価\nTEST001,P001,6\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].unitPrice).toBe(6);
    });

    test("parseEstimatesData 特価 のみ価格列", async () => {
        const buf = Buffer.from("得意先コード,商品コード,特価\nTEST001,P001,7\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].unitPrice).toBe(7);
    });

    test("parseExternalOrdersCsv 英字小写ヘッダ一致", () => {
        const csv =
            "OrderId,CustomerId,CustomerName,ProductCode,ProductName,Price,Quantity,OrderDate\n" +
            "E1,C1,N,PC,P,10,1,2026-01-01\n";
        const r = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(r.length).toBe(1);
    });

    test("generateOrdersCsv 1件注文", () => {
        const spec = csvService.getDefaultOrderCsvSpec();
        const csv = csvService.generateOrdersCsv(
            [
                {
                    orderId: "GO1",
                    customerId: "TEST001",
                    customerName: "c",
                    orderDate: "2026-01-01",
                    status: "未発送",
                    items: [{ code: "P001", name: "n", price: 100, quantity: 2 }]
                }
            ],
            [{ productCode: "P001", name: "n", manufacturer: "M", category: "純正", basePrice: 100 }],
            [],
            [{ customerId: "TEST001", customerName: "c", priceRank: "A" }],
            { P001: { A: 90 } },
            false,
            spec
        );
        expect(csv).toContain("GO1");
    });

    test("syncStocks allowPartial true で errorRows あっても成功", async () => {
        const r = await stockService.syncStocks([{ productCode: "" }, { productCode: "OK1", totalQty: 1 }], {
            allowPartial: true,
            skipLocked: false
        });
        expect(r.successCount).toBeGreaterThanOrEqual(1);
    });

    test("saveStock 既存上書き", async () => {
        await stockService.saveStock({ productCode: "UP1", totalQty: 1, reservedQty: 0, warehouses: [] });
        await stockService.saveStock({ productCode: "UP1", totalQty: 9, reservedQty: 0, warehouses: [] });
        const s = await stockService.getStock("UP1");
        expect(s.totalQty).toBe(9);
    });
});
