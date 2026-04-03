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
        categoryOrder: { 純正: 1, 再生: 2, 汎用: 3, 海外純正: 4 },
        productNameStripFromDisplay: "",
        manufacturerSplitCategory: "純正",
        sheetNamesByCategory: { 純正: "純正", 再生: "再生" },
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

describe("priceService 分岐（updateRankPricesFromExcel / saveRankPrices）", () => {
    let origRank;
    let origAt;
    let origProducts;

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
    });

    afterEach(async () => {
        await fs.writeFile(RANK_PATH, origRank, "utf-8");
        await fs.writeFile(RANK_AT_PATH, origAt, "utf-8");
        await fs.writeFile(PRODUCTS_PATH, origProducts, "utf-8");
    });

    test("updateRankPricesFromExcel は空シートで失敗", async () => {
        readToRowArrays.mockResolvedValue([]);
        await expect(priceService.updateRankPricesFromExcel(Buffer.from([1]))).resolves.toMatchObject({
            success: false,
            message: expect.stringContaining("データがありません")
        });
    });

    test("updateRankPricesFromExcel は商品コード列なしで失敗", async () => {
        readToRowArrays.mockResolvedValue([
            ["列A", "列B"],
            ["x", "y"]
        ]);
        await expect(priceService.updateRankPricesFromExcel(Buffer.from([1]))).resolves.toMatchObject({
            success: false,
            message: expect.stringContaining("商品コード")
        });
    });

    test("updateRankPricesFromExcel はランク列なしで失敗", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "メモ"],
            ["Z9", "n", "m"]
        ]);
        await expect(priceService.updateRankPricesFromExcel(Buffer.from([1]))).resolves.toMatchObject({
            success: false,
            message: expect.stringContaining("ランク列")
        });
    });

    test("updateRankPricesFromExcel は ランク1/2 と表示名シルバー で列解決し商品名を反映", async () => {
        let products;
        try {
            products = JSON.parse(origProducts);
        } catch {
            products = [];
        }
        if (!Array.isArray(products)) products = [];
        if (!products.some((p) => p.productCode === "P001")) {
            products.push({
                productCode: "P001",
                name: "取込前名",
                manufacturer: "M",
                category: "汎用",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            });
            await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        }
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1", "ランク2", "シルバー"],
            ["P001", "Excelで上書き名", 10, 20, 25]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P001.A).toBe(10);
        expect(map.P001.B).toBe(25);
        expect(map.P001.C).toBeUndefined();
        const productsAfter = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const p = productsAfter.find((x) => x.productCode === "P001");
        expect(p.name).toBe("Excelで上書き名");
        expect(r.message).toContain("商品名");
    });

    test("updateRankPricesFromExcel は ランクA ヘッダーで letter 分岐（rankIds に含むとき）を通す", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランクA"],
            ["P001", 42]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P001.A).toBe(42);
    });

    test("updateRankPricesFromExcel は表示名が rankIds に無い id ならその列はスキップ", async () => {
        settingsService.getRankList.mockResolvedValueOnce([
            { id: "X", name: "孤立ランク名" },
            { id: "A", name: "ゴールド" }
        ]);
        readToRowArrays.mockResolvedValue([
            ["商品コード", "孤立ランク名", "ランク1"],
            ["P001", 99, 11]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P001.X).toBeUndefined();
        expect(map.P001.A).toBe(11);
    });

    test("updateRankPricesFromExcel は ランク番号が rankIds 範囲外ならその列は無視", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "ランク9"],
            ["P001", 5, 77]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P001.A).toBe(5);
        expect(map.P001["9"]).toBeUndefined();
        expect(Object.keys(map.P001).filter((k) => k !== "A").length).toBe(0);
    });

    test("updateRankPricesFromExcel は商品名セルが Excel エラー表記なら空文字で上書き", async () => {
        const products = JSON.parse(origProducts);
        if (!products.some((p) => p.productCode === "PX_ERR")) {
            products.push({
                productCode: "PX_ERR",
                name: "旧名",
                manufacturer: "M",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            });
            await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        }
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["PX_ERR", "#NAME?", 99]
        ]);
        await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        const products2 = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const p = products2.find((x) => x.productCode === "PX_ERR");
        expect(p.name).toBe("");
    });

    test("updateRankPricesFromExcel は readToRowArrays 例外を再throw", async () => {
        readToRowArrays.mockRejectedValueOnce(new Error("bad xlsx"));
        await expect(priceService.updateRankPricesFromExcel(Buffer.from([1]))).rejects.toThrow("bad xlsx");
    });

    test("saveRankPrices は rows 配列＋prices オブジェクト形式を保存", async () => {
        await priceService.saveRankPrices({
            rows: [
                { productCode: "SAVE1", prices: { A: 1, B: "2" } },
                { code: "SAVE2", ranks: { A: 3 } }
            ]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.SAVE1.A).toBe(1);
        expect(map.SAVE1.B).toBe(2);
        expect(map.SAVE2.A).toBe(3);
    });

    test("saveRankPrices はオブジェクトマップ形式をそのまま保存", async () => {
        await priceService.saveRankPrices({ X1: { A: 5 }, X2: { B: 6 } });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.X1.A).toBe(5);
        expect(map.X2.B).toBe(6);
    });

    test("saveRankPrices は row[0] 形式のコードと ranks を解釈", async () => {
        await priceService.saveRankPrices({
            rows: [{ 0: "ROWIDX", ranks: { A: 8, B: 9 } }]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.ROWIDX.A).toBe(8);
        expect(map.ROWIDX.B).toBe(9);
    });

    test("getPricelistCsvForRank は CSV とファイル名を返す（分岐・ソート）", async () => {
        const r = await priceService.getPricelistCsvForRank("A");
        expect(r.filename).toMatch(/ランクA\.csv$/);
        expect(r.csv.startsWith("\uFEFF")).toBe(true);
        expect(typeof r.csv).toBe("string");
        expect(r.csv.length).toBeGreaterThanOrEqual(2);
        expect(r.csv).toContain("\n");
    });

    test("getPricelistExcelForRank は xlsx バッファを生成（シート・送料・書式分岐）", async () => {
        const r = await priceService.getPricelistExcelForRank("A");
        expect(Buffer.isBuffer(r.buffer)).toBe(true);
        expect(r.buffer.length).toBeGreaterThan(500);
        expect(r.filename).toContain("xlsx");
    });

    test("getRankPricesUpdatedAt はファイル無しで空オブジェクト", async () => {
        const origRead = fs.readFile.bind(fs);
        const spy = jest.spyOn(fs, "readFile").mockImplementation(async (targetPath, enc) => {
            if (String(targetPath).replace(/\\/g, "/").includes("rank_prices_updated_at.json")) {
                const e = new Error("eno");
                e.code = "ENOENT";
                throw e;
            }
            return origRead(targetPath, enc);
        });
        const r = await priceService.getRankPricesUpdatedAt();
        expect(r).toEqual({});
        spy.mockRestore();
    });

    test("getPricelistCsvForRank は productNameStripFromDisplay で表示名を加工する", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        products.push({
            productCode: "P-STRIP-X",
            name: "表示名ストリップ品suffix",
            manufacturer: "M1",
            category: "純正",
            basePrice: 1000,
            stockStatus: "即納",
            active: true
        });
        rank["P-STRIP-X"] = { A: 5000 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1, 再生: 2, 汎用: 3, 海外純正: 4 },
            productNameStripFromDisplay: "suffix",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正" }
        });
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("P-STRIP-X");
        expect(csv.includes("表示名ストリップ品") || csv.includes("表示名")).toBe(true);
        expect(csv).not.toContain("suffix");
    });

    test("getPricelistCsvForRank は同カテゴリ純正でメーカー順ソート分岐を通す", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        ["ZZ1", "AA1"].forEach((code, i) => {
            products.push({
                productCode: code,
                name: `N${i}`,
                manufacturer: code === "AA1" ? "あいう" : "わをん",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            });
            rank[code] = { A: 2000 + i };
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        const zi = csv.indexOf("ZZ1");
        const ai = csv.indexOf("AA1");
        expect(zi).toBeGreaterThan(-1);
        expect(ai).toBeGreaterThan(-1);
        expect(ai < zi).toBe(true);
    });
});
