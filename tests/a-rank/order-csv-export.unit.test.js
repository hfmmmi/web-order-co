"use strict";

const {
    resolveOrderCsvSpec,
    generateOrdersCsv,
    getDefaultOrderCsvSpec
} = require("../../services/csv/orderCsvExport");

describe("orderCsvExport", () => {
    test("getDefaultOrderCsvSpec は列キーとヘッダーを返す", () => {
        const s = getDefaultOrderCsvSpec();
        expect(s.headerLine.length).toBeGreaterThan(50);
        expect(s.columnKeys.length).toBeGreaterThan(50);
    });

    test("resolveOrderCsvSpec は null でデフォルト", () => {
        const d = getDefaultOrderCsvSpec();
        expect(resolveOrderCsvSpec(null)).toEqual(d);
        expect(resolveOrderCsvSpec(undefined)).toEqual(d);
    });

    test("resolveOrderCsvSpec はカスタム headerLine を trim", () => {
        const r = resolveOrderCsvSpec({
            headerLine: "  a,b,c  ",
            columnKeys: ["orderId", "orderDate", "customerId"]
        });
        expect(r.headerLine).toBe("a,b,c");
        expect(r.columnKeys).toEqual(["orderId", "orderDate", "customerId"]);
    });

    test("resolveOrderCsvSpec は columnKeys 長がヘッダー列数と一致しないときデフォルト", () => {
        const d = getDefaultOrderCsvSpec();
        const r = resolveOrderCsvSpec({
            headerLine: "a,b",
            columnKeys: ["x"]
        });
        expect(r).toEqual(d);
    });

    test("resolveOrderCsvSpec は columnKeys を builtIn 長に合わせて採用", () => {
        const builtIn = getDefaultOrderCsvSpec();
        const altKeys = builtIn.columnKeys.map((k) => (k === "empty" ? "empty" : k));
        const r = resolveOrderCsvSpec({ columnKeys: altKeys });
        expect(r.columnKeys.length).toBe(builtIn.columnKeys.length);
    });

    test("generateOrdersCsv は isUnexportedOnly とセル解決", () => {
        const spec = {
            headerLine: "oid,date,cid,cname,code,name,price,qty",
            columnKeys: [
                "orderId",
                "orderDate",
                "customerId",
                "customerName",
                "productCode",
                "productName",
                "unitPrice",
                "quantity"
            ]
        };
        const orders = [
            {
                orderId: "O1",
                orderDate: "2024-06-15T00:00:00.000Z",
                customerId: "C1",
                customerName: "N1",
                exported_at: "x",
                deliveryInfo: { note: "dn" },
                internalMemo: "memo",
                items: [{ code: "P1", name: "PN", price: 10, quantity: 2 }]
            },
            {
                orderId: "O2",
                orderDate: "",
                customerId: "",
                customerName: "",
                items: [{ code: null, name: null, price: null, quantity: null }]
            }
        ];
        const csv = generateOrdersCsv(orders, [], [], [], {}, true, spec);
        expect(csv.startsWith("\uFEFF")).toBe(true);
        expect(csv).toContain("O2");
        expect(csv).not.toContain("O1");
    });

    test("generateOrdersCsv は literal トークンと default resolve", () => {
        const spec = {
            headerLine: "a,b",
            columnKeys: ["literal:0", "unknownKey"]
        };
        const orders = [{ orderId: "X", items: [{ code: "c" }] }];
        const csv = generateOrdersCsv(orders, [], [], [], {}, false, spec);
        expect(csv).toContain('"0"');
    });
});
