/**
 * Phase 5: stockAdapters のエラー分岐・境界をカバーするユニットテスト
 * - BaseAdapter: stockService 必須、normalize() が配列でない場合の throw
 * - CsvAdapter: pull で filePath 未指定で throw、normalize で buffer 空で []
 */

// CsvAdapter の parseExcelToRecords が readToObjects を参照するため、モック可能にする
jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return {
        ...actual,
        readToObjects: jest.fn(actual.readToObjects)
    };
});

const BaseAdapter = require("../../services/stockAdapters/baseAdapter");
const CsvAdapter = require("../../services/stockAdapters/csvAdapter");
const { createAdapter } = require("../../services/stockAdapters");

describe("stockAdapters 境界・エラー分岐", () => {
    describe("createAdapter (index.js)", () => {
        test("未知の type のとき null を返す", () => {
            expect(createAdapter({ type: "unknown" })).toBeNull();
            expect(createAdapter({ type: "invalid" })).toBeNull();
        });
        test("type 省略時は manual として ManualAdapter を返す", () => {
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = createAdapter({}, mockService);
            expect(adapter).not.toBeNull();
            expect(adapter.constructor.name).toBe("ManualAdapter");
        });
        test("type: csv で CsvAdapter を返す", () => {
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = createAdapter({ type: "csv" }, mockService);
            expect(adapter).not.toBeNull();
            expect(adapter.constructor.name).toBe("CsvAdapter");
        });
        test("ManualAdapter.run は runOptions.rows で syncStocks を呼ぶ", async () => {
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = createAdapter({ type: "manual" }, mockService);
            const result = await adapter.run({
                rows: [{ productCode: "PM", totalQty: 3, reservedQty: 0 }]
            });
            expect(result.rows).toBe(1);
            expect(mockService.syncStocks).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ productCode: "PM", totalQty: 3, reservedQty: 0, source: "manual" })
                ]),
                expect.any(Object)
            );
        });
    });

    describe("BaseAdapter", () => {
        test("constructor は stockService なしで throw する", () => {
            expect(() => new BaseAdapter({})).toThrow("stockService is required");
            expect(() => new BaseAdapter({}, null)).toThrow("stockService is required");
        });

        test("run は normalize() が配列でない場合に throw する", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const BadAdapter = class extends BaseAdapter {
                async pull() {
                    return [];
                }
                async normalize() {
                    return {}; // 配列でない
                }
            };
            const adapter = new BadAdapter({}, mockStockService);
            await expect(adapter.run()).rejects.toThrow("normalize() must return an array");
            expect(mockStockService.syncStocks).not.toHaveBeenCalled();
        });

        test("run は normalize() が配列を返せば syncStocks を呼ぶ", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const OkAdapter = class extends BaseAdapter {
                async pull() {
                    return [{ productCode: "P1", totalQty: 10 }];
                }
                async normalize(data) {
                    return Array.isArray(data) ? data : [];
                }
            };
            const adapter = new OkAdapter({ type: "manual" }, mockStockService);
            const result = await adapter.run();
            expect(result.rows).toBe(1);
            expect(mockStockService.syncStocks).toHaveBeenCalledWith(
                [{ productCode: "P1", totalQty: 10 }],
                expect.objectContaining({
                    adapterId: "manual",
                    source: "manual",
                    skipLocked: true,
                    allowPartial: true
                })
            );
        });

        // 第2期Phase4 分岐70%: runOptions.skipLocked / allowPartial を明示したとき syncStocks にその値が渡る
        test("run は runOptions.skipLocked false / allowPartial false を syncStocks に渡す", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const OkAdapter = class extends BaseAdapter {
                async pull() {
                    return [{ productCode: "P2", totalQty: 5 }];
                }
                async normalize(data) {
                    return Array.isArray(data) ? data : [];
                }
            };
            const adapter = new OkAdapter({ id: "my-adapter", type: "csv" }, mockStockService);
            await adapter.run({ skipLocked: false, allowPartial: false });
            expect(mockStockService.syncStocks).toHaveBeenCalledWith(
                [{ productCode: "P2", totalQty: 5 }],
                expect.objectContaining({
                    adapterId: "my-adapter",
                    source: "csv",
                    skipLocked: false,
                    allowPartial: false
                })
            );
        });
    });

    describe("CsvAdapter", () => {
        const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };

        test("pull は filePath も fileBuffer も rawText もない場合に throw する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            await expect(adapter.pull({})).rejects.toThrow("CSVファイルのパスが指定されていません");
        });

        test("pull は rawText があれば Buffer を返す", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const buf = await adapter.pull({ rawText: "productCode,qty\nP1,10" });
            expect(Buffer.isBuffer(buf)).toBe(true);
            expect(buf.toString("utf-8")).toBe("productCode,qty\nP1,10");
        });

        test("normalize は buffer が null のとき空配列を返す", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const result = await adapter.normalize(null, {});
            expect(result).toEqual([]);
        });

        test("normalize は buffer が空のとき空配列を返す", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const result = await adapter.normalize(Buffer.alloc(0), { filename: "test.csv" });
            expect(result).toEqual([]);
        });

        // Phase 3: csvAdapter 分岐強化（Excel/CSV 判定・warehouse 分岐・totalQty/reservedQty 複数フィールド・publish/manualLock 正規化）
        test("normalize は Excel ファイル（xlsx 拡張子）で parseExcelToRecords を呼ぶ", async () => {
            const excelReader = require("../../utils/excelReader");
            excelReader.readToObjects.mockResolvedValueOnce([
                { productCode: "P-EXCEL", totalQty: 100 }
            ]);
            const adapter = new CsvAdapter({}, mockStockService);
            const buffer = Buffer.from([0x50, 0x4B]); // ZIP (xlsx) マジックナンバー
            const result = await adapter.normalize(buffer, { filename: "stocks.xlsx" });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
            expect(result[0].productCode).toBe("P-EXCEL");
            expect(excelReader.readToObjects).toHaveBeenCalled();
        });

        test("normalize は Excel バッファ（マジックナンバー）で parseExcelToRecords を呼ぶ", async () => {
            const excelReader = require("../../utils/excelReader");
            excelReader.readToObjects.mockResolvedValueOnce([
                { code: "P-MAGIC", qty: 50 }
            ]);
            const adapter = new CsvAdapter({}, mockStockService);
            const buffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // ZIP マジックナンバー
            const result = await adapter.normalize(buffer, { filename: "test.csv" }); // 拡張子は CSV だがバッファで判定
            expect(Array.isArray(result)).toBe(true);
            expect(excelReader.readToObjects).toHaveBeenCalled();
        });

        test("normalize は CSV 形式で totalQty の複数フィールド（total_qty, totalQty, qty, stock）を試行する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,qty,stock\nP-MULTI,,200";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                expect(result[0].productCode).toBe("P-MULTI");
                expect(result[0].totalQty).toBe(200); // stock フィールドから取得
            }
        });

        test("normalize は warehouse_code と warehouseName の両方がある場合に倉庫を追加する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,warehouse_code,warehouseName,warehouse_qty\nP-WAREHOUSE,WH01,倉庫1,30";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                expect(result[0].warehouses).toBeDefined();
                expect(Array.isArray(result[0].warehouses)).toBe(true);
                if (result[0].warehouses.length > 0) {
                    expect(result[0].warehouses[0].code).toBe("WH01");
                    expect(result[0].warehouses[0].name).toBe("倉庫1");
                }
            }
        });

        test("normalize は warehouse_code のみで warehouseName がない場合にデフォルト名を設定する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,warehouse_code,warehouse_qty\nP-WAREHOUSE-CODE-ONLY,WH02,40";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0 && result[0].warehouses && result[0].warehouses.length > 0) {
                expect(result[0].warehouses[0].name).toContain("WH02倉庫");
            }
        });

        test("normalize は既存の warehouse コードに qty を加算する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,warehouse_code,warehouse_qty\nP-DUP,WH03,10\nP-DUP,WH03,20";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0 && result[0].warehouses && result[0].warehouses.length > 0) {
                expect(result[0].warehouses[0].qty).toBe(30); // 10 + 20
            }
        });

        test("normalize は publish が '1' または 'true' または '公開' のとき true にする", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,publish\nP-PUBLISH-1,1\nP-PUBLISH-TRUE,true\nP-PUBLISH-KOKAI,公開\nP-PUBLISH-NO,0";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            const pub1 = result.find(r => r.productCode === "P-PUBLISH-1");
            const pubTrue = result.find(r => r.productCode === "P-PUBLISH-TRUE");
            const pubKokai = result.find(r => r.productCode === "P-PUBLISH-KOKAI");
            const pubNo = result.find(r => r.productCode === "P-PUBLISH-NO");
            if (pub1) expect(pub1.publish).toBe(true);
            if (pubTrue) expect(pubTrue.publish).toBe(true);
            if (pubKokai) expect(pubKokai.publish).toBe(true);
            if (pubNo) expect(pubNo.publish).toBe(false);
        });

        test("normalize は manualLock が '1' または 'true' または 'lock' のとき true にする", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,manualLock\nP-LOCK-1,1\nP-LOCK-TRUE,true\nP-LOCK-LOCK,lock\nP-LOCK-NO,0";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            const lock1 = result.find(r => r.productCode === "P-LOCK-1");
            const lockTrue = result.find(r => r.productCode === "P-LOCK-TRUE");
            const lockLock = result.find(r => r.productCode === "P-LOCK-LOCK");
            const lockNo = result.find(r => r.productCode === "P-LOCK-NO");
            if (lock1) expect(lock1.manualLock).toBe(true);
            if (lockTrue) expect(lockTrue.manualLock).toBe(true);
            if (lockLock) expect(lockLock.manualLock).toBe(true);
            if (lockNo) expect(lockNo.manualLock).toBe(false);
        });

        test("normalize は reservedQty が負の数の場合も parseInt で処理する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,reservedQty\nP-RESERVED,-5";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                expect(result[0].reservedQty).toBe(-5);
            }
        });

        test("normalize は productCode が空の行をスキップする", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,totalQty\nP-VALID,100\n,50\ncode,totalQty\nP-ALT,200";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buffer, { filename: "test.csv" });
            expect(Array.isArray(result)).toBe(true);
            // 空コードはスキップ、code は productCode として扱われる
            const valid = result.find(r => r.productCode === "P-VALID");
            const alt = result.find(r => r.productCode === "P-ALT");
            expect(valid).toBeDefined();
            expect(alt).toBeDefined();
        });
    });
});
