"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

jest.mock("../../services/settingsService", () => {
    const actual = jest.requireActual("../../services/settingsService");
    return {
        ...actual,
        getRankIds: jest.fn(),
        getRankList: jest.fn(),
        getSettings: jest.fn().mockResolvedValue({
            shippingRules: {
                default: "送料デフォルト",
                メーカーA: "ルールA\n2行目",
                その他: "その他ルール"
            }
        }),
        getPriceListFormatConfig: jest.fn().mockResolvedValue({
            csvHeaderLine: "h1,h2\n",
            categoryOrder: { 純正: 1, 再生: 2, 汎用: 3, 海外純正: 4, 猫: 5 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正", 再生: "再生", 汎用: "汎用", 海外純正: "海外純正", 猫: "猫" },
            sheetManufacturerSortCategory: "再生",
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        })
    };
});

const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const RANK_PATH = dbPath("rank_prices.json");
const RANK_AT_PATH = dbPath("rank_prices_updated_at.json");
const PRODUCTS_PATH = dbPath("products.json");
const PRICES_PATH = dbPath("prices.json");

describe("branch-coverage-90-dense-b: priceService", () => {
    let origRank;
    let origAt;
    let origProducts;
    let origPrices;

    beforeEach(async () => {
        jest.clearAllMocks();
        settingsService.getRankIds.mockResolvedValue(["A", "B", "C"]);
        settingsService.getRankList.mockResolvedValue([
            { id: "A", name: "ゴールド" },
            { id: "B", name: "シルバー" }
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

    test("getRankPrices / getRankPricesUpdatedAt はファイル欠落で {}", async () => {
        const bak = await fs.readFile(RANK_PATH, "utf-8").catch(() => null);
        await fs.writeFile(RANK_PATH, "not-json", "utf-8");
        await expect(priceService.getRankPrices()).resolves.toEqual({});
        if (bak != null) await fs.writeFile(RANK_PATH, bak, "utf-8");
        const bakAt = await fs.readFile(RANK_AT_PATH, "utf-8").catch(() => null);
        await fs.writeFile(RANK_AT_PATH, "{", "utf-8");
        await expect(priceService.getRankPricesUpdatedAt()).resolves.toEqual({});
        if (bakAt != null) await fs.writeFile(RANK_AT_PATH, bakAt, "utf-8");
    });

    test("saveRankPrices はトップレベルオブジェクトをそのまま保存", async () => {
        await priceService.saveRankPrices({ X1: { A: 1 } });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.X1.A).toBe(1);
    });

    test("saveRankPrices rows の prices が文字列数字", async () => {
        await priceService.saveRankPrices({
            rows: [{ productCode: "S1", prices: { A: "42" } }]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.S1.A).toBe(42);
    });

    test("deleteSpecialPrice は存在しなければ false", async () => {
        const r = await priceService.deleteSpecialPrice("__none__", "__none__");
        expect(r.success).toBe(false);
    });

    test("getCustomerPriceList / getAllSpecialPrices は配列を返す", async () => {
        const list = await priceService.getCustomerPriceList("TEST001");
        expect(Array.isArray(list)).toBe(true);
        const all = await priceService.getAllSpecialPrices();
        expect(Array.isArray(all)).toBe(true);
    });

    test.each([
        ["A"],
        ["B"],
        ["C"]
    ])("getPricelistCsvForRank rank=%s", async (rank) => {
        const rankMap = JSON.parse(origRank);
        rankMap.CSV1 = { A: 100, B: 50 };
        await fs.writeFile(RANK_PATH, JSON.stringify(rankMap, null, 2), "utf-8");
        const { csv, filename } = await priceService.getPricelistCsvForRank(rank);
        expect(csv).toContain("\uFEFF");
        expect(filename).toContain(rank);
    });

    test("getPricelistCsvForRank stripToken 分岐", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "X",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: []
        });
        const rankMap = { ST: { A: 10 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rankMap, null, 2), "utf-8");
        const products = JSON.parse(origProducts);
        products.push({
            productCode: "ST",
            name: "X商品X",
            manufacturer: "M",
            category: "純正",
            basePrice: 100
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("ST");
    });

    test.each(Array.from({ length: 35 }, (_, i) => i))("getPricelistExcelForRank 繰り返し %#", async (i) => {
        const rankMap = {};
        rankMap[`P${i}`] = { A: 100 + i };
        await fs.writeFile(RANK_PATH, JSON.stringify(rankMap, null, 2), "utf-8");
        const products = JSON.parse(origProducts);
        if (!products.find((p) => p.productCode === `P${i}`)) {
            products.push({
                productCode: `P${i}`,
                name: `N${i}`,
                manufacturer: `M${i % 3}`,
                category: i % 2 === 0 ? "純正" : "再生",
                basePrice: 1000
            });
            await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        }
        const { buffer, filename } = await priceService.getPricelistExcelForRank("A");
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(filename).toContain("xlsx");
    });

    test("getPricelistExcelForRank 重複シート名をサニタイズ", async () => {
        const rankMap = { D1: { A: 1 }, D2: { A: 2 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rankMap, null, 2), "utf-8");
        const products = JSON.parse(origProducts).filter((p) => !["D1", "D2"].includes(p.productCode));
        products.push(
            {
                productCode: "D1",
                name: "n",
                manufacturer: "同メーカー名",
                category: "純正",
                basePrice: 1
            },
            {
                productCode: "D2",
                name: "n2",
                manufacturer: "同メーカー名",
                category: "純正",
                basePrice: 1
            }
        );
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(100);
    });

    test("updateSpecialPrice は新規追加", async () => {
        const r = await priceService.updateSpecialPrice("__newcust__", "__newprod__", 333);
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        const hit = list.find(
            (p) => p.customerId === "__newcust__" && p.productCode === "__newprod__"
        );
        expect(hit.specialPrice).toBe(333);
    });
});

describe("branch-coverage-90-dense-b: settingsService applyTemplate", () => {
    const settingsService = require("../../services/settingsService");

    test.each(
        Array.from({ length: 50 }, (_, i) => {
            const a = `A${i}`;
            const b = `B${i}`;
            const c = `C${i}`;
            return [`{{a}}-{{b}}-{{c}}`, { a, b, c }, `${a}-${b}-${c}`];
        })
    )("applyTemplate %#", (tpl, vars, expected) => {
        expect(settingsService.applyTemplate(tpl, vars)).toBe(expected);
    });
});
