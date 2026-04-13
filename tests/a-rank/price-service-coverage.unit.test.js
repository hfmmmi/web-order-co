"use strict";

const fs = require("fs").promises;

jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn(),
    getPriceListFormatConfig: jest.fn(),
    getSettings: jest.fn()
}));

const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const { dbPath } = require("../../dbPaths");

describe("priceService 分岐カバレッジ（モック付き）", () => {
    const rankIds = ["A", "B", "C"];
    const rankList = [
        { id: "A", name: "ゴールド" },
        { id: "B", name: "シルバー" },
        { id: "C", name: "ブロンズ" }
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        settingsService.getRankIds.mockResolvedValue(rankIds);
        settingsService.getRankList.mockResolvedValue(rankList);
        settingsService.getPriceListFormatConfig.mockResolvedValue({
            csvHeaderLine: "h1,h2\n",
            categoryOrder: { 純正: 1, その他: 99 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正"
        });
        settingsService.getSettings.mockResolvedValue({ shippingRules: {} });
    });

    describe("saveRankPrices / 特価 / 取得系", () => {
        test("saveRankPrices は rows 配列形式で保存", async () => {
            const rankPath = dbPath("rank_prices.json");
            const orig = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            try {
                await priceService.saveRankPrices({
                    rows: [{ productCode: "Z1", prices: { A: 10, B: "20" } }]
                });
                const data = JSON.parse(await fs.readFile(rankPath, "utf-8"));
                expect(data.Z1).toEqual({ A: 10, B: 20 });
            } finally {
                await fs.writeFile(rankPath, orig, "utf-8");
            }
        });

        test("saveRankPrices はオブジェクトマップをそのまま保存", async () => {
            const rankPath = dbPath("rank_prices.json");
            const orig = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            try {
                await priceService.saveRankPrices({ X9: { A: 1 } });
                const data = JSON.parse(await fs.readFile(rankPath, "utf-8"));
                expect(data.X9.A).toBe(1);
            } finally {
                await fs.writeFile(rankPath, orig, "utf-8");
            }
        });

        test("deleteSpecialPrice は存在しないとき失敗", async () => {
            const r = await priceService.deleteSpecialPrice("__no_such__", "__p__");
            expect(r.success).toBe(false);
        });

        test("updateSpecialPrice で新規追加後 deleteSpecialPrice で削除", async () => {
            const pricesPath = dbPath("prices.json");
            const orig = await fs.readFile(pricesPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(pricesPath, "[]", "utf-8");
                await priceService.updateSpecialPrice("CUSTX", "PRODX", 123);
                let list = JSON.parse(await fs.readFile(pricesPath, "utf-8"));
                expect(list.length).toBe(1);
                await priceService.updateSpecialPrice("CUSTX", "PRODX", 456);
                list = JSON.parse(await fs.readFile(pricesPath, "utf-8"));
                expect(list[0].specialPrice).toBe(456);
                const del = await priceService.deleteSpecialPrice("CUSTX", "PRODX");
                expect(del.success).toBe(true);
            } finally {
                await fs.writeFile(pricesPath, orig, "utf-8");
            }
        });

        test("getPriceForAdmin は特価なしでベース価格", async () => {
            const productsPath = dbPath("products.json");
            const pricesPath = dbPath("prices.json");
            const origP = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
            const origPr = await fs.readFile(pricesPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(
                    productsPath,
                    JSON.stringify([{ productCode: "GB", basePrice: 500 }], null, 2),
                    "utf-8"
                );
                await fs.writeFile(pricesPath, "[]", "utf-8");
                const r = await priceService.getPriceForAdmin("ANY", "GB");
                expect(r.success).toBe(true);
                expect(r.currentPrice).toBe(500);
                expect(r.isSpecial).toBe(false);
            } finally {
                await fs.writeFile(productsPath, origP, "utf-8");
                await fs.writeFile(pricesPath, origPr, "utf-8");
            }
        });

        test("getRankPrices / getRankPricesUpdatedAt はオブジェクトを返す", async () => {
            const rp = await priceService.getRankPrices();
            const ru = await priceService.getRankPricesUpdatedAt();
            expect(rp !== null && typeof rp === "object").toBe(true);
            expect(ru !== null && typeof ru === "object").toBe(true);
        });
    });

    describe("getPricelistCsvForRank", () => {
        test("価格>0 の行のみ BOM 付きCSVに含まれる", async () => {
            const rankPath = dbPath("rank_prices.json");
            const productsPath = dbPath("products.json");
            const origR = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            const origP = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(rankPath, JSON.stringify({ CSV1: { A: 100, B: 0 } }, null, 2), "utf-8");
                await fs.writeFile(
                    productsPath,
                    JSON.stringify(
                        [
                            {
                                productCode: "CSV1",
                                name: "商品コードテスト",
                                manufacturer: "M",
                                category: "純正",
                                basePrice: 1000
                            }
                        ],
                        null,
                        2
                    ),
                    "utf-8"
                );
                const { csv, filename } = await priceService.getPricelistCsvForRank("A");
                expect(filename).toContain("A");
                expect(csv.startsWith("\uFEFF")).toBe(true);
                expect(csv).toContain("CSV1");
            } finally {
                await fs.writeFile(rankPath, origR, "utf-8");
                await fs.writeFile(productsPath, origP, "utf-8");
            }
        });
    });
});
