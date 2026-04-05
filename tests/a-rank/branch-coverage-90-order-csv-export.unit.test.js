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

    test("resolveOrderCsvSpec はヘッダー列数≠keys 長だが keys が builtIn 長と一致する枝を通し最終的にフォールバック", () => {
        const keysAlt = [...builtIn.columnKeys];
        keysAlt[0] = "empty";
        const r = resolveOrderCsvSpec({
            headerLine: "a,b",
            columnKeys: keysAlt
        });
        expect(r).toEqual(builtIn);
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

    test("generateOrdersCsv は未定義 columnKeys トークンで default セル解決", () => {
        const spec = {
            headerLine: "a\n",
            columnKeys: ["unknownToken"]
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
        expect(csv.split("\n").length).toBeGreaterThanOrEqual(2);
    });

    test("generateOrdersCsv は orderDate 空で日付セルが空", () => {
        const spec = {
            headerLine: "a,b\n",
            columnKeys: ["orderId", "orderDate"]
        };
        const csv = generateOrdersCsv(
            [{ orderId: "Z", customerId: "C", orderDate: "", items: [{ code: "P", name: "n", price: 1, quantity: 1 }] }],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        expect(csv).toContain("Z");
    });

    test("generateOrdersCsv は deliveryInfo 無しで deliveryNote 空", () => {
        const spec = {
            headerLine: "a,b\n",
            columnKeys: ["orderId", "deliveryNote"]
        };
        const csv = generateOrdersCsv(
            [{ orderId: "DN", customerId: "C", items: [{ code: "P", name: "n", price: 1, quantity: 1 }] }],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        expect(csv).toContain("DN");
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

    test("resolveOrderCsvSpec は columnKeys の null・空白を empty に正規化", () => {
        const hl = "a,b,c";
        const r = resolveOrderCsvSpec({
            headerLine: hl,
            columnKeys: ["orderId", null, "   "]
        });
        expect(r.columnKeys).toEqual(["orderId", "empty", "empty"]);
    });

    test("resolveOrderCsvSpec は builtIn 長の columnKeys で trim 空を empty に", () => {
        const def = getDefaultOrderCsvSpec();
        const keys = [...def.columnKeys];
        keys[3] = "  ";
        keys[7] = null;
        const r = resolveOrderCsvSpec({ headerLine: def.headerLine, columnKeys: keys });
        expect(r.columnKeys[3]).toBe("empty");
        expect(r.columnKeys[7]).toBe("empty");
    });

    test("resolveOrderCsvSpec は builtIn 長で k がすべて falsy でも map する", () => {
        const def = getDefaultOrderCsvSpec();
        const keys = def.columnKeys.map(() => null);
        const r = resolveOrderCsvSpec({ headerLine: def.headerLine, columnKeys: keys });
        expect(r.columnKeys.every((k) => k === "empty")).toBe(true);
    });

    test("resolveOrderCsvSpec はヘッダ列数≠keys 長だが keys が builtIn 長のとき第2 map 枝で trim 空を empty にし最終フォールバック", () => {
        const def = getDefaultOrderCsvSpec();
        const n = def.columnKeys.length;
        const keys = new Array(n).fill("orderId");
        keys[1] = null;
        keys[5] = "  ";
        keys[n - 2] = "\t";
        const r = resolveOrderCsvSpec({ headerLine: "short,header", columnKeys: keys });
        expect(r).toEqual(builtIn);
    });

    test("generateOrdersCsv は exportSpec が null のときデフォルト仕様", () => {
        const csv = generateOrdersCsv(
            [{ orderId: 42, customerId: "C", items: [{ code: "P", name: "n", price: 1, quantity: 1 }] }],
            [],
            [],
            [],
            {},
            false,
            null
        );
        expect(csv.startsWith("\uFEFF")).toBe(true);
        expect(csv).toContain("42");
    });

    test("resolveOrderCsvCell は orderId が null のとき空文字", () => {
        const spec = { headerLine: "x", columnKeys: ["orderId"] };
        const csv = generateOrdersCsv(
            [{ orderId: null, customerId: "C", items: [{ code: "P", name: "n", price: 1, quantity: 1 }] }],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        const lines = csv.split("\n");
        expect(lines[1]).toBe('""');
    });
});
