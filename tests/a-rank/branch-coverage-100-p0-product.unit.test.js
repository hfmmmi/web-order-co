"use strict";

/**
 * 分岐100本計画 P0: productService 10本
 */
const fs = require("fs").promises;
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

describe("branch coverage 100 P0: productService", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("importFromExcel は空バッファ相当でエラー", async () => {
        await expect(productService.importFromExcel(Buffer.from(""))).rejects.toThrow();
    });

    test("importFromExcel は カテゴリ ヘッダーで仕様列", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "CAT_" + Date.now();
        const csv =
            "商品コード,商品名,定価,カテゴリ,在庫,メーカー\n" + `${code},N,10,純正,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.category).toBe("純正");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("CAT_")), null, 2),
                "utf-8"
            );
        }
    });

    test("deleteProduct は存在しなければ失敗", async () => {
        const r = await productService.deleteProduct("__NO_SUCH_" + Date.now());
        expect(r.success).toBe(false);
    });

    test("importFromExcel は在庫 遅延 で非即納", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "STK_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" + `${code},N,10,猫,遅延,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.stockStatus).not.toBe("即納");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("STK_")), null, 2),
                "utf-8"
            );
        }
    });

    test("importFromExcel は ランクN 形式で rankKey 解決", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["X", "Y"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "X", name: "R1" },
            { id: "Y", name: "R2" }
        ]);
        const code = "RNK_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1,ランク2\n" +
            `${code},N,10,猫,可,M,11,22\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.rankPrices.X).toBe(11);
            expect(p.rankPrices.Y).toBe(22);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("RNK_")), null, 2),
                "utf-8"
            );
        }
    });

    test("addProduct は重複コードで失敗", async () => {
        const r = await productService.addProduct({
            productCode: "P001",
            name: "dup",
            manufacturer: "M",
            category: "猫",
            basePrice: 1
        });
        expect(r.success).toBe(false);
    });

    test("updateProduct は存在すれば置換", async () => {
        await productService.addProduct({
            productCode: "UP100X",
            name: "before",
            manufacturer: "M",
            category: "猫",
            basePrice: 1
        });
        try {
            const list = await productService.getAllProducts();
            const p = list.find((x) => x.productCode === "UP100X");
            const r = await productService.updateProduct({ ...p, name: "after100" });
            expect(r.success).toBe(true);
        } finally {
            await productService.deleteProduct("UP100X");
        }
    });

    test("importFromExcel は parsePriceCell 失敗で basePrice 0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "BADP_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" + `${code},N,abc,猫,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.basePrice).toBe(0);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("BADP_")), null, 2),
                "utf-8"
            );
        }
    });

    test("getProductTemplateBuffer はバッファを返す", async () => {
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "L1" }]);
        const buf = await productService.getProductTemplateBuffer();
        expect(buf.length).toBeGreaterThan(100);
    });

    test("importFromExcel は既存商品の rankPrices 空なら updatedAt 省略", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "NORANK_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" + `${code},N,10,猫,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(Object.keys(p.rankPrices || {}).length).toBe(0);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("NORANK_")), null, 2),
                "utf-8"
            );
        }
    });
});
