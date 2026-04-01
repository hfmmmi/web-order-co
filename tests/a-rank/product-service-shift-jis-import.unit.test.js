"use strict";

const iconv = require("iconv-lite");
const fs = require("fs").promises;
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

describe("productService importFromExcel Shift_JIS CSV", () => {
    let orig;

    beforeAll(async () => {
        orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
    });

    test("Shift_JIS の CSV（BOM なし）を取り込める", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "SJIS_" + Date.now();
        const line = `商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n${code},名,200,猫,可,M,33\n`;
        const buf = iconv.encode(line, "Shift_JIS");
        try {
            await productService.importFromExcel(buf);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p).toBeDefined();
            expect(p.rankPrices.A).toBe(33);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => p.productCode !== code), null, 2),
                "utf-8"
            );
            jest.restoreAllMocks();
        }
    });
});
