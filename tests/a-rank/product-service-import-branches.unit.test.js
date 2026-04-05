"use strict";

const fs = require("fs").promises;
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

describe("productService importFromExcel 追加分岐", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("ヘッダーにランクID直書き列で rankPrices を取り込む", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B", "C"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" },
            { id: "C", name: "ランク3" }
        ]);
        const code = "PIB_RA_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,A,B\n" +
            `${code},N,100,再生,可,M,7,8\n`;
        try {
            const r = await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(7);
            expect(p.rankPrices.B).toBe(8);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("表示名ランク列（rankList）で rankKey を解決", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "特別価格" },
            { id: "B", name: "通常" }
        ]);
        const code = "PIB_DN_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,特別価格\n" +
            `${code},N,50,猫,遅延,M,99\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(99);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("既存商品を更新し importedName null（#NAME?）では name を変えない", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_NN_" + Date.now();
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            let list = JSON.parse(orig);
            list.push({
                productCode: code,
                name: "保持名",
                manufacturer: "M",
                category: "猫",
                basePrice: 1,
                stockStatus: "即納",
                active: true,
                rankPrices: {}
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
            const csv =
                "商品コード,商品名,定価,仕様,在庫,メーカー\n" +
                `${code},#NAME?,200,猫,可,M\n`;
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.name).toBe("保持名");
            expect(p.basePrice).toBe(200);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("定価に OPEN を含むと basePrice 0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_OP_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" +
            `${code},N,OPEN価格,猫,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((x) => x.productCode === code).basePrice).toBe(0);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("在庫が 可 のとき stockStatus 即納", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_ST_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" +
            `${code},N,1,猫,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((x) => x.productCode === code).stockStatus).toBe("即納");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("仕様列ヘッダが 規格 のとき category に取り込む", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_KIK_" + Date.now();
        const csv =
            "商品コード,商品名,定価,規格,在庫,メーカー\n" +
            `${code},N,10,再生品,手配中,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((x) => x.productCode === code).category).toBe("再生品");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("仕様列ヘッダが カテゴリ のとき category に取り込む", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_CAT_" + Date.now();
        const csv =
            "商品コード,商品名,定価,カテゴリ,在庫,メーカー\n" +
            `${code},N,10,海外純正,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((x) => x.productCode === code).category).toBe("海外純正");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("ランク列ヘッダが無いとき 6列目以降を rankIds 順で割当", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" }
        ]);
        const code = "PIB_FB_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,extra1,extra2\n" +
            `${code},N,5,猫,可,M,11,22\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(11);
            expect(p.rankPrices.B).toBe(22);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("importProductCsv は base64 文字列をデコードして取り込む", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_B64_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" +
            `${code},B64品,3,猫,可,M\n`;
        const b64 = Buffer.from(csv, "utf-8").toString("base64");
        try {
            const r = await productService.importProductCsv(b64);
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.some((x) => x.productCode === code)).toBe(true);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("CSV が UTF-8 BOM 付きでも取り込める", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "PIB_UTF_" + Date.now();
        const body =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" + `${code},U,2,猫,可,M\n`;
        const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf-8")]);
        try {
            await productService.importFromExcel(buf);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((x) => x.productCode === code).name).toBe("U");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });

    test("ランクヘッダ ランクZ が rankIds に無いときその列は無視", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ランク1" },
            { id: "B", name: "ランク2" }
        ]);
        const code = "PIB_Z_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1,ランクZ,ランク2\n" +
            `${code},N,1,猫,可,M,10,99,20\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(10);
            expect(p.rankPrices.B).toBe(20);
            expect(p.rankPrices.Z).toBeUndefined();
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("PIB_")), null, 2),
                "utf-8"
            );
        }
    });
});
