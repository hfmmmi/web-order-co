"use strict";

const stockService = require("../../services/stockService");
const CsvAdapter = require("../../services/stockAdapters/csvAdapter");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("branch coverage 100 P2: stockService / csvAdapter", () => {
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

    test("getAllStocks は配列", async () => {
        const rows = await stockService.getAllStocks();
        expect(Array.isArray(rows)).toBe(true);
    });

    test("getStock は未定義コードで null", async () => {
        const s = await stockService.getStock("__NO_CODE_999");
        expect(s).toBeNull();
    });

    test("getDisplaySettings はオブジェクト", async () => {
        const d = await stockService.getDisplaySettings();
        expect(typeof d).toBe("object");
    });

    test("getAdapterConfig はオブジェクト", async () => {
        const c = await stockService.getAdapterConfig();
        expect(c && typeof c).toBe("object");
    });

    test("getHistory は配列", async () => {
        const h = await stockService.getHistory(10);
        expect(Array.isArray(h)).toBe(true);
    });

    test("CsvAdapter normalize は空バッファで空配列", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const rows = await adapter.normalize(Buffer.alloc(0), {});
        expect(rows).toEqual([]);
    });

    test("CsvAdapter normalize は UTF-8 CSV でレコード", async () => {
        const adapter = new CsvAdapter(
            {
                id: "t",
                type: "csv",
                options: { productCodeColumn: "code", quantityColumn: "qty" }
            },
            stockService
        );
        const csv = Buffer.from("code,qty\nP001,5\n", "utf-8");
        const rows = await adapter.normalize(csv, { filename: "t.csv", encoding: "utf-8" });
        expect(Array.isArray(rows)).toBe(true);
    });

    test("CsvAdapter pull はパスなしで例外", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        await expect(adapter.pull({})).rejects.toThrow("パス");
    });
});
