"use strict";

jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn()
}));

const settingsService = require("../../services/settingsService");
const productService = require("../../services/productService");
const { dbPath } = require("../../dbPaths");
const fs = require("fs").promises;
const iconv = require("iconv-lite");

const PRODUCTS_DB_PATH = dbPath("products.json");

describe("productService importFromExcel CSV 経路（非 PK バッファ）", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        settingsService.getRankIds.mockResolvedValue(["A", "B", "C"]);
        settingsService.getRankList.mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" },
            { id: "C", name: "ランク3" }
        ]);
    });

    test("Shift_JIS CSV で商品を取り込む（parseCsvToRowArrays 経路）", async () => {
        const header = "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1";
        const row = "CSV-PROD-1,CSV名,200,純正,可,MakerX,80";
        const buf = iconv.encode(`${header}\n${row}`, "Shift_JIS");
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            await fs.writeFile(PRODUCTS_DB_PATH, "[]", "utf-8");
            const r = await productService.importFromExcel(buf);
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === "CSV-PROD-1");
            expect(p).toBeDefined();
            expect(p.basePrice).toBe(200);
            expect(p.rankPrices.A).toBe(80);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
        }
    });
});
