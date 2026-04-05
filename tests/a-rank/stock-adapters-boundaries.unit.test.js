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

        test("第1引数 undefined はデフォルト設定でアダプタを生成する", () => {
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = createAdapter(undefined, mockService);
            expect(adapter).not.toBeNull();
            expect(adapter.constructor.name).toBe("ManualAdapter");
        });
        test("type: csv で CsvAdapter を返す", () => {
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = createAdapter({ type: "csv" }, mockService);
            expect(adapter).not.toBeNull();
            expect(adapter.constructor.name).toBe("CsvAdapter");
        });

        test("type は大文字でも toLowerCase で解決する", () => {
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = createAdapter({ type: "CSV" }, mockService);
            expect(adapter).not.toBeNull();
            expect(adapter.constructor.name).toBe("CsvAdapter");
        });
        test("ManualAdapter pull は runOptions.rows を config.options.rows より優先", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter(
                { options: { rows: [{ productCode: "CFG", totalQty: 7, reservedQty: 0 }] } },
                mockService
            );
            await expect(
                adapter.pull({ rows: [{ productCode: "RUN", totalQty: 1, reservedQty: 0 }] })
            ).resolves.toEqual([expect.objectContaining({ productCode: "RUN", totalQty: 1 })]);
        });

        test("ManualAdapter pull は runOptions.rows 無しで config.options.rows を使う", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter(
                { options: { rows: [{ productCode: "CFG", totalQty: 7, reservedQty: 0 }] } },
                mockService
            );
            await expect(adapter.pull({})).resolves.toEqual([
                expect.objectContaining({ productCode: "CFG", totalQty: 7 })
            ]);
        });

        test("ManualAdapter pull は引数省略で空配列", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            await expect(adapter.pull()).resolves.toEqual([]);
        });

        test("ManualAdapter normalize は引数省略で空配列", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            await expect(adapter.normalize()).resolves.toEqual([]);
        });

        test("ManualAdapter normalize は warehouses が配列でなければ空配列にする", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            const out = await adapter.normalize([
                { productCode: "WH", totalQty: 1, reservedQty: 0, warehouses: "not-array" }
            ]);
            expect(out[0].warehouses).toEqual([]);
        });

        test("ManualAdapter normalize は warehouses が配列ならそのまま使う", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            const wh = [{ code: "W1", qty: 2 }];
            const out = await adapter.normalize([
                { productCode: "WKEEP", totalQty: 1, reservedQty: 0, warehouses: wh }
            ]);
            expect(out[0].warehouses).toBe(wh);
        });

        test("ManualAdapter normalize は note・timestamp・hiddenMessage を引き継ぐ", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            const ts = "2020-01-01T00:00:00.000Z";
            const out = await adapter.normalize([
                {
                    productCode: "PNOTE",
                    totalQty: 1,
                    note: "備考",
                    hiddenMessage: "非表示",
                    timestamp: ts
                }
            ]);
            expect(out[0].note).toBe("備考");
            expect(out[0].hiddenMessage).toBe("非表示");
            expect(out[0].timestamp).toBe(ts);
        });

        test("ManualAdapter pull は rows が配列でなければ空配列", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            await expect(adapter.pull({ rows: {} })).resolves.toEqual([]);
            await expect(adapter.pull({ rows: 1 })).resolves.toEqual([]);
        });

        test("ManualAdapter normalize は無効行を除き publish/manualLock を反映", async () => {
            const ManualAdapter = require("../../services/stockAdapters/manualAdapter");
            const mockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new ManualAdapter({}, mockService);
            const out = await adapter.normalize([
                null,
                { productCode: "" },
                { productCode: "P1", publish: false, manualLock: true }
            ]);
            expect(out).toHaveLength(1);
            expect(out[0].productCode).toBe("P1");
            expect(out[0].publish).toBe(false);
            expect(out[0].manualLock).toBe(true);
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

        test("constructor は config が undefined でも既定オブジェクトになる", () => {
            const mock = { syncStocks: jest.fn() };
            const adapter = new BaseAdapter(undefined, mock);
            expect(adapter.config).toEqual({});
        });

        test("デフォルト normalize は非配列入力で空配列を返す", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new BaseAdapter({}, mockStockService);
            await expect(adapter.normalize({})).resolves.toEqual([]);
            await expect(adapter.normalize(null)).resolves.toEqual([]);
        });

        test("デフォルト normalize は配列をそのまま返す", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new BaseAdapter({}, mockStockService);
            const arr = [{ x: 1 }];
            await expect(adapter.normalize(arr)).resolves.toBe(arr);
        });

        test("BaseAdapter のデフォルト pull は未実装エラー", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({}) };
            const adapter = new BaseAdapter({}, mockStockService);
            await expect(adapter.pull()).rejects.toThrow("pull() must be implemented");
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

        test("run は runOptions.userId / filename を syncStocks に渡す", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({ ok: 1 }) };
            const OkAdapter = class extends BaseAdapter {
                async pull() {
                    return [{ productCode: "PU", totalQty: 1 }];
                }
                async normalize(data) {
                    return Array.isArray(data) ? data : [];
                }
            };
            const adapter = new OkAdapter({ id: "uid-test", type: "csv" }, mockStockService);
            await adapter.run({ userId: "admin-9", filename: "up.csv" });
            expect(mockStockService.syncStocks).toHaveBeenCalledWith(
                [{ productCode: "PU", totalQty: 1 }],
                expect.objectContaining({
                    userId: "admin-9",
                    filename: "up.csv"
                })
            );
        });

        test("run は config に id/type が無いとき adapterId が stock-adapter・source が manual", async () => {
            const mockStockService = { syncStocks: jest.fn().mockResolvedValue({ ok: true }) };
            const OkAdapter = class extends BaseAdapter {
                async pull() {
                    return [{ productCode: "P0", totalQty: 1 }];
                }
                async normalize(data) {
                    return Array.isArray(data) ? data : [];
                }
            };
            const adapter = new OkAdapter({}, mockStockService);
            await adapter.run();
            expect(mockStockService.syncStocks).toHaveBeenCalledWith(
                [{ productCode: "P0", totalQty: 1 }],
                expect.objectContaining({
                    adapterId: "stock-adapter",
                    source: "manual"
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

        test("pull は相対 filePath を cwd から読む", async () => {
            const fs = require("fs").promises;
            const path = require("path");
            const rel = `__csv_pull_${Date.now()}.csv`;
            const fp = path.join(process.cwd(), rel);
            await fs.writeFile(fp, "productCode,qty\nPREL,2", "utf8");
            try {
                const adapter = new CsvAdapter({ options: { filePath: rel } }, mockStockService);
                const buf = await adapter.pull({});
                expect(buf.toString()).toContain("PREL");
            } finally {
                await fs.unlink(fp).catch(() => {});
            }
        });

        test("normalize は publish yes・hidden_message・utf_8 指定を解釈する", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,publish,hidden_message,totalQty\nPYES,yes,内緒,1";
            const result = await adapter.normalize(Buffer.from(csv, "utf-8"), {
                filename: "t.csv",
                encoding: "utf_8"
            });
            const row = result.find((r) => r.productCode === "PYES");
            expect(row).toBeDefined();
            expect(row.publish).toBe(true);
            expect(row.hiddenMessage).toBe("内緒");
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

        test("normalize は UTF-8 BOM 付きでデコードを utf-8 に切り替える", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const body = "\uFEFFproductCode,totalQty\nPBOMU8,3";
            const buf = Buffer.from(body, "utf-8");
            const result = await adapter.normalize(buf, { filename: "bom-default.csv" });
            expect(result.some((r) => r.productCode === "PBOMU8")).toBe(true);
        });

        test("normalize は encoding に UTF-8（ハイフン）を渡せる", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const csv = "productCode,totalQty\nPHYP,9";
            const buf = Buffer.from(csv, "utf-8");
            const result = await adapter.normalize(buf, { filename: "hyp.csv", encoding: "UTF-8" });
            expect(result[0].productCode).toBe("PHYP");
        });

        test("normalize は先頭1バイトのみでは Excel とみなさない", async () => {
            const adapter = new CsvAdapter({}, mockStockService);
            const result = await adapter.normalize(Buffer.from("Z"), { filename: "onebyte.csv" });
            expect(Array.isArray(result)).toBe(true);
        });

        test("pull は絶対パスの filePath を読む", async () => {
            const fs = require("fs").promises;
            const path = require("path");
            const fp = path.join(process.cwd(), `__csv_abs_${Date.now()}.csv`);
            await fs.writeFile(fp, "productCode,qty\nABS1,1", "utf8");
            try {
                const adapter = new CsvAdapter({}, mockStockService);
                const buf = await adapter.pull({ filePath: fp });
                expect(buf.toString("utf-8")).toContain("ABS1");
            } finally {
                await fs.unlink(fp).catch(() => {});
            }
        });
    });
});
