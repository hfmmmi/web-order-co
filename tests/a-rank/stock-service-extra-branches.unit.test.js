"use strict";

const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const stockService = require("../../services/stockService");
const { backupDbFiles, restoreDbFiles, writeJson, seedBaseData } = require("../helpers/testSandbox");

describe("stockService 追加分岐", () => {
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

    test("_ensureStorage は初期化後に再入しても即 return", async () => {
        await stockService._readyPromise;
        await stockService._ensureStorage();
        await expect(stockService._ensureStorage()).resolves.toBeUndefined();
    });

    test("getAllStocks は stocks.json が配列でないとき [] を返す", async () => {
        await stockService._readyPromise;
        await writeJson("stocks.json", { notAnArray: true });
        const list = await stockService.getAllStocks();
        expect(Array.isArray(list)).toBe(true);
        expect(list).toEqual([]);
    });

    test("syncStocks は totalQty が非有限かつ warehouses ありで合算する", async () => {
        await stockService._readyPromise;
        await writeJson("stocks.json", []);
        await stockService.syncStocks(
            [
                {
                    productCode: "SUM1",
                    warehouses: [{ code: "w1", name: "W1", qty: 3 }, { code: "w2", name: "W2", qty: 2 }]
                }
            ],
            { skipLocked: false, allowPartial: true }
        );
        const all = await stockService.getAllStocks();
        const row = all.find((s) => s.productCode === "SUM1");
        expect(row).toBeDefined();
        expect(row.totalQty).toBe(5);
    });

    test("syncStocks は allowPartial false でエラー行があると throw", async () => {
        await stockService._readyPromise;
        await writeJson("stocks.json", []);
        await expect(
            stockService.syncStocks([{ productCode: "", totalQty: 1 }], { allowPartial: false })
        ).rejects.toThrow("データ検証に失敗しました");
    });

    test("reserve は metadata.silent で在庫不足メッセージが短い", async () => {
        await stockService._readyPromise;
        await writeJson("stocks.json", [
            { productCode: "R1", totalQty: 1, reservedQty: 0, warehouses: [], source: "manual", publish: true }
        ]);
        await expect(
            stockService.reserve([{ productCode: "R1", quantity: 99 }], { silent: true })
        ).rejects.toMatchObject({ code: "STOCK_SHORTAGE", message: "在庫不足" });
    });

    test("release は reservedQty が quantity を下回ると 0 にクランプ", async () => {
        await stockService._readyPromise;
        await writeJson("stocks.json", [
            { productCode: "REL1", totalQty: 10, reservedQty: 1, warehouses: [], source: "manual", publish: true }
        ]);
        await stockService.release([{ productCode: "REL1", quantity: 5 }]);
        const row = (await stockService.getStock("REL1"));
        expect(row.reservedQty).toBe(0);
    });

    test("getDisplaySettings は config.display が無いとき {}", async () => {
        await stockService._readyPromise;
        const p = dbPath("config/stocks-adapters.json");
        await fs.writeFile(p, JSON.stringify({ version: 1, adapters: [] }, null, 2), "utf-8");
        const d = await stockService.getDisplaySettings();
        expect(d).toEqual({});
    });
});
