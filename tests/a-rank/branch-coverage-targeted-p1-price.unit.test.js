"use strict";

/**
 * lcov 上の priceService 未充足分岐を個別シナリオで狙う（重複 each なし）
 */
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
        getSettings: jest.fn().mockResolvedValue({ shippingRules: {} }),
        getPriceListFormatConfig: jest.fn().mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1, 再生: 2, 汎用: 3 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正", 再生: "再生" },
            sheetManufacturerSortCategory: "再生",
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        })
    };
});

const { readToRowArrays } = require("../../utils/excelReader");
const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const RANK_PATH = dbPath("rank_prices.json");
const RANK_AT_PATH = dbPath("rank_prices_updated_at.json");
const PRODUCTS_PATH = dbPath("products.json");
const PRICES_PATH = dbPath("prices.json");
const CUSTOMERS_PATH = dbPath("customers.json");

describe("branch-coverage-targeted-p1: priceService", () => {
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

    test("updateRankPricesFromExcel: ヘッダに空セル列を挟み if(!label) を通す", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "", "ランク1"],
            ["P_EMPTY_HDR", 0, 1]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("updateRankPricesFromExcel: products.json 破損時 catch で空配列扱い", async () => {
        await fs.writeFile(PRODUCTS_PATH, "NOT_JSON", "utf-8");
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["P_BAD_JSON", 1]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("updateRankPricesFromExcel: rank_prices_updated_at 破損で catch 分岐", async () => {
        await fs.writeFile(RANK_AT_PATH, "{", "utf-8");
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["P_BAD_AT", 2]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("updateRankPricesFromExcel: rank_prices.json 読込失敗 catch", async () => {
        await fs.writeFile(RANK_PATH, "[[", "utf-8");
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["P_BAD_RANK", 3]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("updateRankPricesFromExcel: ランクZ は rankIds に無ければ列無視（ランク1は有効）", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "ランクZ"],
            ["P_NOZ", 9, 99]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_NOZ).toEqual({ A: 9 });
    });

    test("updateRankPricesFromExcel: 商品名 VALUE! で excelName 空", async () => {
        const list = JSON.parse(origProducts);
        list.push({
            productCode: "P_VAL",
            name: "old",
            manufacturer: "M",
            category: "純正",
            basePrice: 1
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(list, null, 2), "utf-8");
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["P_VAL", "#VALUE!", 5]
        ]);
        await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        const list2 = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        expect(list2.find((p) => p.productCode === "P_VAL").name).toBe("");
    });

    test("updateRankPricesFromExcel: データ行の商品コード空は forEach で return", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["", 1],
            ["P_SKIP", 2]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
    });

    test("saveRankPrices: prices が配列の行は object 分岐に入らずスキップ", async () => {
        await priceService.saveRankPrices({
            rows: [{ productCode: "ARR", prices: [1, 2] }]
        });
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.ARR).toBeUndefined();
    });

    test("saveRankPrices: 数値キーだけ空のオブジェクトは rankPriceMap に入れない", async () => {
        await priceService.saveRankPrices({
            rows: [{ productCode: "EMPTY_P", prices: { A: "x", B: "y" } }]
        });
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.EMPTY_P).toBeUndefined();
    });

    test("saveRankPrices: updated_at ファイル欠損 catch", async () => {
        await fs.unlink(RANK_AT_PATH).catch(() => {});
        await priceService.saveRankPrices({ rows: [{ productCode: "U1", prices: { A: 1 } }] });
        const at = JSON.parse(await fs.readFile(RANK_AT_PATH, "utf-8"));
        expect(at.U1).toBeTruthy();
    });

    test("getRankPricesUpdatedAt: JSON 破損で {}", async () => {
        await fs.writeFile(RANK_AT_PATH, "oops", "utf-8");
        await expect(priceService.getRankPricesUpdatedAt()).resolves.toEqual({});
    });

    test("getPricelistCsvForRank: 無効価格はスキップ Infinity", async () => {
        const rmap = JSON.parse(origRank);
        rmap.P_INF = { A: Number.POSITIVE_INFINITY };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).not.toContain("P_INF");
    });

    test("getPricelistCsvForRank: stripToken で displayName 生成", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "DEL",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: []
        });
        const rmap = { PT: { A: 10 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "PT");
        plist.push({
            productCode: "PT",
            name: "XDELY",
            manufacturer: "M",
            category: "純正",
            basePrice: 100
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("PT");
    });

    test("getPricelistCsvForRank: マスタ無し商品はフォールバック名", async () => {
        const rmap = { NOMASTER: { A: 50 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("NOMASTER");
    });

    test("getPricelistCsvForRank: 定価0で listPriceDisplay 空・掛率 -", async () => {
        const rmap = { ZB: { A: 10 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "ZB");
        plist.push({
            productCode: "ZB",
            name: "n",
            manufacturer: "M",
            category: "再生",
            basePrice: 0
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("ZB");
    });

    test("getPricelistExcelForRank: shippingRules default キー", async () => {
        settingsService.getSettings.mockResolvedValueOnce({
            shippingRules: { default: "送料共通\n2行目" }
        });
        const rmap = { EX1: { A: 1 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "EX1");
        plist.push({
            productCode: "EX1",
            name: "n",
            manufacturer: "M1",
            category: "純正",
            basePrice: 10
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("getPricelistExcelForRank: colCount>8 で列幅フォールバック", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 猫: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 猫: "猫" },
            sheetManufacturerSortCategory: "猫",
            excelHeaderRow: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
        });
        const rmap = { WIDE: { A: 1 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "WIDE");
        plist.push({
            productCode: "WIDE",
            name: "n",
            manufacturer: "M",
            category: "猫",
            basePrice: 1
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(100);
    });

    test("getAllSpecialPrices: 存在しない顧客IDは （削除された顧客）", async () => {
        const plist = JSON.parse(origPrices);
        plist.push({ customerId: "NO_SUCH_CUST", productCode: "P001", specialPrice: 1 });
        await fs.writeFile(PRICES_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const r = await priceService.getAllSpecialPrices();
        const row = r.find((x) => x.customerId === "NO_SUCH_CUST");
        expect(row.customerName).toBe("（削除された顧客）");
    });

    test("getCustomerPriceList: マスタに無い商品コードは 不明な商品", async () => {
        const plist = JSON.parse(origPrices);
        plist.push({ customerId: "TEST001", productCode: "ZZZ_UNKNOWN", specialPrice: 1 });
        await fs.writeFile(PRICES_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const r = await priceService.getCustomerPriceList("TEST001");
        const row = r.find((x) => x.productCode === "ZZZ_UNKNOWN");
        expect(row.productName).toBe("不明な商品");
    });

    test("_loadJson 経由 getPriceForAdmin 特価なし", async () => {
        const r = await priceService.getPriceForAdmin("TEST001", "P999999");
        expect(r.isSpecial).toBe(false);
    });

    test("updateSpecialPrice 既存行更新", async () => {
        const r = await priceService.updateSpecialPrice("TEST001", "P001", 888);
        expect(r.success).toBe(true);
    });

    test("updateSpecialPrice 新規行を push", async () => {
        const r = await priceService.updateSpecialPrice("TEST001", "P_NEW_" + Date.now(), 100);
        expect(r.success).toBe(true);
    });

    test("deleteSpecialPrice 成功と not found", async () => {
        await priceService.updateSpecialPrice("TEST001", "P_DEL_TMP", 50);
        const ok = await priceService.deleteSpecialPrice("TEST001", "P_DEL_TMP");
        expect(ok.success).toBe(true);
        const bad = await priceService.deleteSpecialPrice("TEST001", "P_DEL_TMP");
        expect(bad.success).toBe(false);
    });

    test("updateRankPricesFromExcel: 空シート", async () => {
        readToRowArrays.mockResolvedValue([]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(false);
    });

    test("updateRankPricesFromExcel: 商品コード列なし", async () => {
        readToRowArrays.mockResolvedValue([["ランク1"], ["x"]]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(false);
    });

    test("updateRankPricesFromExcel: ランク列ゼロ", async () => {
        readToRowArrays.mockResolvedValue([["商品コード", "備考"], ["P1", "a"]]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(false);
    });

    test("updateRankPricesFromExcel: 表示名 ゴールド で rank A", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ゴールド"],
            ["P_GOLD", 11]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_GOLD.A).toBe(11);
    });

    test("updateRankPricesFromExcel: ランク99 は rankIds 範囲外で列無視", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "ランク99"],
            ["P_OOB", 1, 9]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_OOB).toEqual({ A: 1 });
    });

    test("getRankPrices: JSON 破損で {}", async () => {
        await fs.writeFile(RANK_PATH, "{", "utf-8");
        await expect(priceService.getRankPrices()).resolves.toEqual({});
    });

    test("saveRankPrices: rows 無しでオブジェクトマップをそのまま保存", async () => {
        await priceService.saveRankPrices({ X1: { A: 5 }, X2: { B: 6 } });
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.X1.A).toBe(5);
    });

    test("saveRankPrices: row[0] でコード解決", async () => {
        await priceService.saveRankPrices({ rows: [{ 0: "VIA0", prices: { A: 3 } }] });
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.VIA0.A).toBe(3);
    });

    test("getPricelistCsvForRank: 負の価格は行スキップ", async () => {
        const rmap = { NEG: { A: -5 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).not.toContain("NEG");
    });

    test("getPricelistCsvForRank: 上限超え価格はスキップ", async () => {
        const rmap = { BIG: { A: 1e12 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).not.toContain("BIG");
    });

    test("getPricelistExcelForRank: shippingRules のメーカー表示キー優先", async () => {
        settingsService.getSettings.mockResolvedValueOnce({
            shippingRules: { M2: "メーカー送料" }
        });
        const rmap = { SH1: { A: 1 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "SH1");
        plist.push({
            productCode: "SH1",
            name: "n",
            manufacturer: "M2",
            category: "純正",
            basePrice: 10
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(100);
    });

    test("getPricelistExcelForRank: 重複シート名 sanitize の while", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 猫: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "猫",
            sheetNamesByCategory: { 猫: "同じ", 犬: "同じ" },
            sheetManufacturerSortCategory: "猫",
            excelHeaderRow: ["a", "b", "c", "d", "e", "f", "g", "h"]
        });
        const rmap = { D1: { A: 1 }, D2: { A: 2 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => !["D1", "D2"].includes(p.productCode));
        plist.push(
            { productCode: "D1", name: "n", manufacturer: "M", category: "猫", basePrice: 1 },
            { productCode: "D2", name: "n2", manufacturer: "M", category: "犬", basePrice: 1 }
        );
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(100);
    });

    test("updateRankPricesFromExcel: 表示名一致だが id が rankIds に無い列はランク数字列のみ有効", async () => {
        settingsService.getRankIds.mockResolvedValueOnce(["A"]);
        settingsService.getRankList.mockResolvedValueOnce([{ id: "Z", name: "ゴールド" }]);
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ゴールド", "ランク1"],
            ["P_RANKONLY", 1, 300]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_RANKONLY).toEqual({ A: 300 });
    });

    test("updateRankPricesFromExcel: ランクセル非数は価格オブジェクト空でも行は登録", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1"],
            ["P_EMPTY_RANK", "x"]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_EMPTY_RANK).toEqual({});
    });

    test("updateRankPricesFromExcel: 商品名 #NAME? で excelName 空・マスタ更新", async () => {
        const list = JSON.parse(origProducts).filter((p) => p.productCode !== "P_NAME_ERR");
        list.push({
            productCode: "P_NAME_ERR",
            name: "oldnm",
            manufacturer: "M",
            category: "純正",
            basePrice: 1
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(list, null, 2), "utf-8");
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["P_NAME_ERR", "#NAME?", 4]
        ]);
        await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        const list2 = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        expect(list2.find((p) => p.productCode === "P_NAME_ERR").name).toBe("");
    });

    test("updateRankPricesFromExcel: マスタに無いコードは商品名更新スキップ", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "ランク1"],
            ["NOT_IN_MASTER_XYZ", "ShouldNotApply", 2]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        expect(r.message).not.toContain("商品名を");
    });

    test("getPricelistExcelForRank: getSettings が null でも shippingRules 空で生成", async () => {
        settingsService.getSettings.mockResolvedValueOnce(null);
        const rmap = { NULSET1: { A: 5 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "NULSET1");
        plist.push({
            productCode: "NULSET1",
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: 100
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("getPricelistExcelForRank: stripToken で表示名が空なら productCode にフォールバック", async () => {
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 汎用: 3 },
            productNameStripFromDisplay: "ZAP",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 汎用: "汎用" },
            sheetManufacturerSortCategory: "汎用",
            excelHeaderRow: ["a", "b", "c", "d", "e", "f", "g", "h"]
        });
        const rmap = { FBZAP: { A: 9 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "FBZAP");
        plist.push({
            productCode: "FBZAP",
            name: "ZAP",
            manufacturer: "M",
            category: "汎用",
            basePrice: 10
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("getPricelistExcelForRank: 定価セルが非数文字で列4は wrapText 側", async () => {
        const rmap = { TXTBP: { A: 5 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "TXTBP");
        plist.push({
            productCode: "TXTBP",
            name: "n",
            manufacturer: "M",
            category: "汎用",
            basePrice: "お問合せ"
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("updateRankPricesFromExcel: ヘッダをランク表示名（ゴールド）で byDisplayName 解決", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ゴールド"],
            ["P_DISP_RANK", 42]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_DISP_RANK).toEqual({ A: 42 });
    });

    test("updateRankPricesFromExcel: ランクB 英字ヘッダで rankLetter 分岐", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランクB"],
            ["P_LETTER_B", 8]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_LETTER_B).toEqual({ B: 8 });
    });

    test("updateRankPricesFromExcel: ランク価格セルが空なら parsePriceCell null でキー省略", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "ランク1", "ランク2"],
            ["P_NULL_RANK", 5, ""]
        ]);
        const r = await priceService.updateRankPricesFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const m = JSON.parse(await fs.readFile(RANK_PATH, "utf-8"));
        expect(m.P_NULL_RANK).toEqual({ A: 5 });
    });

    test("getPricelistExcelForRank: メーカー名が31文字超でシート名サニタイズ slice 分岐", async () => {
        const longMaker = "メーカー長い_" + "x".repeat(35);
        const rmap = { LONGMK: { A: 100 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "LONGMK");
        plist.push({
            productCode: "LONGMK",
            name: "n",
            manufacturer: longMaker,
            category: "純正",
            basePrice: 1000
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        settingsService.getPriceListFormatConfig.mockResolvedValueOnce({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
        });
        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("getPricelistCsvForRank: 価格が小数で Math.round 分岐", async () => {
        const rmap = { DECP: { A: 99.4 } };
        await fs.writeFile(RANK_PATH, JSON.stringify(rmap, null, 2), "utf-8");
        const plist = JSON.parse(origProducts).filter((p) => p.productCode !== "DECP");
        plist.push({
            productCode: "DECP",
            name: "d",
            manufacturer: "M",
            category: "汎用",
            basePrice: 200
        });
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(plist, null, 2), "utf-8");
        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv).toContain("DECP");
        expect(csv).toContain(",99,");
    });

    test("getAllSpecialPrices: 顧客・商品マスタに無い特価は削除ラベル", async () => {
        const op = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        op.push({ customerId: "NO_CUST_XX", productCode: "NO_PROD_YY", specialPrice: 1 });
        await fs.writeFile(PRICES_PATH, JSON.stringify(op, null, 2), "utf-8");
        const rows = await priceService.getAllSpecialPrices();
        const r = rows.find((x) => x.customerId === "NO_CUST_XX");
        expect(r.customerName).toContain("削除");
        expect(r.productName).toContain("削除");
    });

    test("getCustomerPriceList: 商品マスタに無いコードは不明な商品", async () => {
        const op = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        op.push({ customerId: "TEST001", productCode: "GHOST_PRICE_" + Date.now(), specialPrice: 3 });
        await fs.writeFile(PRICES_PATH, JSON.stringify(op, null, 2), "utf-8");
        const rows = await priceService.getCustomerPriceList("TEST001");
        expect(rows.some((x) => x.productName.includes("不明"))).toBe(true);
    });

    test("getPriceForAdmin: 特価エントリありで isSpecial true", async () => {
        const r = await priceService.getPriceForAdmin("TEST001", "P001");
        expect(r.success).toBe(true);
        expect(r.isSpecial).toBe(true);
    });

    test("getPriceForAdmin: 特価なし商品はベース価格", async () => {
        const r = await priceService.getPriceForAdmin("TEST001", "P002");
        expect(r.success).toBe(true);
        expect(r.isSpecial).toBe(false);
        expect(r.currentPrice).toBeGreaterThan(0);
    });

    test("deleteSpecialPrice: 存在しない組み合わせは失敗", async () => {
        const r = await priceService.deleteSpecialPrice("NOPE_C", "NOPE_P");
        expect(r.success).toBe(false);
    });

    test("updateSpecialPrice: 新規の特価行を追加", async () => {
        const code = "NEW_SP_" + Date.now();
        const r = await priceService.updateSpecialPrice("TEST001", code, 777);
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        expect(list.some((p) => p.productCode === code)).toBe(true);
    });

    test("updateSpecialPrice: 既存行を上書き", async () => {
        const r = await priceService.updateSpecialPrice("TEST001", "P001", 888);
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRICES_PATH, "utf-8"));
        const e = list.find((p) => p.customerId === "TEST001" && p.productCode === "P001");
        expect(e.specialPrice).toBe(888);
    });
});
