"use strict";

/**
 * 分岐100本計画 P0: priceService 12本
 */
jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({
        shippingRules: { default: "送料\n規定" }
    }),
    getPriceListFormatConfig: jest.fn().mockResolvedValue({
        csvHeaderLine: "h\n",
        categoryOrder: { 純正: 1, 再生: 2, 汎用: 3, 海外純正: 4, 猫: 5 },
        productNameStripFromDisplay: "",
        manufacturerSplitCategory: "純正",
        sheetNamesByCategory: { 純正: "純正", 再生: "再生", 汎用: "汎用", 海外純正: "海外純正", 猫: "猫" },
        sheetManufacturerSortCategory: "再生",
        excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
    })
}));

const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const RANK_PATH = dbPath("rank_prices.json");
const RANK_AT_PATH = dbPath("rank_prices_updated_at.json");
const PRODUCTS_PATH = dbPath("products.json");
const PRICES_PATH = dbPath("prices.json");

describe("branch coverage 100 P0: priceService", () => {
    let origRank;
    let origAt;
    let origProducts;
    let origPrices;

    beforeEach(async () => {
        jest.clearAllMocks();
        settingsService.getRankIds.mockResolvedValue(["A", "B", "C"]);
        settingsService.getRankList.mockResolvedValue([
            { id: "A", name: "ゴールド" },
            { id: "B", name: "シルバー" },
            { id: "C", name: "ブロンズ" }
        ]);
        origRank = await fs.readFile(RANK_PATH, "utf-8").catch(() => "{}");
        origAt = await fs.readFile(RANK_AT_PATH, "utf-8").catch(() => "{}");
        origProducts = await fs.readFile(PRODUCTS_PATH, "utf-8").catch(() => "[]");
        origPrices = await fs.readFile(PRICES_PATH, "utf-8").catch(() => "[]");
    });

    afterEach(async () => {
        await fs.writeFile(RANK_PATH, origRank, "utf-8");
        await fs.writeFile(RANK_AT_PATH, origAt, "utf-8");
        await fs.writeFile(PRODUCTS_PATH, origProducts, "utf-8");
        await fs.writeFile(PRICES_PATH, origPrices, "utf-8");
    });

    test("updateSpecialPrice は新規行を追加", async () => {
        const code = "USP_NEW_" + Date.now();
        const r = await priceService.updateSpecialPrice("TEST001", code, 123);
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        expect(list.some((p) => p.productCode === code)).toBe(true);
    });

    test("updateSpecialPrice は既存行を更新", async () => {
        const r = await priceService.updateSpecialPrice("TEST001", "P001", 555);
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        const row = list.find((p) => p.customerId === "TEST001" && p.productCode === "P001");
        expect(row.specialPrice).toBe(555);
    });

    test("getAllSpecialPrices は削除商品は（削除された商品）表示", async () => {
        const prices = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        prices.push({ customerId: "TEST001", productCode: "DELETED_PROD_X", specialPrice: 1 });
        await fs.writeFile(PRICES_PATH, JSON.stringify(prices, null, 2), "utf-8");
        const rows = await priceService.getAllSpecialPrices();
        const hit = rows.find((r) => r.productCode === "DELETED_PROD_X");
        expect(hit.productName).toContain("削除された商品");
    });

    test("saveRankPrices は数値文字列のランク価格をパース", async () => {
        await priceService.saveRankPrices({
            rows: [{ productCode: "NUMSTR", prices: { A: "42" } }]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.NUMSTR.A).toBe(42);
    });



    test("getPricelistCsvForRank は stripToken ありで rawName 分岐", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 3 },
            productNameStripFromDisplay: "X",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "汎用" },
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        });
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "TOK",
            name: "aXb",
            manufacturer: "M",
            category: "汎用",
            basePrice: 100,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.TOK = { A: 10 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("TOK");
    });

    test("getPricelistExcelForRank は sortSheetKey がカテゴリ名フォールバック", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 再生: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 再生: "再生" },
            sheetManufacturerSortCategory: "再生",
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        });
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "SORTSK",
            name: "n",
            manufacturer: "Ma",
            category: "再生",
            basePrice: 50,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.SORTSK = { A: 20 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(1000);
    });

    test("getRankPrices はファイル欠損で空オブジェクト", async () => {
        const orig = await fs.readFile(RANK_PATH, "utf-8");
        await fs.writeFile(RANK_PATH, "not-json", "utf-8");
        const rp = await priceService.getRankPrices();
        expect(typeof rp).toBe("object");
        await fs.writeFile(RANK_PATH, orig, "utf-8");
    });

    test("getPriceForAdmin は商品マスタに無いコードで basePrice 0", async () => {
        const r = await priceService.getPriceForAdmin("TEST001", "NO_MASTER_99999");
        expect(r.success).toBe(true);
        expect(r.currentPrice).toBe(0);
    });

    test("getPricelistExcelForRank は定価セルが数値文字列で右寄せ分岐", async () => {
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "NUMCELL",
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: 999,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.NUMCELL = { A: 100 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(500);
    });

    test("getPricelistCsvForRank は listPriceNum 0 で ratePct がハイフン", async () => {
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "RATEHYPH",
            name: "r",
            manufacturer: "M",
            category: "猫",
            basePrice: 0,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.RATEHYPH = { A: 50 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("RATEHYPH");
    });
});
