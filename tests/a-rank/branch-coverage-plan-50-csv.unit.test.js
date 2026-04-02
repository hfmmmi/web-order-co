"use strict";

/**
 * 分岐50本計画: csvService / orderCsv 5 本
 */
jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const { readToRowArrays } = require("../../utils/excelReader");
const csvService = require("../../services/csvService");

describe("branch coverage plan 50: csvService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("importFlamData は indicesOverride で列位置を差し替え", async () => {
        readToRowArrays.mockResolvedValue([
            ["h0", "h1", "h2", "h3", "h4", "h5", "h6", "h7"],
            ["OID1", "2025-01-01", "C1", "顧客名", "P1", "商品名", "100", "2"]
        ]);
        const orders = await csvService.importFlamData(Buffer.from([1]), {
            orderId: 0,
            orderDate: 1,
            customerId: 2,
            customerName: 3,
            productCode: 4,
            productName: 5,
            unitPrice: 6,
            quantity: 7
        });
        expect(orders.length).toBe(1);
        expect(orders[0].orderId).toBe("OID1");
        expect(orders[0].items[0].quantity).toBe(2);
    });

    test("parseEstimatesData は CSV で必須列が揃えば解析", async () => {
        const csv = Buffer.from(
            "見積番号,得意先コード,商品コード,単価\nE1,CUST01,P001,1000\n",
            "utf-8"
        );
        const rows = await csvService.parseEstimatesData(csv, "est.csv");
        expect(rows.some((r) => r.customerId === "CUST01" && r.unitPrice === 1000)).toBe(true);
    });

    test("parseEstimatesData は顧客コード 0000 をスキップ", async () => {
        const csv = Buffer.from(
            "見積番号,得意先コード,商品コード,単価\nE2,0000,P002,500\nE3,CUST02,P003,300\n",
            "utf-8"
        );
        const rows = await csvService.parseEstimatesData(csv, "e.csv");
        expect(rows.some((r) => r.customerId === "CUST02")).toBe(true);
        expect(rows.some((r) => r.customerId === "0000")).toBe(false);
    });

    test("parseExternalOrdersCsv は標準ヘッダでグループ化", () => {
        const csv = `受注番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日
W1001,TEST001,山田,P001,品,100,1,2025-01-01`;
        const out = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(out.length).toBe(1);
        expect(String(out[0].orderId)).toBe("W1001");
        expect(out[0].items.length).toBe(1);
    });

    test("resolveOrderCsvSpec はカスタム列キーがヘッダ列数と一致すれば採用", () => {
        const headerLine = "a,b,c";
        const spec = csvService.resolveOrderCsvSpec({
            headerLine,
            columnKeys: ["orderId", "orderDate", "customerId"]
        });
        expect(spec.headerLine).toBe("a,b,c");
        expect(spec.columnKeys.length).toBe(3);
    });
});
