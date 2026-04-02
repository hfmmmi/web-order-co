"use strict";

/**
 * 分岐90%向け dense batch A: csvService（parseExternalOrdersCsv / parseShippingCsv / importFlamData）
 */
jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const { parseExternalOrdersCsv, parseShippingCsv, importFlamData } = require("../../services/csvService");
const { readToRowArrays } = require("../../utils/excelReader");

function utf8Csv(lines) {
    return Buffer.from(lines.join("\n"), "utf8");
}

describe("branch-coverage-90-dense-a: parseExternalOrdersCsv", () => {
    test("空バッファは空配列", () => {
        expect(parseExternalOrdersCsv(Buffer.alloc(0))).toEqual([]);
    });

    test("1行のみは空配列", () => {
        expect(parseExternalOrdersCsv(utf8Csv(["a,b,c,d,e,f,g,h"]))).toEqual([]);
    });

    test("UTF-8 BOM 付きで解釈できる", () => {
        const body =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "O1,C1,Name1,P1,N1,100,1,2025-01-01";
        const buf = Buffer.from("\ufeff" + body, "utf8");
        const r = parseExternalOrdersCsv(buf);
        expect(r.length).toBe(1);
        expect(r[0].orderId).toBe("O1");
    });

    test.each([
        [
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate",
            "O1,C1,N1,P1,PN,100,1,2025-01-01"
        ],
        [
            "受注番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日",
            "O2,C2,N2,P2,PN2,200,2,2025-02-02"
        ],
        [
            "伝票まとめ番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日",
            "O3,C3,N3,P3,PN3,300,3,2025-03-03"
        ],
        [
            "OrderID,CustomerID,CustomerName,ProductCode,ProductName,Price,Quantity,OrderDate",
            "O4,C4,N4,P4,PN4,400,4,2025-04-04"
        ]
    ])("ヘッダー別に1件取り込める %#", (hdr, row) => {
        const r = parseExternalOrdersCsv(utf8Csv([hdr, row]));
        expect(r.length).toBe(1);
        expect(r[0].items.length).toBeGreaterThan(0);
    });

    test("orderId 空行はスキップされ結果が空になりうる", () => {
        const hdr =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate";
        const r = parseExternalOrdersCsv(utf8Csv([hdr, ",C1,N1,P1,PN,1,1,2025-01-01"]));
        expect(r.filter((o) => o.items && o.items.length)).toEqual([]);
    });

    test("数量0の明細は items に入らず最終フィルタで除外", () => {
        const hdr =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate";
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "OX,CX,NX,PX,PNX,100,0,2025-01-01"]));
        expect(r.length).toBe(0);
    });

    test("商品コードなし・数量>0 でも行は追加されない（productCode falsy）", () => {
        const hdr =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate";
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O5,C5,N5,,PN,50,1,2025-01-01"]));
        expect(r.length).toBe(0);
    });

    test("単価は数値文字列として解釈", () => {
        const hdr =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate";
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O6,C6,N6,P6,PN,1234,2,2025-01-01"]));
        expect(r[0].items[0].price).toBe(1234);
    });

    test("同一orderIdに複数明細", () => {
        const hdr =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate";
        const r = parseExternalOrdersCsv(
            utf8Csv([
                hdr,
                "OM,C,N,P1,N1,10,1,2025-01-01",
                "OM,C,N,P2,N2,20,2,2025-01-01"
            ])
        );
        expect(r[0].items.length).toBe(2);
    });

    test.each([
        ["orderId", 0],
        ["受注番号", 0],
        ["伝票まとめ番号", 0]
    ])("order列フォールバック idxOrderId %#", (colName, _fb) => {
        const hdr = [
            colName,
            "customerId",
            "customerName",
            "productCode",
            "productName",
            "price",
            "quantity",
            "orderDate"
        ].join(",");
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "OID1,C,N,P,N,1,1,2025-01-01"]));
        expect(r[0].orderId).toBe("OID1");
    });

    test.each([
        ["customerId", 1],
        ["得意先コード", 1]
    ])("customer列 %#", (colName) => {
        const hdr = [
            "orderId",
            colName,
            "customerName",
            "productCode",
            "productName",
            "price",
            "quantity",
            "orderDate"
        ].join(",");
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O1,CUSTX,N,P,N,1,1,2025-01-01"]));
        expect(r[0].customerId).toBe("CUSTX");
    });

    test.each([
        ["productCode", 3],
        ["商品コード", 3]
    ])("productCode列 %#", (colName) => {
        const hdr = [
            "orderId",
            "customerId",
            "customerName",
            colName,
            "productName",
            "price",
            "quantity",
            "orderDate"
        ].join(",");
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O1,C,N,PROD1,N,1,1,2025-01-01"]));
        expect(r[0].items[0].code).toBe("PROD1");
    });

    test.each([
        ["price", 5],
        ["単価", 5]
    ])("単価列 %#", (colName) => {
        const hdr = [
            "orderId",
            "customerId",
            "customerName",
            "productCode",
            "productName",
            colName,
            "quantity",
            "orderDate"
        ].join(",");
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O1,C,N,P,N,999,1,2025-01-01"]));
        expect(r[0].items[0].price).toBe(999);
    });

    test.each([
        ["quantity", 6],
        ["数量", 6]
    ])("数量列 %#", (colName) => {
        const hdr = [
            "orderId",
            "customerId",
            "customerName",
            "productCode",
            "productName",
            "price",
            colName,
            "orderDate"
        ].join(",");
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O1,C,N,P,N,10,7,2025-01-01"]));
        expect(r[0].items[0].quantity).toBe(7);
    });

    test.each([
        ["orderDate", 7],
        ["受注日", 7]
    ])("日付列 %#", (colName) => {
        const hdr = [
            "orderId",
            "customerId",
            "customerName",
            "productCode",
            "productName",
            "price",
            "quantity",
            colName
        ].join(",");
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O1,C,N,P,N,1,1,2025-12-31"]));
        expect(r[0].orderDate).toContain("2025");
    });

    test("受注日空なら ISO 形式が入る", () => {
        const hdr =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate";
        const r = parseExternalOrdersCsv(utf8Csv([hdr, "O1,C,N,P,N,1,1,"]));
        expect(r[0].orderDate).toBeTruthy();
    });

    const manyHdrRows = [];
    for (let i = 0; i < 40; i++) {
        manyHdrRows.push([
            `orderId,customerId,customerName,productCode,productName,price,quantity,orderDate`,
            `OID${i},C,N,P${i},N,${i + 1},1,2025-01-01`
        ]);
    }
    test.each(manyHdrRows)("大量パターン %#", (hdr, row) => {
        const r = parseExternalOrdersCsv(utf8Csv([hdr, row]));
        expect(r.length).toBe(1);
    });
});

