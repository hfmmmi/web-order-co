"use strict";

const ManualAdapter = require("../../services/stockAdapters/manualAdapter");

const mockStock = { syncStocks: jest.fn().mockResolvedValue({}) };

describe("ManualAdapter", () => {
    test("pull は runOptions.rows を優先する", async () => {
        const a = new ManualAdapter({ options: { rows: [{ productCode: "X" }] } }, mockStock);
        const r = await a.pull({ rows: [{ productCode: "Y" }] });
        expect(r).toHaveLength(1);
        expect(r[0].productCode).toBe("Y");
    });

    test("pull は config.options.rows を使う", async () => {
        const a = new ManualAdapter({ options: { rows: [{ productCode: "CFG" }] } }, mockStock);
        const r = await a.pull({});
        expect(r[0].productCode).toBe("CFG");
    });

    test("pull は行が無ければ空配列", async () => {
        const a = new ManualAdapter({}, mockStock);
        const r = await a.pull({});
        expect(r).toEqual([]);
    });

    test("pull は非配列 rows を空配列にする", async () => {
        const a = new ManualAdapter({ options: { rows: "bad" } }, mockStock);
        const r = await a.pull({ rows: null });
        expect(r).toEqual([]);
    });

    test("normalize は productCode なし行を落とし、数値と publish を正規化する", async () => {
        const a = new ManualAdapter({}, mockStock);
        const rows = await a.normalize([
            null,
            { productCode: "" },
            {
                productCode: "P1",
                totalQty: NaN,
                reservedQty: 2,
                warehouses: "no",
                publish: false,
                manualLock: true,
                hiddenMessage: "h",
                note: "n"
            }
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].productCode).toBe("P1");
        expect(rows[0].totalQty).toBe(0);
        expect(rows[0].reservedQty).toBe(2);
        expect(rows[0].warehouses).toEqual([]);
        expect(rows[0].publish).toBe(false);
        expect(rows[0].manualLock).toBe(true);
    });
});
