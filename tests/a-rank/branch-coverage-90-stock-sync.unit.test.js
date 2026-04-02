"use strict";

/**
 * stockService.syncStocks / reserve / release の残分岐
 */
const stockService = require("../../services/stockService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const STOCKS_DB = dbPath("stocks.json");

describe("branch coverage 90: stockService syncStocks", () => {
    let orig;

    beforeEach(async () => {
        orig = await fs.readFile(STOCKS_DB, "utf-8").catch(() => "[]");
    });

    afterEach(async () => {
        await fs.writeFile(STOCKS_DB, orig, "utf-8");
    });

    test("syncStocks は manualLock で skipLocked 時スキップ", async () => {
        await fs.writeFile(
            STOCKS_DB,
            JSON.stringify(
                [
                    {
                        productCode: "LOCK1",
                        totalQty: 5,
                        reservedQty: 0,
                        warehouses: [],
                        manualLock: true,
                        publish: true
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const r = await stockService.syncStocks(
            [{ productCode: "LOCK1", totalQty: 99 }],
            { skipLocked: true }
        );
        expect(r.skippedCount).toBe(1);
        expect(r.successCount).toBe(0);
    });

    test("syncStocks は totalQty が非有限で倉庫から合算", async () => {
        await fs.writeFile(STOCKS_DB, "[]", "utf-8");
        const r = await stockService.syncStocks([
            {
                productCode: "AGG1",
                totalQty: NaN,
                warehouses: [
                    { code: "W1", qty: 3 },
                    { code: "W2", qty: 4 }
                ]
            }
        ]);
        expect(r.successCount).toBe(1);
        const list = JSON.parse(await fs.readFile(STOCKS_DB, "utf-8"));
        const row = list.find((x) => x.productCode === "AGG1");
        expect(row.totalQty).toBe(7);
    });

    test("syncStocks は allowPartial false で検証エラー時に throw", async () => {
        await expect(
            stockService.syncStocks([{ productCode: "", totalQty: 1 }], { allowPartial: false })
        ).rejects.toThrow(/検証/);
    });

    test("reserve は silent で在庫不足メッセージが短い", async () => {
        await fs.writeFile(
            STOCKS_DB,
            JSON.stringify([
                {
                    productCode: "R1",
                    totalQty: 1,
                    reservedQty: 0,
                    warehouses: []
                }
            ]),
            "utf-8"
        );
        await expect(
            stockService.reserve([{ productCode: "R1", quantity: 10 }], { silent: true })
        ).rejects.toMatchObject({ code: "STOCK_SHORTAGE" });
    });

    test("release は空配列で false", async () => {
        const r = await stockService.release([]);
        expect(r).toBe(false);
    });
});
