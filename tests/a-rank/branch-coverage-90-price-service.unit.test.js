"use strict";

/**
 * 分岐カバレッジ 90% 向け: priceService の未踏分岐（CSV/Excel・saveRankPrices・getPriceForAdmin）
 */
jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({
        shippingRules: {
            default: "送料A\n送料B",
            "M1": "メーカー専用\n2行目"
        }
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

const { readToRowArrays } = require("../../utils/excelReader");
const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const RANK_PATH = dbPath("rank_prices.json");
const RANK_AT_PATH = dbPath("rank_prices_updated_at.json");
const PRODUCTS_PATH = dbPath("products.json");
const PRICES_PATH = dbPath("prices.json");

describe("branch coverage 90: priceService 追加分岐", () => {
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

    test("getPriceForAdmin は特価ありで currentPrice が特価・isSpecial true", async () => {
        const r = await priceService.getPriceForAdmin("TEST001", "P001");
        expect(r.success).toBe(true);
        expect(r.isSpecial).toBe(true);
        expect(r.currentPrice).toBe(900);
    });

    test("saveRankPrices は body が非オブジェクトのとき空オブジェクト扱い", async () => {
        await priceService.saveRankPrices("not-object");
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(typeof map).toBe("object");
    });

    test("saveRankPrices は rows 内で空コードをスキップし prices が配列の行は無視", async () => {
        await priceService.saveRankPrices({
            rows: [
                { productCode: "", prices: { A: 1 } },
                { productCode: "XEMPTY", prices: [1, 2] },
                { productCode: "OK1", prices: { A: 5 } }
            ]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.OK1.A).toBe(5);
        expect(map.XEMPTY).toBeUndefined();
    });

    test("updateRankPricesFromExcel はヘッダー商品名が h.includes 分岐のみで一致（=== ではない）", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "長い商品名列名", "ランク1"],
            ["PCOL", "N", 1]
        ]);
        settingsService.getRankList.mockResolvedValueOnce([{ id: "A", name: "ゴールド" }]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("updateRankPricesFromExcel は商品名列が無い場合 nameColIndex -1（name更新スキップ）", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["ONLYCODE", 99]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        expect(r.message).not.toContain("商品名");
    });

    test("getPricelistCsvForRank はランク価格が不正な型・範囲の行をスキップ", async () => {
        const rank = JSON.parse(origRank);
        rank.P_BAD1 = { A: -5 };
        rank.P_BAD2 = { A: 1e15 };
        rank.P_BAD3 = { A: NaN };
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).not.toContain("P_BAD1");
        expect(csv).not.toContain("P_BAD2");
        expect(csv).not.toContain("P_BAD3");
    });

    test("getPricelistCsvForRank は商品名から 商品コード 表記を除去（stripToken なし）", async () => {
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "STRIP_CODE",
            name: "表示商品コード除去",
            manufacturer: "M",
            category: "汎用",
            basePrice: 100,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.STRIP_CODE = { A: 400 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("STRIP_CODE");
        expect(csv).not.toContain("商品コード");
    });

    test("getPricelistCsvForRank は表示名が空になると productCode を表示名にする", async () => {
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "EMPTYNAME",
            name: "   ",
            manufacturer: "M",
            category: "汎用",
            basePrice: 100,
            stockStatus: "即納",
            active: true
        });
        const rank = JSON.parse(origRank);
        rank.EMPTYNAME = { A: 300 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("EMPTYNAME");
    });

    test("getPricelistCsvForRank は同じ categoryOrder で純正以外はソートで 0 比較を通す", async () => {
        const products = JSON.parse(origProducts);
        products.push(
            {
                productCode: "Z2",
                name: "b",
                manufacturer: "Mb",
                category: "再生",
                basePrice: 50,
                stockStatus: "即納",
                active: true
            },
            {
                productCode: "Z1",
                name: "a",
                manufacturer: "Ma",
                category: "再生",
                basePrice: 50,
                stockStatus: "即納",
                active: true
            }
        );
        const rank = JSON.parse(origRank);
        rank.Z1 = { A: 10 };
        rank.Z2 = { A: 11 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("Z1");
        expect(csv).toContain("Z2");
    });

    test("getPricelistExcelForRank はシート名サニタイズで重複時 _1 を付ける", async () => {
        const products = JSON.parse(origProducts);
        products.push(
            {
                productCode: "DUP1",
                name: "n1",
                manufacturer: "A/B",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            },
            {
                productCode: "DUP2",
                name: "n2",
                manufacturer: "A*B",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            }
        );
        const rank = JSON.parse(origRank);
        rank.DUP1 = { A: 50 };
        rank.DUP2 = { A: 60 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { buffer, filename } = await priceService.getPricelistExcelForRank("A");
        expect(filename).toMatch(/xlsx$/);
        expect(buffer.length).toBeGreaterThan(2000);
    });

    test("getPricelistExcelForRank は空の excelHeaderRow 既定ヘッダーにフォールバック", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正" },
            excelHeaderRow: []
        });
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(500);
    });

    test("getRankPrices / getRankPricesUpdatedAt は JSON ファイルを読める", async () => {
        const rp = await priceService.getRankPrices();
        expect(typeof rp).toBe("object");
        const at = await priceService.getRankPricesUpdatedAt();
        expect(typeof at).toBe("object");
    });
});
