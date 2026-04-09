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

    test("updateRankPricesFromExcel は単独ランクID列（A）をヘッダーとして認識", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "A", "B"],
            ["P001", 10, 20]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P001.A).toBe(10);
        expect(map.P001.B).toBe(20);
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

    test("updateRankPricesFromExcel はヘッダが部分一致の商品コード・商品名列を解決", async () => {
        readToRowArrays.mockResolvedValue([
            ["備考商品コード", "備考商品名", "ランク1"],
            ["P_PARTIAL_HDR", "部分一致ヘッダ品", 55]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_PARTIAL_HDR.A).toBe(55);
    });

    test("updateRankPricesFromExcel はマスタに無いコードは商品名更新をスキップ", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["__NO_MASTER_XYZ__", "名前だけ", 1]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        expect(r.message).not.toContain("商品名");
    });

    test("getRankPrices は JSON 破損時に空オブジェクト", async () => {
        await fs.writeFile(RANK_PATH, "{broken", "utf-8");
        const r = await priceService.getRankPrices();
        expect(r).toEqual({});
    });

    test("getPricelistCsvForRank は無効・上限超えランク価格の行を出さない", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        ["E_BAD", "E_BIG", "E_NEG"].forEach((code) => {
            if (!products.some((p) => p.productCode === code)) {
                products.push({
                    productCode: code,
                    name: code,
                    manufacturer: "M",
                    category: "汎用",
                    basePrice: 0,
                    stockStatus: "即納",
                    active: true
                });
            }
        });
        rank.E_BAD = { A: "not-a-number" };
        rank.E_BIG = { A: 2000000000 };
        rank.E_NEG = { A: -1 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).not.toContain("E_BAD");
        expect(csv).not.toContain("E_BIG");
        expect(csv).not.toContain("E_NEG");
    });

    test("saveRankPrices は prices が空オブジェクトの行をスキップ", async () => {
        await priceService.saveRankPrices({
            rows: [{ productCode: "EMPTY_RANK", prices: {} }, { productCode: "OK_RANK", prices: { A: 1 } }]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.EMPTY_RANK).toBeUndefined();
        expect(map.OK_RANK.A).toBe(1);
    });

    test("updateRankPricesFromExcel は rankList の表示名が空の列は表示名マッチに使わない", async () => {
        settingsService.getRankList.mockResolvedValueOnce([
            { id: "A", name: "" },
            { id: "B", name: "シルバー" }
        ]);
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["P_EMPTYNAME", 77]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_EMPTYNAME.A).toBe(77);
    });

    test("getPricelistCsvForRank は同カテゴリかつ splitCat 以外でソート比較0を返す", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 5, 海外純正: 5 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            excelHeaderRow: ["a"]
        });
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        ["SAME1", "SAME2"].forEach((code, i) => {
            if (!products.some((p) => p.productCode === code)) {
                products.push({
                    productCode: code,
                    name: code,
                    manufacturer: i === 0 ? "ゼット" : "アール",
                    category: "汎用",
                    basePrice: 1,
                    stockStatus: "即納",
                    active: true
                });
            }
            rank[code] = { A: 100 + i };
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("SAME1");
        expect(csv).toContain("SAME2");
    });

    test("getPricelistCsvForRank は有効価格かつ定価0で掛率がハイフン", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "RATE_DASH_" + Date.now();
        products.push({
            productCode: code,
            name: "定価なし品",
            manufacturer: "M",
            category: "海外純正",
            basePrice: 0,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 1500 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        const line = csv.split("\n").find((l) => l.startsWith(code + ","));
        expect(line).toBeDefined();
        expect(line).toMatch(/1500,-$/);
    });

    test("updateRankPricesFromExcel は空商品コード行を飛ばし他行は更新", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["", "スキップ", 9],
            ["P_SKIP_CODE", "有効", 33]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map[""]).toBeUndefined();
        expect(map.P_SKIP_CODE.A).toBe(33);
    });

    test("updateRankPricesFromExcel は商品名セルが空白のとき excelName 空で上書き", async () => {
        const products = JSON.parse(origProducts);
        if (!products.some((p) => p.productCode === "PX_BLANKNAME")) {
            products.push({
                productCode: "PX_BLANKNAME",
                name: "旧",
                manufacturer: "M",
                category: "汎用",
                basePrice: 1,
                stockStatus: "即納",
                active: true
            });
            await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        }
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["PX_BLANKNAME", "   ", 5]
        ]);
        await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        const products2 = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        expect(products2.find((x) => x.productCode === "PX_BLANKNAME").name).toBe("");
    });

    test("saveRankPrices は row.prices が配列の行は価格オブジェクトを作らない", async () => {
        await priceService.saveRankPrices({ rows: [{ productCode: "PR_ARR", prices: [1, 2] }] });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.PR_ARR).toBeUndefined();
    });

    test("updateRankPricesFromExcel は表示名一致だが id が rankIds に無い列はスキップ", async () => {
        settingsService.getRankIds.mockResolvedValueOnce(["A", "B"]);
        settingsService.getRankList.mockResolvedValueOnce([
            { id: "orphanOnly", name: "孤児表示" },
            { id: "A", name: "ゴールド" }
        ]);
        readToRowArrays.mockResolvedValue([
            ["商品コード", "孤児表示", "ランク1"],
            ["P_ORPH_COL", 88, 12]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_ORPH_COL.orphanOnly).toBeUndefined();
        expect(map.P_ORPH_COL.A).toBe(12);
    });

    test("getPricelistExcelForRank は送料規定が複数行のシートを生成する", async () => {
        settingsService.getSettings.mockResolvedValueOnce({
            shippingRules: { 送料付メーカー: "規定1行目\n規定2行目" }
        });
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "EX_SHIP_" + Date.now();
        products.push({
            productCode: code,
            name: "送料テスト品",
            manufacturer: "送料付メーカー",
            category: "再生",
            basePrice: 200,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 80 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(400);
    });

    test("getPricelistExcelForRank は再生シートでメーカー名ソート分岐（sortSheetKey 一致）", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const t = Date.now();
        ["EX_SORT_Z", "EX_SORT_A"].forEach((code, i) => {
            products.push({
                productCode: code,
                name: "s",
                manufacturer: i === 0 ? "ゼット工業" : "アール工業",
                category: "再生",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            });
            rank[code] = { A: 300 + i };
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(400);
    });

    test("saveRankPrices は body が null のとき空オブジェクトとして保存", async () => {
        await priceService.saveRankPrices(null);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map).toEqual({});
    });

    test("saveRankPrices は prices の値が純粋な数字文字列のみ整数化", async () => {
        await priceService.saveRankPrices({
            rows: [{ productCode: "MIXVAL", prices: { A: "42", B: "3.1", C: " 7 " } }]
        });
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.MIXVAL.A).toBe(42);
        expect(map.MIXVAL.B).toBeUndefined();
        expect(map.MIXVAL.C).toBeUndefined();
    });

    test("updateRankPricesFromExcel は ランク文字が rankIds に無い列をスキップ", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "ランクZ"],
            ["P_SKIP_LETTER", 11, 22]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_SKIP_LETTER.A).toBe(11);
        expect(map.P_SKIP_LETTER.Z).toBeUndefined();
    });

    test("getPricelistCsvForRank は csvHeaderLine に改行が無くてもヘッダを付与", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "HDR_NL_" + Date.now();
        products.push({
            productCode: code,
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: 10,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 99 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "no-newline-header",
            categoryOrder: { 汎用: 5 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {}
        });
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv.startsWith("\uFEFFno-newline-header\n")).toBe(true);
        expect(csv).toContain(code);
    });

    test("getPricelistCsvForRank は商品名が商品コード表記のみのとき表示名をコードにフォールバック", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "NM_FALLBACK_" + Date.now();
        products.push({
            productCode: code,
            name: "商品コード",
            manufacturer: "M",
            category: "汎用",
            basePrice: 10,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 5 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        const line = csv.split("\n").find((l) => l.startsWith(code + ","));
        expect(line).toBeDefined();
        expect(line).toContain(`"${code}"`);
    });

    test("getRankPricesUpdatedAt は JSON 破損時は空オブジェクト", async () => {
        await fs.writeFile(RANK_AT_PATH, "{not-json", "utf-8");
        const r = await priceService.getRankPricesUpdatedAt();
        expect(r).toEqual({});
    });

    test("getPricelistExcelForRank は excelHeaderRow が9列以上で既定幅外の列に幅12を当てる", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 5 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "汎用" },
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]
        });
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "W9_" + Date.now();
        products.push({
            productCode: code,
            name: "w",
            manufacturer: "M",
            category: "汎用",
            basePrice: 0,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 15 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(400);
    });

    test("getPricelistExcelForRank は定価セルが非数値のとき右寄せnumFmtを付けない", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "LIST_TXT_" + Date.now();
        products.push({
            productCode: code,
            name: "x",
            manufacturer: "M",
            category: "汎用",
            basePrice: "お問合せ",
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 20 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(300);
    });

    test("updateRankPricesFromExcel はヘッダ空ラベルの列をランク列に含めない", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "", "ランク2"],
            ["P_EMPTY_HDR", 1, 9, 2]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_EMPTY_HDR.A).toBe(1);
        expect(map.P_EMPTY_HDR.B).toBe(2);
    });

    test("getPricelistExcelForRank は excelHeaderRow が非配列のとき既定8列ヘッダを使う", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 5 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "汎用" },
            excelHeaderRow: null
        });
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "HDRDEF_" + Date.now();
        products.push({
            productCode: code,
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: 10,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 22 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(300);
    });

    test("getPricelistExcelForRank は sheetManufacturerSortCategory のみで sheetNames にキーが無くても sortSheetKey を決める", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 再生: 2 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "再生"
        });
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "SORTKEY_" + Date.now();
        products.push({
            productCode: code,
            name: "s",
            manufacturer: "ソート用メーカー",
            category: "再生",
            basePrice: 50,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 30 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(300);
    });

    test("getPricelistCsvForRank はマスタの name が空でも productCode を表示名に使う", async () => {
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "EMPTYNAME_" + Date.now();
        products.push({
            productCode: code,
            name: "",
            manufacturer: "M",
            category: "汎用",
            basePrice: 100,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 40 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        const line = csv.split("\n").find((l) => l.startsWith(code + ","));
        expect(line).toBeDefined();
        expect(line).toContain(`"${code}"`);
    });

    test("updateRankPricesFromExcel は表示名一致だが id が空文字のときランク列に含めない", async () => {
        settingsService.getRankList.mockResolvedValueOnce([
            { id: "", name: "ゴールド" },
            { id: "A", name: "正規ゴールド" }
        ]);
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ゴールド", "ランク1"],
            ["P_RANK_EMPTY_ID", "n", 5, 9]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_RANK_EMPTY_ID.A).toBe(9);
        expect(map.P_RANK_EMPTY_ID[""]).toBeUndefined();
    });

    test("updateRankPricesFromExcel は商品コードセルが null でも落ちずランク価格を更新", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            [null, 44],
            ["P_NULL_CODE_OK", 55]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_NULL_CODE_OK.A).toBe(55);
    });

    test("updateRankPricesFromExcel は products が配列でないとき商品名同期をスキップ", async () => {
        await fs.writeFile(PRODUCTS_PATH, "{}", "utf-8");
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["P_OBJ_MASTER", "同期しない名", 3]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        expect(r.message).not.toContain("商品名");
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map.P_OBJ_MASTER.A).toBe(3);
    });

    test("saveRankPrices は body が数値プリミティブのとき空マップで保存", async () => {
        await priceService.saveRankPrices(42);
        const map = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(map).toEqual({});
    });

    test("getPricelistCsvForRank は rank_prices 読込失敗時も空マップとして続行", async () => {
        const fsp = require("fs").promises;
        const origRead = fsp.readFile.bind(fsp);
        jest.spyOn(fsp, "readFile").mockImplementation(async (pathLike, ...args) => {
            if (String(pathLike).replace(/\\/g, "/").includes("rank_prices.json")) {
                const err = new Error("ENOENT");
                err.code = "ENOENT";
                throw err;
            }
            return origRead(pathLike, ...args);
        });
        try {
            const { csv, filename } = await priceService.getPricelistCsvForRank("A");
            expect(filename).toMatch(/ランクA/);
            expect(csv.startsWith("\uFEFF")).toBe(true);
        } finally {
            fsp.readFile.mockRestore();
        }
    });

    test("getPricelistExcelForRank は rank_prices 読込失敗時も空マップとして続行", async () => {
        const fsp = require("fs").promises;
        const origRead = fsp.readFile.bind(fsp);
        jest.spyOn(fsp, "readFile").mockImplementation(async (pathLike, ...args) => {
            if (String(pathLike).replace(/\\/g, "/").includes("rank_prices.json")) {
                const err = new Error("ENOENT");
                err.code = "ENOENT";
                throw err;
            }
            return origRead(pathLike, ...args);
        });
        try {
            const { buffer, filename } = await priceService.getPricelistExcelForRank("B");
            expect(filename).toMatch(/ランクB/);
            expect(buffer.length).toBeGreaterThan(100);
        } finally {
            fsp.readFile.mockRestore();
        }
    });

    test("getPricelistCsvForRank は _loadJson が null を返してもマスタを空配列扱いで続行", async () => {
        const orig = priceService._loadJson.bind(priceService);
        jest.spyOn(priceService, "_loadJson").mockImplementation(async (fp) => {
            if (String(fp).replace(/\\/g, "/").includes("products.json")) return null;
            return orig(fp);
        });
        try {
            const r = await priceService.getPricelistCsvForRank("A");
            expect(r.csv).toContain("\uFEFF");
        } finally {
            priceService._loadJson.mockRestore();
        }
    });

    test("getPricelistExcelForRank はシート表示名がサニタイズで空になると既定名を使う", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 5 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "\\" },
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        });
        const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const rank = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        const code = "SANEMPTY_" + Date.now();
        products.push({
            productCode: code,
            name: "x",
            manufacturer: "M",
            category: "汎用",
            basePrice: 10,
            stockStatus: "即納",
            active: true
        });
        rank[code] = { A: 17 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");
        const r = await priceService.getPricelistExcelForRank("A");
        expect(r.buffer.length).toBeGreaterThan(200);
    });

    test("deleteSpecialPrice は存在しない組み合わせで失敗する", async () => {
        const r = await priceService.deleteSpecialPrice("__no_cust__", "__no_prod__");
        expect(r.success).toBe(false);
    });

    test("getPriceForAdmin は特価なしでベース価格を返す", async () => {
        const r = await priceService.getPriceForAdmin("TEST001", "__unknown_product_xyz__");
        expect(r.success).toBe(true);
        expect(r.isSpecial).toBe(false);
        expect(r.currentPrice).toBe(0);
    });
});
