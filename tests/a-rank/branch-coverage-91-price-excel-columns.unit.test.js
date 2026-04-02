"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({ shippingRules: {} }),
    getPriceListFormatConfig: jest.fn().mockResolvedValue({
        csvHeaderLine: "h\n",
        categoryOrder: { 純正: 1 },
        productNameStripFromDisplay: "",
        manufacturerSplitCategory: "純正",
        sheetNamesByCategory: { 純正: "純正" },
        excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
    })
}));

const { readToRowArrays } = require("../../utils/excelReader");
const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

describe("branch coverage 91: priceService updateRankPricesFromExcel 列解決", () => {
    let origRank;
    let origAt;
    let origProducts;

    beforeEach(async () => {
        jest.clearAllMocks();
        settingsService.getRankIds.mockResolvedValue(["A", "B", "C"]);
        settingsService.getRankList.mockResolvedValue([
            { id: "A", name: "ゴールド" },
            { id: "B", name: "シルバー" },
            { id: "X", name: "孤立" }
        ]);
        origRank = await fs.readFile(dbPath("rank_prices.json"), "utf-8").catch(() => "{}");
        origAt = await fs.readFile(dbPath("rank_prices_updated_at.json"), "utf-8").catch(() => "{}");
        origProducts = await fs.readFile(dbPath("products.json"), "utf-8").catch(() => "[]");
    });

    afterEach(async () => {
        await fs.writeFile(dbPath("rank_prices.json"), origRank, "utf-8");
        await fs.writeFile(dbPath("rank_prices_updated_at.json"), origAt, "utf-8");
        await fs.writeFile(dbPath("products.json"), origProducts, "utf-8");
    });

    test("ヘッダーが「補助商品コード」のように includes で商品コード列を検出する", async () => {
        readToRowArrays.mockResolvedValue([
            ["補助商品コード", "ランク1"],
            ["PX1", 11]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("表示名が rankIds に含まれない id の列はスキップされる", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "孤立", "ランク1"],
            ["PX2", 99, 22]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(dbPath("rank_prices.json"), "utf-8"));
        expect(map.PX2 && map.PX2.X).toBeUndefined();
        expect(map.PX2 && map.PX2.A).toBe(22);
    });

    test("ランク番号が rankIds の長さを超える列は無視される", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "ランク99"],
            ["PX3", 5, 77]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(dbPath("rank_prices.json"), "utf-8"));
        expect(map.PX3.A).toBe(5);
        expect(map.PX3["99"]).toBeUndefined();
    });
});
