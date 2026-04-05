"use strict";

const fs = require("fs").promises;
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const priceService = require("../../services/priceService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

describe("productService getProductMasterExportBuffer 分岐", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("商品側 rank が新しいとき useProduct で rankFromProduct をマージ優先", async () => {
        const code = "XEXP_" + Date.now();
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        jest.spyOn(priceService, "getRankPrices").mockResolvedValue({ [code]: { A: 111 } });
        jest.spyOn(priceService, "getRankPricesUpdatedAt").mockResolvedValue({ [code]: 100 });
        const origP = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            const list = JSON.parse(origP);
            list.push({
                productCode: code,
                name: "E",
                manufacturer: "",
                category: "猫",
                basePrice: 100,
                stockStatus: "即納",
                active: true,
                rankPrices: { A: 999 },
                rankPricesUpdatedAt: 500
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
            const buf = await productService.getProductMasterExportBuffer();
            const ExcelJS = require("../../utils/excelReader").ExcelJS;
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const sheet = wb.getWorksheet(1);
            let row = null;
            sheet.eachRow((rr, n) => {
                if (n === 1) return;
                if (String(rr.getCell(1).value) === code) row = rr;
            });
            expect(row.getCell(7).value).toBe(999);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, origP, "utf-8");
        }
    });

    test("テーブル側の更新が新しいとき rankPriceMap のみを採用", async () => {
        const code = "XTBL_" + Date.now();
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        jest.spyOn(priceService, "getRankPrices").mockResolvedValue({ [code]: { A: 222 } });
        jest.spyOn(priceService, "getRankPricesUpdatedAt").mockResolvedValue({ [code]: 1000 });
        const origP = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            const list = JSON.parse(origP);
            list.push({
                productCode: code,
                name: "T",
                manufacturer: "",
                category: "猫",
                basePrice: 50,
                stockStatus: "手配中",
                active: true,
                rankPrices: { A: 1 },
                rankPricesUpdatedAt: 100
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
            const buf = await productService.getProductMasterExportBuffer();
            const ExcelJS = require("../../utils/excelReader").ExcelJS;
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const sheet = wb.getWorksheet(1);
            let found = null;
            sheet.eachRow((row, n) => {
                if (n === 1) return;
                if (String(row.getCell(1).value) === code) found = row;
            });
            expect(found).toBeTruthy();
            expect(found.getCell(7).value).toBe(222);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, origP, "utf-8");
        }
    });

    test("マージ済みランク値が負・非有限・上限超えのときセルは空", async () => {
        const code = "XV_" + Date.now();
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "R1" },
            { id: "B", name: "R2" },
            { id: "C", name: "R3" }
        ]);
        jest.spyOn(priceService, "getRankPrices").mockResolvedValue({
            [code]: { A: -1, B: Number.NaN, C: 2000000000 }
        });
        jest.spyOn(priceService, "getRankPricesUpdatedAt").mockResolvedValue({ [code]: 0 });
        const origP = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            const list = JSON.parse(origP);
            list.push({
                productCode: code,
                name: "V",
                manufacturer: "",
                category: "猫",
                basePrice: 1,
                stockStatus: "即納",
                active: true,
                rankPrices: {},
                rankPricesUpdatedAt: 0
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
            const buf = await productService.getProductMasterExportBuffer();
            const ExcelJS = require("../../utils/excelReader").ExcelJS;
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const sheet = wb.getWorksheet(1);
            let r = null;
            sheet.eachRow((row, n) => {
                if (n === 1) return;
                if (String(row.getCell(1).value) === code) r = row;
            });
            expect(r.getCell(7).value).toBe("");
            expect(r.getCell(8).value).toBe("");
            expect(r.getCell(9).value).toBe("");
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, origP, "utf-8");
        }
    });

    test("rankPricesUpdatedAt が非有限のときテーブル優先分岐", async () => {
        const code = "XNF_" + Date.now();
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        jest.spyOn(priceService, "getRankPrices").mockResolvedValue({ [code]: { A: 55 } });
        jest.spyOn(priceService, "getRankPricesUpdatedAt").mockResolvedValue({ [code]: 300 });
        const origP = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            const list = JSON.parse(origP);
            list.push({
                productCode: code,
                name: "N",
                manufacturer: "",
                category: "猫",
                basePrice: 1,
                stockStatus: "即納",
                active: true,
                rankPrices: { A: 77 },
                rankPricesUpdatedAt: Number.NaN
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
            const buf = await productService.getProductMasterExportBuffer();
            const ExcelJS = require("../../utils/excelReader").ExcelJS;
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const sheet = wb.getWorksheet(1);
            let row = null;
            sheet.eachRow((rr, n) => {
                if (n === 1) return;
                if (String(rr.getCell(1).value) === code) row = rr;
            });
            expect(row.getCell(7).value).toBe(55);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, origP, "utf-8");
        }
    });
});
