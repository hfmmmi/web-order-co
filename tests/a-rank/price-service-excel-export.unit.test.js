"use strict";

const fs = require("fs").promises;
const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const { dbPath } = require("../../dbPaths");

describe("priceService getPricelistExcelForRank 分岐", () => {
    const rankPath = dbPath("rank_prices.json");
    const productsPath = dbPath("products.json");
    let origRank;
    let origProducts;

    beforeAll(async () => {
        origRank = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
        origProducts = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
    });

    afterAll(async () => {
        await fs.writeFile(rankPath, origRank, "utf-8");
        await fs.writeFile(productsPath, origProducts, "utf-8");
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("純正メーカー別・再生・その他・送料規定・Excel生成", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "a,b\n",
            categoryOrder: { 純正: 1, 再生: 2, その他: 3 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正", 再生: "再生", その他: "その他" },
            sheetManufacturerSortCategory: "再生",
            excelHeaderRow: ["商品コード", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率", "備考"]
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({
            shippingRules: {
                メーカー甲: "甲送料\n2行目",
                メーカー乙: "乙送料",
                default: "デフォルト送料"
            }
        });

        await fs.writeFile(
            rankPath,
            JSON.stringify(
                {
                    PJZ1: { A: 1000 },
                    PJZ2: { A: 800 },
                    PSZ1: { A: 500 },
                    POT1: { A: 300 },
                    PSKIP: { A: 0 },
                    PBAD: { A: 9999999999 }
                },
                null,
                2
            ),
            "utf-8"
        );
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [
                    {
                        productCode: "PJZ1",
                        name: "純商品コード品",
                        manufacturer: "メーカー甲",
                        category: "純正",
                        basePrice: 2000,
                        remarks: "価格表備考テキスト"
                    },
                    {
                        productCode: "PJZ2",
                        name: "純乙",
                        manufacturer: "メーカー乙",
                        category: "純正",
                        basePrice: 1500
                    },
                    {
                        productCode: "PSZ1",
                        name: "再生品",
                        manufacturer: "R社",
                        category: "再生",
                        basePrice: 100
                    },
                    {
                        productCode: "POT1",
                        name: "その他品",
                        manufacturer: "O社",
                        category: "その他",
                        basePrice: 0
                    },
                    { productCode: "PSKIP", name: "価格0スキップ", manufacturer: "M", category: "再生", basePrice: 1 },
                    { productCode: "PBAD", name: "上限外", manufacturer: "M2", category: "再生", basePrice: 1 }
                ],
                null,
                2
            ),
            "utf-8"
        );

        const { buffer, filename } = await priceService.getPricelistExcelForRank("A");
        expect(filename).toMatch(/ランクA\.xlsx$/);
        expect(buffer.length).toBeGreaterThan(800);
        const ExcelJS = require("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const 甲 = wb.worksheets.find((w) => String(w.name).includes("甲"));
        expect(甲).toBeTruthy();
        const headerRowNum = 甲.getSheetValues().findIndex((row, i) => i > 0 && row && row[1] === "商品コード");
        expect(headerRowNum).toBeGreaterThan(0);
        const dataRow = 甲.getRow(headerRowNum + 1);
        expect(String(dataRow.getCell(8).value || "")).toContain("価格表備考テキスト");
    });

    test("productNameStripFromDisplay で表示名を削り listPrice 空・掛率ハイフン", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { カテゴリX: 1 },
            productNameStripFromDisplay: "suffix",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { カテゴリX: "シートX" },
            sheetManufacturerSortCategory: "カテゴリX",
            excelHeaderRow: ["商品コード", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率", "備考"]
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: {} });

        await fs.writeFile(rankPath, JSON.stringify({ STRIP1: { A: 100 } }, null, 2), "utf-8");
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [
                    {
                        productCode: "STRIP1",
                        name: "名前suffix",
                        manufacturer: "M",
                        category: "カテゴリX",
                        basePrice: 0
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );

        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("getPricelistCsvForRank は純正メーカー順・stripToken・splitCat を反映", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "head\n",
            categoryOrder: { 純正: 1, 再生: 2 },
            productNameStripFromDisplay: "DEL",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: []
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: {} });

        await fs.writeFile(
            rankPath,
            JSON.stringify({ CSVJ1: { A: 400 }, CSVJ2: { A: 300 } }, null, 2),
            "utf-8"
        );
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [
                    {
                        productCode: "CSVJ1",
                        name: "nDELx",
                        manufacturer: "ゼット社",
                        category: "純正",
                        basePrice: 1000
                    },
                    {
                        productCode: "CSVJ2",
                        name: "n2",
                        manufacturer: "アール社",
                        category: "純正",
                        basePrice: 800
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );

        const { csv, filename } = await priceService.getPricelistCsvForRank("A");
        expect(filename).toContain("csv");
        expect(csv).toContain("CSVJ1");
        expect(csv).not.toContain("DEL");
    });

    test("既定 excelHeaderRow（配列空）でも workbook を生成", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 猫: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "猫",
            excelHeaderRow: []
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: { default: "" } });

        await fs.writeFile(rankPath, JSON.stringify({ CAT1: { A: 50 } }, null, 2), "utf-8");
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [{ productCode: "CAT1", name: "N", manufacturer: "", category: "猫", basePrice: 10 }],
                null,
                2
            ),
            "utf-8"
        );

        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(200);
    });

    test("純正メーカー名の / と : が sanitize で同一シート名になり連番で重複解消", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正" },
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: ["商品ｺｰﾄﾞ", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率", "備考"]
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: {} });

        await fs.writeFile(rankPath, JSON.stringify({ DS1: { A: 100 }, DS2: { A: 200 } }, null, 2), "utf-8");
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [
                    {
                        productCode: "DS1",
                        name: "n1",
                        manufacturer: "甲/乙株式会社",
                        category: "純正",
                        basePrice: 1000
                    },
                    {
                        productCode: "DS2",
                        name: "n2",
                        manufacturer: "甲:乙株式会社",
                        category: "純正",
                        basePrice: 1000
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );

        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(1200);
    });

    test("純正メーカー名が31文字超のとき sanitize で切り詰めて Excel 生成", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正" },
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: ["商品コード", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率", "備考"]
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: {} });

        const longM = "M".repeat(40);
        await fs.writeFile(rankPath, JSON.stringify({ LG31: { A: 10 } }, null, 2), "utf-8");
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [{ productCode: "LG31", name: "n", manufacturer: longM, category: "純正", basePrice: 1 }],
                null,
                2
            ),
            "utf-8"
        );

        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(400);
    });

    test("excelHeaderRow が9列以上のとき列パディング・書式分岐を通す", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "h\n",
            categoryOrder: { 純正: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: { 純正: "純正" },
            sheetManufacturerSortCategory: "純正",
            excelHeaderRow: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"]
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: {} });

        await fs.writeFile(rankPath, JSON.stringify({ WIDE1: { A: 99 } }, null, 2), "utf-8");
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [{ productCode: "WIDE1", name: "n", manufacturer: "MK", category: "純正", basePrice: 100 }],
                null,
                2
            ),
            "utf-8"
        );

        const { buffer } = await priceService.getPricelistExcelForRank("A");
        expect(buffer.length).toBeGreaterThan(400);
    });

    test("getPricelistCsvForRank は csvHeaderLine が改行なしでもヘッダに改行を付与", async () => {
        jest.spyOn(settingsService, "getPriceListFormatConfig").mockResolvedValue({
            csvHeaderLine: "単独行ヘッダ",
            categoryOrder: { 猫: 1 },
            productNameStripFromDisplay: "",
            manufacturerSplitCategory: "純正",
            sheetNamesByCategory: {},
            sheetManufacturerSortCategory: "猫",
            excelHeaderRow: []
        });
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ shippingRules: {} });

        await fs.writeFile(rankPath, JSON.stringify({ CRLF1: { A: 10 } }, null, 2), "utf-8");
        await fs.writeFile(
            productsPath,
            JSON.stringify(
                [{ productCode: "CRLF1", name: "n", manufacturer: "m", category: "猫", basePrice: 0 }],
                null,
                2
            ),
            "utf-8"
        );

        const { csv } = await priceService.getPricelistCsvForRank("A");
        expect(csv.startsWith("\uFEFF単独行ヘッダ\n")).toBe(true);
    });
});
