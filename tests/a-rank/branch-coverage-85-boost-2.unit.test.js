"use strict";

/**
 * 分岐カバレッジ 85% 向け第2弾: csvService / priceService / settingsService の未踏分岐
 */
jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const { readToRowArrays } = require("../../utils/excelReader");
const csvService = require("../../services/csvService");
const priceService = require("../../services/priceService");
const settingsService = require("../../services/settingsService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const PRICES_PATH = dbPath("prices.json");
const PRODUCTS_PATH = dbPath("products.json");
const RANK_PATH = dbPath("rank_prices.json");
const SETTINGS_PATH = dbPath("settings.json");

describe("branch boost 2: csvService.parseEstimatesData", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("単価が非数値の行はスキップし他行は取り込む", async () => {
        const csv = "得意先コード,商品コード,単価\nC1,P1,abc\nC2,P2,100\n";
        const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "n.csv");
        expect(out.length).toBe(1);
        expect(out[0].customerId).toBe("C2");
    });

    test("列3未満の行はスキップ", async () => {
        const csv = "得意先コード,商品コード,単価\nC1,P1\n";
        const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "short.csv");
        expect(out).toEqual([]);
    });

    test("ファイル名 .xls で Excel 経路（readToRowArrays）", async () => {
        readToRowArrays.mockResolvedValue([
            ["見積番号", "得意先コード", "商品コード", "単価", "商品名"],
            ["E1", "CX", "PX", "500", "N"]
        ]);
        const buf = Buffer.from([0x01, 0x02]);
        const out = await csvService.parseEstimatesData(buf, "legacy.xls");
        expect(out.length).toBe(1);
        expect(out[0].unitPrice).toBe(500);
    });

    test("OLE2 シグネチャでも Excel 経路", async () => {
        readToRowArrays.mockResolvedValue([
            ["得意先コード", "商品コード", "単価"],
            ["CZ", "PZ", "300"]
        ]);
        const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
        const out = await csvService.parseEstimatesData(buf, "ole.bin");
        expect(out.length).toBe(1);
    });

    test("validUntil が cellToDateString で null のあと Date.parse 成功", async () => {
        const excelModule = require("../../utils/excelReader");
        const spy = jest.spyOn(excelModule, "cellToDateString").mockReturnValue(null);
        try {
            const csv = "得意先コード,商品コード,単価,有効期限\nC8,P8,100,2028/06/01\n";
            const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "d.csv");
            expect(out[0].validUntil).toBeTruthy();
        } finally {
            spy.mockRestore();
        }
    });

    test("スキップ件数ありでログ分岐", async () => {
        const csv = "得意先コード,商品コード,単価\n0000,P9,100\nC10,P10,200\n";
        const out = await csvService.parseEstimatesData(Buffer.from(csv, "utf-8"), "skip.csv");
        expect(out.length).toBe(1);
        expect(out[0].customerId).toBe("C10");
    });
});

describe("branch boost 2: priceService 価格API", () => {
    let origPrices;
    let origProducts;

    beforeAll(async () => {
        origPrices = await fs.readFile(PRICES_PATH, "utf-8").catch(() => "[]");
        origProducts = await fs.readFile(PRODUCTS_PATH, "utf-8").catch(() => "[]");
    });

    afterAll(async () => {
        await fs.writeFile(PRICES_PATH, origPrices, "utf-8");
        await fs.writeFile(PRODUCTS_PATH, origProducts, "utf-8");
    });

    test("deleteSpecialPrice は対象なしで失敗", async () => {
        const r = await priceService.deleteSpecialPrice("__nope__", "__nope__");
        expect(r.success).toBe(false);
    });

    test("getPriceForAdmin は特価なしでベース価格・isSpecial false", async () => {
        const products = JSON.parse(origProducts);
        const code = products[0]?.productCode || "P001";
        const r = await priceService.getPriceForAdmin("ANY_CUSTOMER_NOT_SPECIAL", code);
        expect(r.success).toBe(true);
        expect(r.isSpecial).toBe(false);
        expect(typeof r.currentPrice).toBe("number");
    });

    test("getPricelistCsvForRank は csvHeaderLine に改行が無くても補完される", async () => {
        const spy = jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h1,h2",
            categoryOrder: { 純正: 1, 再生: 2, 汎用: 3, 海外純正: 4 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正"
        });
        try {
            const { csv, filename } = await priceService.getPricelistCsvForRank("A");
            expect(filename).toMatch(/\.csv$/);
            expect(csv.includes("h1,h2")).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });

    test("getPricelistCsvForRank は掛率が - になる行を含められる", async () => {
        const spy = jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 猫: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "猫"
        });
        const snapshotRank = await fs.readFile(RANK_PATH, "utf-8").catch(() => "{}");
        const snapshotProd = await fs.readFile(PRODUCTS_PATH, "utf-8").catch(() => "[]");
        const rank = JSON.parse(snapshotRank);
        const products = JSON.parse(snapshotProd);
        const code = "PCV_" + Date.now();
        products.push({
            productCode: code,
            name: "N",
            manufacturer: "M",
            category: "猫",
            basePrice: 0,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 500 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        try {
            const { csv } = await priceService.getPricelistCsvForRank("A");
            expect(csv).toContain(code);
            expect(csv).toContain("-");
        } finally {
            await fs.writeFile(PRODUCTS_PATH, snapshotProd, "utf-8");
            await fs.writeFile(RANK_PATH, snapshotRank, "utf-8");
            spy.mockRestore();
        }
    });
});

describe("branch boost 2: settingsService キャッシュ・テンプレート", () => {
    test("getSettings は短時間に2回呼んでもキャッシュヒットし同一参照に近い内容", async () => {
        settingsService.invalidateSettingsCache();
        const a = await settingsService.getSettings();
        const b = await settingsService.getSettings();
        expect(a).toEqual(b);
    });

    test("applyTemplate はテンプレート非文字列で空文字", () => {
        expect(settingsService.applyTemplate(null, { x: 1 })).toBe("");
        expect(settingsService.applyTemplate(123, { x: 1 })).toBe("");
    });

    test("getPublicBranding はオブジェクトを返す", async () => {
        const b = await settingsService.getPublicBranding();
        expect(b && typeof b).toBe("object");
        expect(String(b.companyName || "").length).toBeGreaterThan(0);
    });

    test("getRankIds は rankCount を反映（極小）", async () => {
        const orig = await fs.readFile(SETTINGS_PATH, "utf-8");
        try {
            const j = JSON.parse(orig);
            j.rankCount = 3;
            await fs.writeFile(SETTINGS_PATH, JSON.stringify(j, null, 2), "utf-8");
            settingsService.invalidateSettingsCache();
            const ids = await settingsService.getRankIds();
            expect(ids.length).toBe(3);
        } finally {
            await fs.writeFile(SETTINGS_PATH, orig, "utf-8");
            settingsService.invalidateSettingsCache();
        }
    });
});
