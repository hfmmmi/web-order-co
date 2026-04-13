/**
 * productService.importFromExcel … 定価 OPEN・在庫「可」・sanitize 分岐
 */
"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readProductMasterImportRows: jest.fn() };
});

jest.mock("../../services/settingsService", () => {
    const actual = jest.requireActual("../../services/settingsService");
    return {
        ...actual,
        getRankIds: jest.fn(),
        getRankList: jest.fn()
    };
});

const { readProductMasterImportRows } = require("../../utils/excelReader");
const settingsService = require("../../services/settingsService");
const productService = require("../../services/productService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const PRODUCTS_PATH = dbPath("products.json");

describe("Aランク: productService importFromExcel OPEN/在庫可", () => {
    let backup;
    let origProducts;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        origProducts = await fs.readFile(PRODUCTS_PATH, "utf-8");
        readProductMasterImportRows.mockReset();
        settingsService.getRankIds.mockResolvedValue(["A", "B"]);
        settingsService.getRankList.mockResolvedValue([
            { id: "A", name: "ゴールド" },
            { id: "B", name: "シルバー" }
        ]);
    });

    afterEach(async () => {
        await fs.writeFile(PRODUCTS_PATH, origProducts, "utf-8");
    });

    test("定価が OPEN のとき basePrice は 0", async () => {
        readProductMasterImportRows.mockResolvedValue([
            ["商品コード", "商品名", "メーカー", "定価", "仕様", "在庫", "ランク1", "ランク2"],
            ["P-OPEN-X", "テスト", "M", "OPEN", "純正", "可", 100, 200]
        ]);
        const r = await productService.importFromExcel(Buffer.from([0x50, 0x4b, 1, 2]));
        expect(r.success).toBe(true);
        const list = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const p = list.find((x) => x.productCode === "P-OPEN-X");
        expect(p).toBeDefined();
        expect(p.basePrice).toBe(0);
        expect(p.stockStatus).toBe("即納");
    });

    test("商品名が #NAME? なら sanitize で名前更新をスキップ", async () => {
        const products = JSON.parse(origProducts);
        if (!products.some((p) => p.productCode === "P-SAN")) {
            products.push({
                productCode: "P-SAN",
                name: "保持名",
                manufacturer: "M",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true,
                rankPrices: { A: 1 }
            });
            await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        }
        readProductMasterImportRows.mockResolvedValue([
            ["商品コード", "商品名", "メーカー", "定価", "仕様", "在庫", "ランク1"],
            ["P-SAN", "#NAME?", "M", "100", "純正", "欠品", 50]
        ]);
        await productService.importFromExcel(Buffer.from([0x50, 0x4b, 1, 2]));
        const list = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf-8"));
        const p = list.find((x) => x.productCode === "P-SAN");
        expect(p.name).toBe("保持名");
    });
});
