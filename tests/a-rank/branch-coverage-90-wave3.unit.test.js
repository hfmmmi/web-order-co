"use strict";

/**
 * 分岐カバレッジ 90% 向け wave3: csvService（parseExternalOrdersCsv / parseShippingCsv）、orderCsvExport（resolveOrderCsvSpec / generateOrdersCsv / resolveOrderCsvCell）
 */
const iconv = require("iconv-lite");

const csvService = require("../../services/csvService");
const {
    generateOrdersCsv,
    resolveOrderCsvSpec,
    getDefaultOrderCsvSpec
} = require("../../services/csv/orderCsvExport");

describe("branch coverage 90 wave3: orderCsvExport", () => {
    test("resolveOrderCsvSpec は custom が null/非オブジェクトでデフォルト", () => {
        const def = getDefaultOrderCsvSpec();
        expect(resolveOrderCsvSpec(null)).toEqual(def);
        expect(resolveOrderCsvSpec(undefined)).toEqual(def);
        expect(resolveOrderCsvSpec("bad")).toEqual(def);
    });

    test("resolveOrderCsvSpec は headerLine 空ならデフォルトヘッダー", () => {
        const def = getDefaultOrderCsvSpec();
        const r = resolveOrderCsvSpec({ headerLine: "   ", columnKeys: def.columnKeys });
        expect(r.headerLine).toBe(def.headerLine);
    });

    test("resolveOrderCsvSpec は columnKeys がヘッダ列数と一致すれば採用", () => {
        const hdr = "a,b,c";
        const keys = ["orderId", "orderDate", "customerId"];
        const r = resolveOrderCsvSpec({ headerLine: hdr, columnKeys: keys });
        expect(r.columnKeys).toEqual(keys);
        expect(r.headerLine).toBe(hdr);
    });

    test("resolveOrderCsvSpec は columnKeys が組み込みと同じ長さなら採用", () => {
        const def = getDefaultOrderCsvSpec();
        const alt = def.columnKeys.map((k) => (k === "orderId" ? "literal:9" : k));
        const r = resolveOrderCsvSpec({ headerLine: def.headerLine, columnKeys: alt });
        expect(r.columnKeys[0]).toBe("literal:9");
    });

    test("resolveOrderCsvSpec は列数不一致でデフォルトにフォールバック", () => {
        const def = getDefaultOrderCsvSpec();
        const shortKeys = def.columnKeys.slice(0, 5);
        const r = resolveOrderCsvSpec({ headerLine: def.headerLine, columnKeys: shortKeys });
        expect(r).toEqual(def);
    });

    test("generateOrdersCsv は isUnexportedOnly で exported_at 行を除外", () => {
        const spec = getDefaultOrderCsvSpec();
        const csv = generateOrdersCsv(
            [
                {
                    orderId: "O1",
                    orderDate: "2025-01-01",
                    customerId: "C",
                    customerName: "N",
                    items: [{ code: "P", name: "PN", price: 1, quantity: 2 }],
                    exported_at: "x"
                },
                {
                    orderId: "O2",
                    orderDate: "2025-01-02",
                    customerId: "C",
                    customerName: "N",
                    items: [{ code: "P2", name: "PN2", price: 3, quantity: 1 }]
                }
            ],
            [],
            [],
            [],
            {},
            true,
            spec
        );
        expect(csv).toContain("O2");
        expect(csv).not.toContain("O1");
    });

    test("generateOrdersCsv は resolveOrderCsvCell の分岐（deliveryNote, internalMemo, default）", () => {
        const hdr = "x,y";
        const keys = ["orderId", "deliveryNote", "internalMemo", "unknownToken", "empty"];
        const spec = { headerLine: hdr, columnKeys: keys };
        const csv = generateOrdersCsv(
            [
                {
                    orderId: "OID",
                    orderDate: "2025-06-01",
                    customerId: "C1",
                    customerName: "CN",
                    deliveryInfo: { note: "DN" },
                    internalMemo: 42,
                    items: [{ code: "PC", name: "PN", price: 10, quantity: 1 }]
                }
            ],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        expect(csv).toContain("OID");
        expect(csv).toContain("DN");
        expect(csv).toContain("42");
    });
});

describe("branch coverage 90 wave3: csvService parseExternalOrdersCsv / parseShippingCsv", () => {
    test("parseExternalOrdersCsv は UTF-8 BOM でデコード", () => {
        const body = "\ufefforderId,customerId,customerName,productCode,productName,price,quantity,orderDate\nOID1,C1,Name,P1,N,100,1,\n";
        const buf = Buffer.from(body, "utf-8");
        const orders = csvService.parseExternalOrdersCsv(buf);
        expect(orders.length).toBeGreaterThanOrEqual(1);
        expect(orders[0].orderId).toBe("OID1");
    });

    test("parseExternalOrdersCsv は2行未満で空配列", () => {
        expect(csvService.parseExternalOrdersCsv(Buffer.from("onlyone", "utf-8"))).toEqual([]);
    });

    test("parseExternalOrdersCsv は日本語ヘッダーで列解決", () => {
        const csv =
            "受注番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日\n" +
            "E1,CID,CNAME,PC,PN,50,2,2025/01/01\n";
        const orders = csvService.parseExternalOrdersCsv(iconv.encode(csv, "Shift_JIS"));
        expect(orders[0].items.length).toBe(1);
        expect(orders[0].totalAmount).toBe(100);
    });

    test("parseExternalOrdersCsv は同一orderIdで明細マージ", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "G1,C,C,P1,N1,10,1,\n" +
            "G1,C,C,P2,N2,20,2,\n";
        const orders = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(orders).toHaveLength(1);
        expect(orders[0].items.length).toBe(2);
    });

    test("parseShippingCsv はヘッダー行とデータをレコード化", () => {
        const csv = "荷主,追跡番号\nA,1\nB,2\n";
        const rows = csvService.parseShippingCsv(iconv.encode(csv, "Shift_JIS"));
        expect(rows).toHaveLength(2);
        expect(rows[0]["荷主"]).toBe("A");
    });
});

describe("branch coverage 90 wave3: parseEstimatesData 追加経路", () => {
    test("parseEstimatesData は CSV で validUntil が Date.parse 可能な文字列", async () => {
        const header = "得意先コード,商品コード,単価,有効期限\n";
        const row = "C001,P001,100,2025/12/31\n";
        const buf = iconv.encode(header + row, "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "est.csv");
        expect(out.length).toBe(1);
        expect(out[0].validUntil).toMatch(/2025-12-31/);
    });
});
