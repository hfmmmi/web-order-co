"use strict";

/**
 * stockAdapters/csvAdapter: 空バッファ・pull エラー・UTF-8 デコード分岐
 */
const CsvAdapter = require("../../services/stockAdapters/csvAdapter");
const stockService = require("../../services/stockService");

describe("branch coverage 91: CsvAdapter", () => {
    test("normalize は空バッファで空配列", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const rows = await adapter.normalize(Buffer.alloc(0), { filename: "a.csv" });
        expect(rows).toEqual([]);
    });

    test("pull は filePath 未指定で例外", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        await expect(adapter.pull({})).rejects.toThrow(/パスが指定/);
    });

    test("normalize は UTF-8 エンコーディング指定で CSV を解析する", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const csv = "product_code,total_qty\nZZ1,5\n";
        const rows = await adapter.normalize(Buffer.from(csv, "utf-8"), {
            filename: "stock.csv",
            encoding: "utf-8"
        });
        expect(rows.length).toBe(1);
        expect(rows[0].productCode).toBe("ZZ1");
    });
});
