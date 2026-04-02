"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const { readToRowArrays } = require("../../utils/excelReader");
const csvService = require("../../services/csvService");

describe("branch coverage 100 P1: csvService / orderCsvExport", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("generateOrdersCsv は未エクスポートのみ isUnexportedOnly", () => {
        const spec = csvService.getDefaultOrderCsvSpec();
        const csv = csvService.generateOrdersCsv(
            [
                {
                    orderId: 1,
                    orderDate: "2025-01-01",
                    customerId: "C",
                    items: [{ code: "P", name: "N", price: 1, quantity: 1 }],
                    exported_at: "2020-01-01T00:00:00.000Z"
                },
                {
                    orderId: 2,
                    orderDate: "2025-01-02",
                    customerId: "C",
                    items: [{ code: "P2", name: "N2", price: 2, quantity: 1 }],
                    exported_at: null
                }
            ],
            [],
            [],
            [],
            {},
            true,
            spec
        );
        expect(csv).toContain("P2");
        expect(csv.split("\n").filter((line) => line.includes("P2")).length).toBe(1);
    });

    test("resolveOrderCsvSpec は headerLine 空で builtIn", () => {
        const s = csvService.resolveOrderCsvSpec({ headerLine: "   ", columnKeys: [] });
        expect(s.headerLine).toContain("伝票");
    });

    test("parseEstimatesData は Excel で行不足なら空配列", async () => {
        readToRowArrays.mockResolvedValueOnce([["見積番号"]]);
        const rows = await csvService.parseEstimatesData(Buffer.from([1, 2]), "t.xlsx");
        expect(rows).toEqual([]);
    });

    test("parseShippingCsv は UTF-8 BOM で読める", () => {
        const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b\n1,2\n", "utf-8")]);
        const rows = csvService.parseShippingCsv(buf);
        expect(rows.length).toBeGreaterThan(0);
    });

    test("importFlamData は日付セルが空なら今日ISO日付", async () => {
        readToRowArrays.mockResolvedValue([
            ["id", "d", "c", "n", "p", "pn", "pr", "q"],
            ["OID1", "", "C1", "N", "P1", "PN", "100", "1"]
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
        expect(orders[0].orderDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    test("parseExternalOrdersCsv は空行のみなら空", () => {
        expect(csvService.parseExternalOrdersCsv(Buffer.from("a\n", "utf-8"))).toEqual([]);
    });

    test("resolveOrderCsvCell は literal トークン", () => {
        const { generateOrdersCsv, getDefaultOrderCsvSpec, resolveOrderCsvSpec } = csvService;
        const spec = resolveOrderCsvSpec({
            headerLine: "a",
            columnKeys: ["literal:1"]
        });
        const csv = generateOrdersCsv(
            [{ orderId: 9, items: [{ code: "x", name: "y", price: 1, quantity: 1 }] }],
            [],
            [],
            [],
            {},
            false,
            spec
        );
        expect(csv).toContain("1");
    });

    test("parseEstimatesData は必須列不足で空", async () => {
        const csv = Buffer.from("見積番号\nE1\n", "utf-8");
        const rows = await csvService.parseEstimatesData(csv, "e.csv");
        expect(rows).toEqual([]);
    });
});
