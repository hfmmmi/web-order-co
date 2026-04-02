"use strict";

/**
 * orderCsvExport: resolveOrderCsvSpec / generateOrdersCsv の分岐
 */
const {
    generateOrdersCsv,
    getDefaultOrderCsvSpec,
    resolveOrderCsvSpec
} = require("../../services/csv/orderCsvExport");

describe("branch coverage 90: orderCsvExport", () => {
    const builtIn = getDefaultOrderCsvSpec();

    test("resolveOrderCsvSpec は custom が null のときデフォルト", () => {
        expect(resolveOrderCsvSpec(null)).toEqual(builtIn);
    });

    test("resolveOrderCsvSpec は空 headerLine でデフォルトヘッダー", () => {
        const r = resolveOrderCsvSpec({ headerLine: "   ", columnKeys: builtIn.columnKeys });
        expect(r.headerLine).toBe(builtIn.headerLine);
    });

    test("resolveOrderCsvSpec は列数一致の columnKeys を採用", () => {
        const hl = "a,b,c";
        const r = resolveOrderCsvSpec({
            headerLine: hl,
            columnKeys: ["orderId", "orderDate", "customerId"]
        });
        expect(r.headerLine).toBe(hl);
        expect(r.columnKeys).toEqual(["orderId", "orderDate", "customerId"]);
    });

    test("resolveOrderCsvSpec は columnKeys 長さがヘッダー列数と不一致ならデフォルト", () => {
        const r = resolveOrderCsvSpec({
            headerLine: "a,b",
            columnKeys: ["orderId"]
        });
        expect(r).toEqual(builtIn);
    });

    test("resolveOrderCsvSpec は builtIn と同じ長さの columnKeys を許容", () => {
        const keys2 = [...builtIn.columnKeys];
        keys2[0] = "orderId";
        const r = resolveOrderCsvSpec({ headerLine: builtIn.headerLine, columnKeys: keys2 });
        expect(r.columnKeys[0]).toBe("orderId");
    });

    test("generateOrdersCsv は isUnexportedOnly で exported_at 行を除外", () => {
        const spec = {
            headerLine: "h1,h2\n",
            columnKeys: ["orderId", "productCode"]
        };
        const csv = generateOrdersCsv(
            [
                {
                    orderId: 1,
                    customerId: "C",
                    items: [{ code: "P", name: "n", price: 1, quantity: 2 }],
                    exported_at: "x"
                },
                {
                    orderId: 2,
                    customerId: "C",
                    items: [{ code: "Q", name: "n", price: 1, quantity: 1 }]
                }
            ],
            [],
            [],
            [],
            {},
            true,
            spec
        );
        expect(csv).not.toContain('"1"');
        expect(csv).toContain('"2"');
    });

    test("generateOrdersCsv は resolveOrderCsvCell の各トークンを通す", () => {
        const spec = {
            headerLine: "c1,c2,c3,c4,c5,c6,c7,c8,c9,c10\n",
            columnKeys: [
                "orderId",
                "orderDate",
                "customerId",
                "customerName",
                "deliveryNote",
                "internalMemo",
                "productCode",
                "productName",
                "unitPrice",
                "quantity"
            ]
        };
        const csv = generateOrdersCsv(
            [
                {
                    orderId: 99,
                    orderDate: "2025-06-01T00:00:00.000Z",
                    customerId: "CID",
                    customerName: "NM",
                    deliveryInfo: { note: "DN" },
                    internalMemo: "memo",
                    items: [{ code: "PC", name: "PN", price: 100, quantity: 3 }]
                }
            ],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        expect(csv).toContain("99");
        expect(csv).toContain("CID");
        expect(csv).toContain("DN");
        expect(csv).toContain("memo");
        expect(csv).toContain("PC");
        expect(csv).toContain("100");
        expect(csv).toContain("3");
    });

    test("generateOrdersCsv は literal:0 と empty を含められる", () => {
        const spec = {
            headerLine: "a,b\n",
            columnKeys: ["literal:0", "empty"]
        };
        const csv = generateOrdersCsv(
            [{ orderId: 1, customerId: "C", items: [{ code: "P", name: "n", price: 1, quantity: 1 }] }],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        expect(csv).toContain('"0"');
    });
});
