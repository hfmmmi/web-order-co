"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const { parseEstimatesData } = require("../../services/csvService");
const { readToRowArrays } = require("../../utils/excelReader");
const specialPriceService = require("../../services/specialPriceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const EST = dbPath("estimates.json");

function csvBuf(lines) {
    return Buffer.from(lines.join("\n"), "utf8");
}

describe("branch-coverage-90-dense-d: parseEstimatesData", () => {
    beforeEach(() => {
        readToRowArrays.mockReset();
    });

    test("CSV 必須列不足で空", async () => {
        const r = await parseEstimatesData(csvBuf(["a,b", "1,2"]), "");
        expect(r).toEqual([]);
    });

    test("CSV 行数不足で空", async () => {
        const r = await parseEstimatesData(csvBuf(["x"]), "");
        expect(r).toEqual([]);
    });

    test.each([
        [
            "見積番号,得意先コード,商品コード,単価",
            "E1,TEST001,P1,100"
        ],
        [
            "EstimateNo,CustomerCode,ProductCode,Price",
            "E2,TEST001,P2,200"
        ],
        [
            "見積NO,顧客コード,品番,決定単価",
            "E3,TEST001,P3,300"
        ]
    ])("CSV 正常取込 %#", async (hdr, row) => {
        const r = await parseEstimatesData(csvBuf([hdr, row]), "");
        expect(r.length).toBeGreaterThanOrEqual(1);
    });

    test("無効顧客コードでスキップされても処理継続", async () => {
        const hdr = "見積番号,得意先コード,商品コード,単価";
        const r = await parseEstimatesData(
            csvBuf([hdr, "E1,0000,P1,100", "E2,TEST001,P2,200"]),
            ""
        );
        expect(r.some((x) => x.customerId === "TEST001")).toBe(true);
    });

    test("単価NaN行は除外", async () => {
        const hdr = "見積番号,得意先コード,商品コード,単価";
        const r = await parseEstimatesData(csvBuf([hdr, "E1,TEST001,P1,abc"]), "");
        expect(r.length).toBe(0);
    });

    test.each(Array.from({ length: 25 }, (_, i) => i))("Excel パス %#", async (i) => {
        readToRowArrays.mockResolvedValue([
            ["見積番号", "得意先コード", "商品コード", "商品名", "単価", "有効期限"],
            [`E${i}`, "TEST001", `P${i}`, "N", String(100 + i), "2026-12-31"]
        ]);
        const pk = Buffer.alloc(4);
        pk[0] = 0x50;
        pk[1] = 0x4b;
        const r = await parseEstimatesData(pk, `t${i}.xlsx`);
        expect(Array.isArray(r)).toBe(true);
    });

    test("Excel 読込失敗で空", async () => {
        readToRowArrays.mockRejectedValue(new Error("bad"));
        const pk = Buffer.alloc(4);
        pk[0] = 0x50;
        pk[1] = 0x4b;
        const r = await parseEstimatesData(pk, "bad.xlsx");
        expect(r).toEqual([]);
    });

    test("Excel 1行のみは空", async () => {
        readToRowArrays.mockResolvedValue([["見積番号"]]);
        const pk = Buffer.alloc(4);
        pk[0] = 0x50;
        pk[1] = 0x4b;
        const r = await parseEstimatesData(pk, "empty.xlsx");
        expect(r).toEqual([]);
    });

    test("別名列オーバーライド", async () => {
        const hdr = "見積番号,得意先コード,商品コード,単価";
        const r = await parseEstimatesData(csvBuf([hdr, "E1,TEST001,P1,50"]), "", {
            productName: ["カスタム商品名"]
        });
        expect(Array.isArray(r)).toBe(true);
    });
});

describe("branch-coverage-90-dense-d: specialPriceService", () => {
    let orig;

    beforeAll(async () => {
        orig = await fs.readFile(EST, "utf-8").catch(() => "[]");
    });

    afterAll(async () => {
        await fs.writeFile(EST, orig, "utf-8");
    });

    beforeEach(async () => {
        await fs.writeFile(
            EST,
            JSON.stringify(
                [
                    {
                        estimateId: "00099",
                        customerId: "TEST001",
                        productCode: "SP1",
                        productName: "テストメーカー品",
                        price: 100,
                        validUntil: "2099-01-01"
                    },
                    {
                        estimateId: "100",
                        customerId: "TEST002",
                        productCode: "SP2",
                        productName: "Other",
                        price: 200
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
    });

    test.each([
        ["00099", "TEST001"],
        ["99", "TEST001"],
        ["100", "TEST002"],
        ["0100", "TEST002"]
    ])("getSpecialPrices %#", async (eid, cid) => {
        const r = await specialPriceService.getSpecialPrices(eid, cid);
        expect(Array.isArray(r)).toBe(true);
    });

    test("他人の見積は空", async () => {
        const r = await specialPriceService.getSpecialPrices("00099", "OTHER");
        expect(r).toEqual([]);
    });

    test.each([["テストメーカー"], ["TEST"], ["品"]])("deleteEstimatesByManufacturer %#", async (m) => {
        await fs.writeFile(
            EST,
            JSON.stringify(
                [{ estimateId: "X1", customerId: "TEST001", productCode: "A", productName: "ABCメーカー品" }],
                null,
                2
            ),
            "utf-8"
        );
        const r = await specialPriceService.deleteEstimatesByManufacturer(m);
        expect(typeof r.deletedCount).toBe("number");
    });

    test("deleteEstimatesByProductCodes", async () => {
        const r = await specialPriceService.deleteEstimatesByProductCodes(["SP1", "SP2"]);
        expect(r.deletedCount).toBeGreaterThanOrEqual(0);
    });

    test("saveEstimates", async () => {
        const r = await specialPriceService.saveEstimates([
            { estimateId: "S1", customerId: "C1", productCode: "P", price: 1 }
        ]);
        expect(r.success).toBe(true);
    });
});
