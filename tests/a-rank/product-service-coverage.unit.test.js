"use strict";

const fs = require("fs").promises;
const productService = require("../../services/productService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

describe("productService 分岐カバレッジ", () => {
    test("addProduct は商品コード空で失敗", async () => {
        const r = await productService.addProduct({ productCode: "   ", name: "x" });
        expect(r.success).toBe(false);
        expect(r.message).toContain("必須");
    });

    test("addProduct は重複コードで失敗", async () => {
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        const list = JSON.parse(orig);
        const code = "PS_DUP_LOCK_" + Date.now();
        list.push({
            productCode: code,
            name: "tmp",
            manufacturer: "",
            category: "",
            basePrice: 0,
            stockStatus: "即納",
            active: true,
            rankPrices: {}
        });
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
        try {
            const r = await productService.addProduct({ productCode: code, name: "y" });
            expect(r.success).toBe(false);
        } finally {
            const after = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const filtered = after.filter((p) => p.productCode !== code);
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(filtered, null, 2), "utf-8");
        }
    });

    test("addProduct は active false と rankPrices を正規化して成功", async () => {
        const code = "PS_ACT_" + Date.now();
        try {
            const r = await productService.addProduct({
                productCode: code,
                name: "N",
                basePrice: 12.4,
                active: false,
                rankPrices: { A: 1 }
            });
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.active).toBe(false);
            expect(p.basePrice).toBe(12);
            expect(p.rankPricesUpdatedAt).toBeDefined();
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => p.productCode !== code), null, 2),
                "utf-8"
            );
        }
    });

    test("updateProduct / deleteProduct は存在しないコードで失敗", async () => {
        const u = await productService.updateProduct({ productCode: "__none__" });
        expect(u.success).toBe(false);
        const d = await productService.deleteProduct("__none__");
        expect(d.success).toBe(false);
    });

    test("importProductCsv は base64 文字列を受け付ける", async () => {
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" +
            "PS_B64_1,テスト,OPEN,純正,可,M\n";
        const b64 = Buffer.from(csv, "utf-8").toString("base64");
        try {
            const r = await productService.importProductCsv(b64);
            expect(r.success).toBe(true);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => p.productCode !== "PS_B64_1"), null, 2),
                "utf-8"
            );
        }
    });

    test("importFromExcel は 規格 ヘッダーとランク列フォールバックを処理する", async () => {
        const csv =
            "商品コード,商品名,定価,規格,在庫,メーカー,x,y,z\n" +
            "PS_SPEC_1,N1,100,再生,遅延,M,10,20,\n";
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            const r = await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            expect(r.success).toBe(true);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const filtered = list.filter((p) => !String(p.productCode).startsWith("PS_SPEC_"));
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(filtered, null, 2), "utf-8");
        }
    });

    test("getProductTemplateBuffer はバッファを返す", async () => {
        const buf = await productService.getProductTemplateBuffer();
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.length).toBeGreaterThan(20);
    });

    test("getProductMasterExportBuffer はバッファを返す", async () => {
        const buf = await productService.getProductMasterExportBuffer();
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.length).toBeGreaterThan(20);
    });
});
