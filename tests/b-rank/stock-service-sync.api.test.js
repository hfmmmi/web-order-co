/**
 * stockService.syncStocks の経路をカバー（在庫取込ロジック）
 * npm run test:api / test:all で実行
 */
const stockService = require("../../services/stockService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Bランク: stockService.syncStocks カバレッジ", () => {
    let backup;

    jest.setTimeout(20000);

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("syncStocks は配列でないと throw する", async () => {
        await expect(stockService.syncStocks(null)).rejects.toThrow("inputList must be an array");
        await expect(stockService.syncStocks({})).rejects.toThrow("inputList must be an array");
    });

    test("syncStocks は正常な inputList で successCount を返す", async () => {
        const result = await stockService.syncStocks([
            { productCode: "P001", totalQty: 50 }
        ]);
        expect(result.successCount).toBe(1);
        expect(result.skippedCount).toBe(0);
        expect(Array.isArray(result.errorRows)).toBe(true);
    });

    test("syncStocks は商品コードが空の行を errorRows に入れる", async () => {
        const result = await stockService.syncStocks([
            { productCode: "P001", totalQty: 10 },
            { productCode: "", totalQty: 5 },
            { productCode: "P002", totalQty: 20 }
        ]);
        expect(result.successCount).toBe(2);
        expect(result.errorRows.length).toBe(1);
        expect(result.errorRows[0].reason).toContain("商品コードが空");
    });

    test("syncStocks は allowPartial: false で errorRows があると throw する", async () => {
        await expect(
            stockService.syncStocks(
                [{ productCode: "P001" }, { productCode: "" }],
                { allowPartial: false }
            )
        ).rejects.toThrow("データ検証に失敗しました");
    });

    test("syncStocks は skipLocked: true で manualLock の行をスキップする", async () => {
        await stockService.saveStock({
            productCode: "P001",
            totalQty: 100,
            reservedQty: 0,
            manualLock: true
        });
        const result = await stockService.syncStocks([
            { productCode: "P001", totalQty: 200 }
        ], { skipLocked: true });
        expect(result.skippedCount).toBe(1);
        expect(result.successCount).toBe(0);
    });

    test("syncStocks は totalQty 未指定で倉庫合計を採用する", async () => {
        const result = await stockService.syncStocks([
            {
                productCode: "P001",
                warehouses: [
                    { code: "A", name: "倉庫A", qty: 10 },
                    { code: "B", name: "倉庫B", qty: 20 }
                ]
            }
        ]);
        expect(result.successCount).toBe(1);
        const list = await stockService.getAllStocks();
        const entry = list.find(s => s.productCode === "P001");
        expect(entry.totalQty).toBe(30);
    });
});
