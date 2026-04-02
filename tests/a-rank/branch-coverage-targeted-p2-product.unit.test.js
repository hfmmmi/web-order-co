"use strict";

const fs = require("fs").promises;
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

async function cleanupByPrefix(prefix) {
    const raw = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
    const list = JSON.parse(raw);
    await fs.writeFile(
        PRODUCTS_DB_PATH,
        JSON.stringify(list.filter((p) => !String(p.productCode).startsWith(prefix)), null, 2),
        "utf-8"
    );
}

describe("branch-coverage-targeted-p2: productService", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("addProduct: 商品コード空は失敗", async () => {
        const r = await productService.addProduct({ productCode: "   ", name: "x" });
        expect(r.success).toBe(false);
    });

    test("addProduct: 重複コードは失敗", async () => {
        const code = "P_DUP_" + Date.now();
        const first = await productService.addProduct({ productCode: code, name: "first" });
        expect(first.success).toBe(true);
        const r = await productService.addProduct({ productCode: code, name: "dup" });
        expect(r.success).toBe(false);
        await cleanupByPrefix("P_DUP_");
    });

    test("addProduct: 名前空はコードを名前に", async () => {
        const code = "P2_NM_" + Date.now();
        try {
            const r = await productService.addProduct({ productCode: code, name: "" });
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((p) => p.productCode === code).name).toBe(code);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("addProduct: rankPrices ありで rankPricesUpdatedAt", async () => {
        const code = "P2_RP_" + Date.now();
        try {
            await productService.addProduct({
                productCode: code,
                name: "n",
                rankPrices: { A: 1 }
            });
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.rankPricesUpdatedAt).toBeTruthy();
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("addProduct: basePrice 非数は0", async () => {
        const code = "P2_BP_" + Date.now();
        try {
            await productService.addProduct({ productCode: code, name: "n", basePrice: NaN });
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.basePrice).toBe(0);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("addProduct: stockStatus 空は即納", async () => {
        const code = "P2_ST_" + Date.now();
        try {
            await productService.addProduct({ productCode: code, name: "n", stockStatus: "  " });
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.stockStatus).toBe("即納");
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("addProduct: active false", async () => {
        const code = "P2_AC_" + Date.now();
        try {
            await productService.addProduct({ productCode: code, name: "n", active: false });
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.active).toBe(false);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("updateProduct: 存在しないコード", async () => {
        const r = await productService.updateProduct({ productCode: "P2_NOPE", name: "x" });
        expect(r.success).toBe(false);
    });

    test("updateProduct: 成功", async () => {
        const code = "P2_UP_" + Date.now();
        try {
            await productService.addProduct({ productCode: code, name: "old" });
            const r = await productService.updateProduct({
                productCode: code,
                name: "new",
                manufacturer: "M",
                category: "猫",
                basePrice: 10,
                stockStatus: "遅延",
                active: true,
                rankPrices: {}
            });
            expect(r.success).toBe(true);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("deleteProduct: 無いコード", async () => {
        const r = await productService.deleteProduct("P2_DEL_NONE");
        expect(r.success).toBe(false);
    });

    test("deleteProduct: 成功", async () => {
        const code = "P2_DEL_" + Date.now();
        try {
            await productService.addProduct({ productCode: code, name: "n" });
            const r = await productService.deleteProduct(code);
            expect(r.success).toBe(true);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: 空は例外", async () => {
        await expect(productService.importFromExcel(Buffer.alloc(0))).rejects.toThrow();
    });

    test("importFromExcel: 商品コード列なしは例外", async () => {
        const csv = "foo,bar\n1,2\n";
        await expect(productService.importFromExcel(Buffer.from(csv, "utf-8"))).rejects.toThrow();
    });

    test("importFromExcel: 規格 ヘッダでカテゴリ列", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_KIK_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,規格,在庫,メーカー,ランク1\n" +
                `${code},N,10,仕様値,可,M,5\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.category).toBe("仕様値");
            expect(p.stockStatus).toBe("即納");
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: カテゴリ ヘッダ", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_CAT_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,カテゴリ,在庫,メーカー,ランク1\n" +
                `${code},N,1,汎用,遅延,M,2\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.category).toBe("汎用");
            expect(p.stockStatus).toBe("遅延");
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: OPEN 定価0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_OPN_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n" +
                `${code},N,open価格,猫,可,M,1\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.basePrice).toBe(0);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: ランク列無しで位置フォールバック", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" }
        ]);
        const code = "P2_FB_" + Date.now();
        try {
            const csv = "商品コード,商品名,定価,仕様,在庫,メーカー,7,8\n" + `${code},N,1,猫,可,M,7,8\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(7);
            expect(p.rankPrices.B).toBe(8);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: 新規で sanitize null はコードを名前に", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_SN_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n" +
                `${code},#NAME?,1,猫,可,M,1\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.name).toBe(code);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: 既存更新で rank 空オブジェクトは rank 不更新", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_NR_" + Date.now();
        try {
            let list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            list.push({
                productCode: code,
                name: "old",
                manufacturer: "M",
                category: "猫",
                basePrice: 1,
                stockStatus: "即納",
                rankPrices: { A: 99 },
                rankPricesUpdatedAt: 1
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n" +
                `${code},ValidName,2,猫,可,M,\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(99);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importProductCsv: base64 文字列", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_B64_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n" + `${code},N,1,猫,可,M,3\n`;
            const b64 = Buffer.from(csv, "utf-8").toString("base64");
            await productService.importProductCsv(b64);
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p).toBeTruthy();
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("getProductTemplateBuffer: バッファ返却", async () => {
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const buf = await productService.getProductTemplateBuffer();
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.length).toBeGreaterThan(50);
    });

    test("importFromExcel: 定価列無しは basePrice 0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_NP_" + Date.now();
        try {
            const csv = "商品コード,商品名,仕様,在庫,メーカー,ランク1\n" + `${code},N,猫,可,M,1\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.basePrice).toBe(0);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: 無効価格文字は basePrice 0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "P2_IV_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n" +
                `${code},N,abc,猫,可,M,1\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.basePrice).toBe(0);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: ランク数値パターン ランク2", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" }
        ]);
        const code = "P2_R2_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランク2\n" + `${code},N,1,猫,可,M,44\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.rankPrices.B).toBe(44);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: ランクA 英字ヘッダ", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" }
        ]);
        const code = "P2_LA_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,ランクA\n" + `${code},N,1,猫,可,M,15\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(15);
        } finally {
            await cleanupByPrefix("P2_");
        }
    });

    test("importFromExcel: byDisplayName id が rankIds に無い列は無視", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "Z", name: "幽霊ランク" },
            { id: "A", name: "ランク1" }
        ]);
        const code = "P2_IGN_" + Date.now();
        try {
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー,幽霊ランク,ランク1\n" +
                `${code},N,1,猫,可,M,9,3\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const p = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8")).find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(3);
            expect(p.rankPrices.Z).toBeUndefined();
        } finally {
            await cleanupByPrefix("P2_");
        }
    });
});
