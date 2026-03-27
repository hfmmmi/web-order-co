"use strict";

const fs = require("fs").promises;

jest.mock("../../utils/excelReader", () => ({
    readToRowArrays: jest.fn()
}));

jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn(),
    getPriceListFormatConfig: jest.fn(),
    getSettings: jest.fn()
}));

const { readToRowArrays } = require("../../utils/excelReader");
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

    describe("updateRankPricesFromExcel", () => {
        test("データなしで失敗メッセージ", async () => {
            readToRowArrays.mockResolvedValueOnce([]);
            const r = await priceService.updateRankPricesFromExcel(Buffer.from("x"));
            expect(r.success).toBe(false);
            expect(r.message).toContain("データがありません");
        });

        test("商品コード列なし", async () => {
            readToRowArrays.mockResolvedValueOnce([["名前", "値"], ["x", "1"]]);
            const r = await priceService.updateRankPricesFromExcel(Buffer.from("x"));
            expect(r.success).toBe(false);
            expect(r.message).toContain("商品コード");
        });

        test("ランク列なし", async () => {
            readToRowArrays.mockResolvedValueOnce([["商品コード"], ["P1"]]);
            const r = await priceService.updateRankPricesFromExcel(Buffer.from("x"));
            expect(r.success).toBe(false);
            expect(r.message).toContain("ランク列");
        });

        test("ランク1列で成功し rank_prices を更新", async () => {
            readToRowArrays.mockResolvedValueOnce([
                ["商品コード", "ランク1", "ランク2"],
                ["PC1", "100", "200"],
                ["", "1", "2"]
            ]);
            const rankPath = dbPath("rank_prices.json");
            const prodPath = dbPath("products.json");
            const origRank = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            const origProd = await fs.readFile(prodPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(rankPath, "{}", "utf-8");
                await fs.writeFile(prodPath, "[]", "utf-8");
                const r = await priceService.updateRankPricesFromExcel(Buffer.from("x"));
                expect(r.success).toBe(true);
                const data = JSON.parse(await fs.readFile(rankPath, "utf-8"));
                expect(data.PC1).toEqual({ A: 100, B: 200 });
            } finally {
                await fs.writeFile(rankPath, origRank, "utf-8");
                await fs.writeFile(prodPath, origProd, "utf-8");
            }
        });

        test("表示名ランク列と商品名列で商品マスタ名を更新", async () => {
            readToRowArrays.mockResolvedValueOnce([
                ["商品コード", "商品名", "ゴールド"],
                ["PC2", "新名前", "50"]
            ]);
            const rankPath = dbPath("rank_prices.json");
            const prodPath = dbPath("products.json");
            const origRank = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            const origProd = await fs.readFile(prodPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(rankPath, "{}", "utf-8");
                await fs.writeFile(
                    prodPath,
                    JSON.stringify([{ productCode: "PC2", name: "旧", basePrice: 1 }], null, 2),
                    "utf-8"
                );
                const r = await priceService.updateRankPricesFromExcel(Buffer.from("x"));
                expect(r.success).toBe(true);
                expect(r.message).toContain("商品名");
                const products = JSON.parse(await fs.readFile(prodPath, "utf-8"));
                expect(products[0].name).toBe("新名前");
            } finally {
                await fs.writeFile(rankPath, origRank, "utf-8");
                await fs.writeFile(prodPath, origProd, "utf-8");
            }
        });

        test("ランク文字列 ランクB でマッピング", async () => {
            readToRowArrays.mockResolvedValueOnce([
                ["商品コード", "ランクB"],
                ["PC3", "99"]
            ]);
            const rankPath = dbPath("rank_prices.json");
            const origRank = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            try {
                await fs.writeFile(rankPath, "{}", "utf-8");
                const r = await priceService.updateRankPricesFromExcel(Buffer.from("x"));
                expect(r.success).toBe(true);
                const data = JSON.parse(await fs.readFile(rankPath, "utf-8"));
                expect(data.PC3.B).toBe(99);
            } finally {
                await fs.writeFile(rankPath, origRank, "utf-8");
            }
        });
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
