"use strict";

const ExcelJS = require("exceljs");
const { CsvAdapter } = require("../../services/stockAdapters");

const mockStock = { syncStocks: jest.fn() };

describe("CsvAdapter.normalize 分岐拡張", () => {
    test("Excel バッファ + .xlsx は readToObjects 経路で正規化する", async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("S");
        ws.addRow([
            "product_code",
            "total_qty",
            "reserved_qty",
            "publish",
            "hidden_message",
            "manual_lock",
            "warehouse_code",
            "warehouse_qty"
        ]);
        ws.addRow(["PADP1", 100, 5, "1", "msg", "1", "本社", 30]);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        const adapter = new CsvAdapter({ id: "c1", type: "csv", options: {} }, mockStock);
        const out = await adapter.normalize(buf, { filename: "data.xlsx" });
        expect(Array.isArray(out)).toBe(true);
        expect(out.length).toBe(1);
        expect(out[0].productCode).toBe("PADP1");
        expect(out[0].totalQty).toBe(100);
        expect(out[0].reservedQty).toBe(5);
        expect(out[0].publish).toBe(true);
        expect(out[0].hiddenMessage).toBe("msg");
        expect(out[0].manualLock).toBe(true);
        expect(out[0].warehouses.some((w) => w.code === "本社")).toBe(true);
    });

    test("CSV テキストは columns パースで warehouse 行をマージする", async () => {
        const csv =
            "product_code,total_qty,warehouse_code,warehouse_qty,publish\n" +
            "PADP2,20,東,10,公開\n" +
            "PADP2,,東,5,公開\n";
        const adapter = new CsvAdapter({ id: "c2", type: "csv", options: { encoding: "utf-8" } }, mockStock);
        const out = await adapter.normalize(Buffer.from(csv, "utf-8"), { filename: "s.csv" });
        const row = out.find((r) => r.productCode === "PADP2");
        expect(row).toBeDefined();
        const wh = row.warehouses.find((w) => w.code === "東");
        expect(wh.qty).toBe(15);
    });
});
