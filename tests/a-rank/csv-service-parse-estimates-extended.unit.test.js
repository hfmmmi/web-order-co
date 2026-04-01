"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const iconv = require("iconv-lite");
const { readToRowArrays } = require("../../utils/excelReader");
const csvService = require("../../services/csvService");

describe("csvService parseEstimatesData / parseExternalOrdersCsv 分岐拡張", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("parseEstimatesData は Shift_JIS CSV で必須列を解釈し行を返す", async () => {
        const header = "見積番号,得意先コード,商品コード,商品名,単価,有効期限,メーカー,件名";
        const row = "E-100,TEST001,P999,テスト品,1500,2030/12/31,Canon,件名A";
        const csv = `${header}\n${row}`;
        const buf = iconv.encode(csv, "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "est.csv");
        expect(out.length).toBe(1);
        expect(out[0].customerId).toBe("TEST001");
        expect(out[0].productCode).toBe("P999");
        expect(out[0].unitPrice).toBe(1500);
        expect(out[0].estimateId).toBe("E-100");
    });

    test("parseEstimatesData は無効顧客コード行をスキップしログ用に処理する", async () => {
        const header = "見積番号,得意先コード,商品コード,商品名,単価";
        const rows = ["E1,0000,P1,N,1", "E2,TEST001,P2,N,2"];
        const csv = `${header}\n${rows.join("\n")}`;
        const buf = iconv.encode(csv, "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "x.csv");
        expect(out.length).toBe(1);
        expect(out[0].customerId).toBe("TEST001");
    });

    test("parseEstimatesData は UTF-8 BOM CSV を読む", async () => {
        const header = "見積番号,得意先コード,商品コード,商品名,単価";
        const row = "E-BOM,TEST001,P-BOM,N,99";
        const utf8 = Buffer.from(`\uFEFF${header}\n${row}`, "utf-8");
        const out = await csvService.parseEstimatesData(utf8, "bom.csv");
        expect(out.length).toBe(1);
        expect(out[0].productCode).toBe("P-BOM");
    });

    test("parseEstimatesData は estimateImportAliases で列名を追加できる", async () => {
        const header = "カスタム見積,得意先,品番,単価";
        const row = "E-C,TEST001,P-C,10";
        const buf = iconv.encode(`${header}\n${row}`, "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "a.csv", {
            estimateId: ["カスタム見積"],
            customerId: ["得意先"],
            productCode: ["品番"]
        });
        expect(out.length).toBe(1);
        expect(out[0].estimateId).toBe("E-C");
    });

    test("parseEstimatesData は PK バッファで Excel 経路（readToRowArrays）を使う", async () => {
        readToRowArrays.mockResolvedValue([
            ["見積番号", "得意先コード", "商品コード", "単価"],
            ["E-X", "TEST001", "P-X", "500"]
        ]);
        const pk = Buffer.from([0x50, 0x4b, 1, 2]);
        const out = await csvService.parseEstimatesData(pk, "fake.xlsx");
        expect(readToRowArrays).toHaveBeenCalled();
        expect(out.length).toBe(1);
        expect(out[0].unitPrice).toBe(500);
    });

    test("parseEstimatesData は Excel 読込失敗時は空配列", async () => {
        readToRowArrays.mockRejectedValueOnce(new Error("bad"));
        const pk = Buffer.from([0x50, 0x4b, 3, 4]);
        const out = await csvService.parseEstimatesData(pk, "bad.xlsx");
        expect(out).toEqual([]);
    });

    test("parseEstimatesData は必須列が無い CSV で空配列", async () => {
        const buf = iconv.encode("A,B\n1,2", "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "bad.csv");
        expect(out).toEqual([]);
    });

    test("parseExternalOrdersCsv は英語ヘッダと列フォールバックでグルーピングする", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "EXT-EN-1,CUST1,名前1,PC1,PN1,100,2,2025-01-01\n" +
            "EXT-EN-1,CUST1,名前1,PC2,PN2,50,1,2025-01-01\n";
        const out = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(out.length).toBe(1);
        expect(out[0].orderId).toBe("EXT-EN-1");
        expect(out[0].items.length).toBe(2);
        expect(out[0].totalAmount).toBe(100 * 2 + 50 * 1);
    });

    test("parseExternalOrdersCsv は明細ゼロの受注を除外する", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "EMPTY-1,C1,N1,,,0,0,\n";
        const out = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(out.filter((o) => o.orderId === "EMPTY-1").length).toBe(0);
    });

    test("parseExternalOrdersCsv は日本語ヘッダで列を解決する", () => {
        const csv =
            "受注番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日\n" +
            "JP-1,J1,名前,JPC,品,300,1,2025-02-01\n";
        const out = csvService.parseExternalOrdersCsv(iconv.encode(csv, "Shift_JIS"));
        expect(out.length).toBe(1);
        expect(out[0].orderId).toBe("JP-1");
        expect(out[0].items[0].code).toBe("JPC");
    });

    test("parseShippingCsv は Shift_JIS でレコード化する", () => {
        const csv = "列A,列B\n1,2\n3,4";
        const buf = iconv.encode(csv, "Shift_JIS");
        const out = csvService.parseShippingCsv(buf);
        expect(out.length).toBe(2);
        expect(out[0]["列A"]).toBe("1");
    });

    test("parseShippingCsv は UTF-8 BOM を読む", () => {
        const buf = Buffer.from("\uFEFFA,B\nx,y", "utf-8");
        const out = csvService.parseShippingCsv(buf);
        expect(out.length).toBe(1);
        expect(out[0].A).toBe("x");
    });

    test("parseShippingCsv は1行のみなら空配列", () => {
        const out = csvService.parseShippingCsv(iconv.encode("only", "Shift_JIS"));
        expect(out).toEqual([]);
    });

    test("parseEstimatesData は単価が数値でない行をスキップする", async () => {
        const header = "見積番号,得意先コード,商品コード,商品名,単価";
        const csv = `${header}\nE-NAN,TEST001,P1,N,abc`;
        const buf = iconv.encode(csv, "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "x.csv");
        expect(out.length).toBe(0);
    });

    test("parseEstimatesData は有効期限を文字列日付から解決する", async () => {
        const header = "見積番号,得意先コード,商品コード,商品名,単価,有効期限";
        const csv = `${header}\nE-D,TEST001,P-D,N,100,2030/06/15`;
        const buf = iconv.encode(csv, "Shift_JIS");
        const out = await csvService.parseEstimatesData(buf, "d.csv");
        expect(out.length).toBe(1);
        expect(out[0].validUntil).toMatch(/2030-06-15/);
    });
});
