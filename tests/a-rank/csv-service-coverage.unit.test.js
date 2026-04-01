"use strict";

const iconv = require("iconv-lite");

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return {
        ...actual,
        readToRowArrays: jest.fn()
    };
});

const { readToRowArrays } = require("../../utils/excelReader");
const csvService = require("../../services/csvService");

describe("csvService 分岐カバレッジ", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("importFlamData", () => {
        test("同一注文に複数明細をマージし totalAmount を積算", async () => {
            const narrowIdx = {
                orderId: 0,
                orderDate: 1,
                customerId: 2,
                customerName: 3,
                productCode: 4,
                productName: 5,
                unitPrice: 6,
                quantity: 7
            };
            readToRowArrays.mockResolvedValue([
                ["h"],
                ["OID1", "2024/05/01", "C1", "顧客", "PC1", "商品1", "100", "2"],
                ["OID1", "", "C1", "顧客", "PC2", "商品2", "50", "3"]
            ]);
            const orders = await csvService.importFlamData(Buffer.from("x"), narrowIdx);
            expect(orders).toHaveLength(1);
            expect(orders[0].items.length).toBe(2);
            expect(orders[0].totalAmount).toBe(100 * 2 + 50 * 3);
        });

        test("注文ID空行はスキップ・商品コード空は UNKNOWN を付与", async () => {
            readToRowArrays.mockResolvedValue([
                ["h"],
                ["", "d", "c", "n", "p", "pn", "1", "1"],
                ["OID2", "", "", "", "", "", "10", "1"]
            ]);
            const orders = await csvService.importFlamData(Buffer.from("x"));
            expect(orders.length).toBeGreaterThanOrEqual(1);
            const o = orders.find((x) => x.orderId === "OID2");
            expect(o).toBeDefined();
            expect(o.items[0].code).toMatch(/^UNKNOWN-/);
        });

        test("indicesOverride で列位置を上書きできる", async () => {
            readToRowArrays.mockResolvedValue([
                ["h"],
                ["X", "D", "CID", "CN", "PID", "PN", "99", "1"]
            ]);
            const orders = await csvService.importFlamData(Buffer.from("x"), {
                orderId: 0,
                orderDate: 1,
                customerId: 2,
                customerName: 3,
                productCode: 4,
                productName: 5,
                unitPrice: 6,
                quantity: 7
            });
            expect(orders[0].orderId).toBe("X");
            expect(orders[0].customerId).toBe("CID");
        });

        test("日付セルが cellToDateString で解釈されないとき文字列正規化", async () => {
            readToRowArrays.mockResolvedValue([["h"], ["O3", "2024/12/31", "c", "n", "p", "pn", "1", "1"]]);
            const excelModule = require("../../utils/excelReader");
            const spy = jest.spyOn(excelModule, "cellToDateString").mockReturnValue(null);
            try {
                const orders = await csvService.importFlamData(Buffer.from("x"));
                expect(orders[0].orderDate).toContain("2024");
            } finally {
                spy.mockRestore();
            }
        });

        test("明細行が空配列ならスキップする", async () => {
            readToRowArrays.mockResolvedValue([["h"], []]);
            const orders = await csvService.importFlamData(Buffer.from("x"));
            expect(orders).toEqual([]);
        });

        test("受注番号セルが空ならスキップ", async () => {
            readToRowArrays.mockResolvedValue([
                ["h"],
                [, "2024-01-01", "c", "n", "p", "pn", "1", "1"]
            ]);
            const orders = await csvService.importFlamData(Buffer.from("x"));
            expect(orders.length).toBe(0);
        });

        test("cellToDateString が日付を返すとき orderDate に反映", async () => {
            readToRowArrays.mockResolvedValue([["h"], ["OID-D", "2024-06-15", "c", "n", "p", "pn", "10", "1"]]);
            const excelModule = require("../../utils/excelReader");
            const spy = jest.spyOn(excelModule, "cellToDateString").mockReturnValue("2024-06-15");
            try {
                const orders = await csvService.importFlamData(Buffer.from("x"));
                expect(orders[0].orderDate).toBe("2024-06-15");
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe("parseEstimatesData", () => {
        test("CSV（Shift_JIS）で必須列が揃えばパース", async () => {
            const line = "得意先コード,商品コード,単価,商品名\nC901,P901,1500,テスト\n";
            const buf = iconv.encode(line, "Shift_JIS");
            const out = await csvService.parseEstimatesData(buf, "est.csv");
            expect(out.length).toBe(1);
            expect(out[0].customerId).toBe("C901");
        });

        test("UTF-8 BOM 付きCSV", async () => {
            const body = "\uFEFF得意先コード,商品コード,単価\nC902,P902,2000\n";
            const out = await csvService.parseEstimatesData(Buffer.from(body, "utf-8"), "x.csv");
            expect(out.length).toBe(1);
        });

        test("xlsx 判定で readToRowArrays を使い全列を埋める", async () => {
            readToRowArrays.mockResolvedValue([
                ["見積番号", "得意先コード", "商品コード", "単価", "商品名", "有効期限", "メーカー", "件名"],
                ["E1", "C1", "P1", "3000", "N1", "2026-01-01", "M1", "S1"]
            ]);
            const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
            const out = await csvService.parseEstimatesData(buf, "doc.xlsx");
            expect(out.length).toBe(1);
            expect(out[0].manufacturer).toBe("M1");
            expect(out[0].subject).toBe("S1");
        });

        test("Excel 読込失敗時は空配列", async () => {
            readToRowArrays.mockRejectedValueOnce(new Error("bad"));
            const buf = Buffer.from([0x50, 0x4b]);
            const out = await csvService.parseEstimatesData(buf, "bad.xlsx");
            expect(out).toEqual([]);
        });

        test("行数不足・必須列不足は空", async () => {
            expect(await csvService.parseEstimatesData(Buffer.from("a\n", "utf-8"), "a.csv")).toEqual([]);
            expect(await csvService.parseEstimatesData(Buffer.from("a,b\n1,2\n", "utf-8"), "b.csv")).toEqual([]);
        });

        test("無効顧客コードをスキップしログ相当の分岐", async () => {
            const csv = "得意先コード,商品コード,単価\n0000,P1,100\nC3,P3,200\n";
            const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "c.csv");
            expect(out.some((x) => x.customerId === "0000")).toBe(false);
            expect(out.some((x) => x.customerId === "C3")).toBe(true);
        });

        test("estimateImportAliasesOverride で別名ヘッダーを認識", async () => {
            const csv = "CUST,PROD,AMT\nC4,P4,400\n";
            const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "d.csv", {
                customerId: ["CUST"],
                productCode: ["PROD"],
                price: ["AMT"]
            });
            expect(out.length).toBe(1);
            expect(out[0].unitPrice).toBe(400);
        });

        test("estimateImportAliasesOverride が配列でないキーは無視される", async () => {
            const csv = "得意先コード,商品コード,単価\nC6,P6,600\n";
            const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "e2.csv", {
                customerId: "not-an-array"
            });
            expect(out.length).toBe(1);
            expect(out[0].customerId).toBe("C6");
        });

        test("validUntil がセル文字列のとき Date.parse 経路", async () => {
            const csv = "得意先コード,商品コード,単価,有効期限\nC5,P5,100,2027/03/15\n";
            const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "e.csv");
            expect(out[0].validUntil).toBeTruthy();
        });
    });

    describe("parseExternalOrdersCsv", () => {
        test("英語ヘッダーでグルーピング", async () => {
            const csv =
                "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
                "O10,C10,N10,PC10,PN10,100,2,2024-01-01\n" +
                "O10,C10,N10,PC11,PN11,50,1,\n";
            const out = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
            expect(out.length).toBe(1);
            expect(out[0].items.length).toBe(2);
        });

        test("日本語ヘッダー・数量0の行は明細に入れない", async () => {
            const csv =
                "受注番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日\n" +
                "O11,C11,N11,PC12,PN12,10,0,2024-01-02\n" +
                "O11,C11,N11,PC13,PN13,20,1,2024-01-02\n";
            const out = csvService.parseExternalOrdersCsv(iconv.encode(csv, "Shift_JIS"));
            expect(out.length).toBe(1);
            expect(out[0].items.length).toBe(1);
        });

        test("1行のみは空", () => {
            expect(csvService.parseExternalOrdersCsv(Buffer.from("only\n", "utf-8"))).toEqual([]);
        });
    });

    describe("parseShippingCsv", () => {
        test("ヘッダー行とデータ行をオブジェクト化", () => {
            const csv = "a,b\n1,2\n3,4\n";
            const out = csvService.parseShippingCsv(Buffer.from(csv, "utf-8"));
            expect(out).toEqual([
                { a: "1", b: "2" },
                { a: "3", b: "4" }
            ]);
        });

        test("行数不足は空", () => {
            expect(csvService.parseShippingCsv(Buffer.from("x\n", "utf-8"))).toEqual([]);
        });
    });

});
