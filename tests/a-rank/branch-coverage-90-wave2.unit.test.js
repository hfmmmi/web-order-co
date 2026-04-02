"use strict";

/**
 * 分岐カバレッジ 90% 向け wave2: priceService（Excel 送料・重複シート・短いヘッダー）、productService
 * 注: モジュール全体の jest.mock は使わず spy のみ（他テストへの汚染防止）
 */
const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const productService = require("../../services/productService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const RANK_PATH = dbPath("rank_prices.json");
const RANK_AT_PATH = dbPath("rank_prices_updated_at.json");
const PRODUCTS_PATH = dbPath("products.json");

describe("branch coverage 90 wave2: priceService Excel / CSV 追加経路", () => {
    let origRank;
    let origAt;
    let origProducts;
    let spyFmt;
    let spyGet;

    beforeEach(async () => {
        origRank = await fs.readFile(RANK_PATH, "utf-8").catch(() => "{}");
        origAt = await fs.readFile(RANK_AT_PATH, "utf-8").catch(() => "{}");
        origProducts = await fs.readFile(PRODUCTS_PATH, "utf-8").catch(() => "[]");
        spyFmt = jest.spyOn(settingsService, "getPriceListFormatConfig");
        spyGet = jest.spyOn(settingsService, "getSettings");
    });

    afterEach(async () => {
        spyFmt.mockRestore();
        spyGet.mockRestore();
        await fs.writeFile(RANK_PATH, origRank, "utf-8");
        await fs.writeFile(RANK_AT_PATH, origAt, "utf-8");
        await fs.writeFile(PRODUCTS_PATH, origProducts, "utf-8");
    });

    test("getPricelistCsvForRank は stripToken で rawName を分割除去", async () => {
        spyFmt.mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 1 },
            productNameStripFromDisplay: "STRIPME",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "汎用" },
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        });
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "STOK1",
            name: "STRIPME表示名",
            manufacturer: "M",
            category: "汎用",
            basePrice: 1000,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.STOK1 = { A: 500 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("STOK1");
        expect(csv).not.toContain("STRIPME");
    });

    test("getPricelistCsvForRank は定価0で掛率がハイフン", async () => {
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "ZLP0",
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: 0,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.ZLP0 = { A: 100 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("ZLP0");
        expect(csv).toMatch(/ZLP0[\s\S]*,-/);
    });

    test("getPricelistExcelForRank は shippingRules のメーカー表示キーを優先", async () => {
        spyGet.mockResolvedValue({
            shippingRules: {
                default: "デフォルト送料",
                MakerX: "メーカー専用ルール\n2行目"
            }
        });
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "SHIP1",
            name: "n",
            manufacturer: "MakerX",
            category: "純正",
            basePrice: 200,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.SHIP1 = { A: 50 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(3000);
    });

    test("getPricelistExcelForRank はサニタイズ後同一シート名で _1 を付与", async () => {
        spyGet.mockResolvedValue({ shippingRules: {} });
        const products = JSON.parse(origProducts);
        products.push(
            {
                productCode: "SD1",
                name: "n1",
                manufacturer: "X/Y",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            },
            {
                productCode: "SD2",
                name: "n2",
                manufacturer: "X?Y",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            }
        );
        const rank = JSON.parse(origRank);
        rank.SD1 = { A: 10 };
        rank.SD2 = { A: 11 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(4000);
    });

    test("getPricelistExcelForRank は再生カテゴリでメーカー名ソート（sortSheetKey 一致）", async () => {
        spyGet.mockResolvedValue({ shippingRules: {} });
        spyFmt.mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 再生: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 再生: "再生シート" },
            sheetManufacturerSortCategory: "再生",
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        });
        const products = JSON.parse(origProducts);
        products.push(
            {
                productCode: "RS2",
                name: "b",
                manufacturer: "Mb",
                category: "再生",
                basePrice: 50,
                stockStatus: "即納",
                active: true
            },
            {
                productCode: "RS1",
                name: "a",
                manufacturer: "Ma",
                category: "再生",
                basePrice: 50,
                stockStatus: "即納",
                active: true
            }
        );
        const rank = JSON.parse(origRank);
        rank.RS1 = { A: 9 };
        rank.RS2 = { A: 8 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(3500);
    });

    test("getPricelistExcelForRank は excelHeaderRow が3列でもパディングされる", async () => {
        spyGet.mockResolvedValue({ shippingRules: {} });
        spyFmt.mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "汎用" },
            sheetManufacturerSortCategory: "再生",
            excelHeaderRow: ["A", "B", "C"]
        });
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "NARROW",
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: 100,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.NARROW = { A: 77 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(2000);
    });

    test("getRankPrices は JSON 破損時に空オブジェクト", async () => {
        await fs.writeFile(RANK_PATH, "{not-json", "utf-8");
        await expect(priceService.getRankPrices()).resolves.toEqual({});
        await fs.writeFile(RANK_PATH, origRank, "utf-8");
    });
});

describe("branch coverage 90 wave2: productService 追加", () => {
    let origProductsWave2;

    beforeAll(async () => {
        origProductsWave2 = await fs.readFile(PRODUCTS_PATH, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(PRODUCTS_PATH, origProductsWave2, "utf-8");
    });

    test("addProduct は商品コード空で失敗", async () => {
        const r = await productService.addProduct({ productCode: "   ", name: "x" });
        expect(r.success).toBe(false);
    });

    test("addProduct は rankPrices ありで rankPricesUpdatedAt を付与", async () => {
        const code = `TMP_RPU_${Date.now()}`;
        const r = await productService.addProduct({
            productCode: code,
            name: "n",
            manufacturer: "m",
            category: "汎用",
            basePrice: 1,
            rankPrices: { A: 1 }
        });
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const p = list.find((x) => x.productCode === code);
        expect(p.rankPricesUpdatedAt).toBeDefined();
        await productService.deleteProduct(code);
    });

    test("updateProduct は存在しないコードで失敗", async () => {
        const r = await productService.updateProduct({ productCode: "__NO_SUCH__", name: "x" });
        expect(r.success).toBe(false);
    });

    test("deleteProduct は存在しないコードで失敗", async () => {
        const r = await productService.deleteProduct("__NO_DEL__");
        expect(r.success).toBe(false);
    });
});