describe("branch-coverage-90-dense-a: parseShippingCsv", () => {
    test("空は空配列", () => {
        expect(parseShippingCsv(Buffer.alloc(0))).toEqual([]);
    });

    test("1行のみは空配列", () => {
        expect(parseShippingCsv(utf8Csv(["a,b"]))).toEqual([]);
    });

    test("UTF-8 BOM", () => {
        const buf = Buffer.from("\ufeff" + "a,b\n1,2", "utf8");
        const r = parseShippingCsv(buf);
        expect(r[0]).toEqual({ a: "1", b: "2" });
    });

    test.each([
        ["a,b,c", "x,y,z"],
        ["列1,列2", "v1,v2"],
        ["h1,h2,h3,h4", "1,2,3,4"]
    ])("可変列 %#", (h, row) => {
        const r = parseShippingCsv(utf8Csv([h, row]));
        expect(Object.keys(r[0]).length).toBeGreaterThan(0);
    });

    const shipRows = [];
    for (let n = 0; n < 22; n++) {
        shipRows.push([`c0,c1,c2`, `${n},${n + 1},${n + 2}`]);
    }
    test.each(shipRows)("shipping 行 %#", (h, row) => {
        const r = parseShippingCsv(utf8Csv([h, row]));
        expect(r.length).toBe(1);
    });
});

function logisticsRow(oid, date, cid, cname, pcode, pname, price, qty) {
    const cols = new Array(41).fill("");
    cols[0] = oid;
    cols[1] = date;
    cols[7] = cid;
    cols[8] = cname;
    cols[32] = pcode;
    cols[35] = pname;
    cols[39] = price;
    cols[40] = qty;
    return cols;
}

describe("branch-coverage-90-dense-a: importFlamData", () => {
    beforeEach(() => {
        readToRowArrays.mockReset();
    });

    test("空シートは空配列", async () => {
        readToRowArrays.mockResolvedValue([]);
        const r = await importFlamData(Buffer.from([1]));
        expect(r).toEqual([]);
    });

    test("ヘッダのみはデータ行なしで空", async () => {
        readToRowArrays.mockResolvedValue([["a", "b"]]);
        const r = await importFlamData(Buffer.from([1]));
        expect(r).toEqual([]);
    });

    test.each([
        [logisticsRow(1, "2025-01-01", "C", "N", "P", "PN", 100, 1)],
        [logisticsRow(2, "2025/01/02", "C2", "N2", "P2", "PN2", 50, 2)]
    ])("明細1行 %#", async (row) => {
        readToRowArrays.mockResolvedValue([["h"], row]);
        const r = await importFlamData(Buffer.from([1]));
        expect(r.length).toBe(1);
        expect(r[0].items.length).toBe(1);
    });

    test("orderId 空行はスキップ", async () => {
        const row = logisticsRow("", "2025-01-01", "C", "N", "P", "PN", 1, 1);
        readToRowArrays.mockResolvedValue([["h"], row]);
        const r = await importFlamData(Buffer.from([1]));
        expect(r).toEqual([]);
    });

    test("indicesOverride で列ずらし", async () => {
        const short = ["OID", "2025-01-01", "CX", "NX", "PX", "PNX", 10, 3];
        readToRowArrays.mockResolvedValue([["h"], short]);
        const r = await importFlamData(Buffer.from([1]), {
            orderId: 0,
            orderDate: 1,
            customerId: 2,
            customerName: 3,
            productCode: 4,
            productName: 5,
            unitPrice: 6,
            quantity: 7
        });
        expect(r[0].orderId).toBe("OID");
        expect(r[0].items[0].quantity).toBe(3);
    });

    test.each(Array.from({ length: 18 }, (_, i) => i))("複数注文 %#", async (i) => {
        readToRowArrays.mockResolvedValue([
            ["h"],
            logisticsRow(`O${i}`, "2025-01-01", "C", "N", `P${i}`, "PN", 10, 1)
        ]);
        const r = await importFlamData(Buffer.from([1]));
        expect(r[0].orderId).toBe(`O${i}`);
    });
});
