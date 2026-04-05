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

    test("normalize は code 列のみで商品コードを拾う", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const csv = "code,total_qty\nZZ2,3\n";
        const rows = await adapter.normalize(Buffer.from(csv, "utf-8"), { filename: "a.csv" });
        expect(rows.length).toBe(1);
        expect(rows[0].productCode).toBe("ZZ2");
        expect(rows[0].totalQty).toBe(3);
    });

    test("normalize は reservedQty・publish・hiddenMessage・manualLock を解釈", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const csv =
            "product_code,total_qty,reserved_qty,publish,hidden_message,manual_lock\n" +
            "ZZ3,10,2,true,在庫調整中,1\n";
        const rows = await adapter.normalize(Buffer.from(csv, "utf-8"), { filename: "b.csv" });
        expect(rows[0].reservedQty).toBe(2);
        expect(rows[0].publish).toBe(true);
        expect(rows[0].hiddenMessage).toBe("在庫調整中");
        expect(rows[0].manualLock).toBe(true);
    });

    test("normalize は同一倉庫コードの行で数量を合算", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const csv =
            "product_code,total_qty,warehouse_code,warehouse_qty\n" +
            "ZZ4,0,W1,3\n" +
            "ZZ4,0,W1,2\n";
        const rows = await adapter.normalize(Buffer.from(csv, "utf-8"), { filename: "c.csv" });
        expect(rows.length).toBe(1);
        const w = rows[0].warehouses.find((x) => x.code === "W1");
        expect(w.qty).toBe(5);
    });

    test("normalize は Shift_JIS 風バイナリでも解釈を試みる", async () => {
        const adapter = new CsvAdapter({ id: "t", type: "csv", options: {} }, stockService);
        const iconv = require("iconv-lite");
        const csv = "product_code,total_qty\nZZ5,1\n";
        const buf = iconv.encode(csv, "Shift_JIS");
        const rows = await adapter.normalize(buf, { filename: "sjis.csv" });
        expect(rows.length).toBe(1);
        expect(rows[0].productCode).toBe("ZZ5");
    });
});
