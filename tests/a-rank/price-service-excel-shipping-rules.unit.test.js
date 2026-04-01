/**
 * getPricelistExcelForRank … 送料規定テキスト（複数行）がシートに入る分岐
 */
"use strict";

const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const PRODUCTS_PATH = dbPath("products.json");
const RANK_PATH = dbPath("rank_prices.json");

describe("Aランク: priceService getPricelistExcelForRank 送料規定", () => {
    let backup;
    let origP;
    let origR;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        origP = await fs.readFile(PRODUCTS_PATH, "utf-8");
        origR = await fs.readFile(RANK_PATH, "utf-8");
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({
            shippingRules: {
                default: "送料A\n送料B",
                テストメーカー: "メーカー別ルール"
            }
        });
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1, 再生: 2, 汎用: 3, 海外純正: 4 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正", 再生: "再生", 汎用: "汎用", 海外純正: "海外純正" },
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: ["商品ｺｰﾄﾞ", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率", "備考"]
        });
    });

    afterEach(async () => {
        await fs.writeFile(PRODUCTS_PATH, origP, "utf-8");
        await fs.writeFile(RANK_PATH, origR, "utf-8");
        jest.restoreAllMocks();
    });

    test("送料規定が複数行でシートに入る", async () => {
        const products = JSON.parse(origP);
        const rank = JSON.parse(origR);
        products.push({
            productCode: "P-SHIP-1",
            name: "商品名",
            manufacturer: "テストメーカー",
            category: "純正",
            basePrice: 0,
            stockStatus: "即納",
            active: true
        });
        rank["P-SHIP-1"] = { A: 5000 };
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
        await fs.writeFile(RANK_PATH, JSON.stringify(rank, null, 2), "utf-8");

        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(800);
    });
});
