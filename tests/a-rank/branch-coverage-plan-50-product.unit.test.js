"use strict";

/**
 * 分岐50本計画: productService 8 本（importFromExcel / getProductMasterExportBuffer / importProductCsv）
 */
const fs = require("fs").promises;
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");
const RANK_PATH = dbPath("rank_prices.json");
const RANK_AT_PATH = dbPath("rank_prices_updated_at.json");

describe("branch coverage plan 50: productService", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("importProductCsv は Base64 文字列から取り込める", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "B64_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" + `${code},N,10,猫,可,M\n`;
        const b64 = Buffer.from(csv, "utf-8").toString("base64");
        try {
            const r = await productService.importProductCsv(b64);
            expect(r.success).toBe(true);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("B64_")), null, 2),
                "utf-8"
            );
        }
    });

    test("importFromExcel は 規格 ヘッダーでカテゴリ列として解決", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "KIK_" + Date.now();
        const csv =
            "商品コード,商品名,定価,規格,在庫,メーカー\n" + `${code},N,10,海外純正,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.category).toBe("海外純正");
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("KIK_")), null, 2),
                "utf-8"
            );
        }
    });

    test("importFromExcel は定価 OPEN で basePrice 0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "OPN_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー\n" + `${code},N,OPEN,猫,可,M\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.basePrice).toBe(0);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("OPN_")), null, 2),
                "utf-8"
            );
        }
    });

    test("importFromExcel はランク列ゼロでも 6 列目以降を rankIds 順に割当", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A", "B"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "R1" },
            { id: "B", name: "R2" }
        ]);
        const code = "IDX_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,99,88\n" + `${code},N,100,猫,可,M,7,9\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.rankPrices.A).toBe(7);
            expect(p.rankPrices.B).toBe(9);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => !String(p.productCode).startsWith("IDX_")), null, 2),
                "utf-8"
            );
        }
    });

    test("getProductMasterExportBuffer は商品側 rankPricesUpdatedAt が新しいときマスタを優先", async () => {
        const origRank = await fs.readFile(RANK_PATH, "utf-8");
        const origAt = await fs.readFile(RANK_AT_PATH, "utf-8").catch(() => "{}");
        const code = "MEXP_" + Date.now();
        const now = Date.now();
        try {
            const products = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            products.push({
                productCode: code,
                name: "E",
                manufacturer: "M",
                category: "猫",
                basePrice: 100,
                stockStatus: "即納",
                active: true,
                rankPrices: { A: 777 },
                rankPricesUpdatedAt: now + 999999
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(products, null, 2), "utf-8");
            const rm = JSON.parse(origRank);
            rm[code] = { A: 1 };
            await fs.writeFile(RANK_PATH, JSON.stringify(rm, null, 2), "utf-8");
            const at = JSON.parse(origAt);
            at[code] = now;
            await fs.writeFile(RANK_AT_PATH, JSON.stringify(at, null, 2), "utf-8");

            const buf = await productService.getProductMasterExportBuffer();
            expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBe(true);
            const ExcelJS = require("exceljs");
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const sheet = wb.worksheets[0];
            let saw = false;
            sheet.eachRow((row) => {
                if (String(row.getCell(1).value) === code) {
                    for (let c = 1; c <= row.cellCount; c++) {
                        if (row.getCell(c).value === 777) saw = true;
                    }
                }
            });
            expect(saw).toBe(true);
        } finally {
            let products = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            products = products.filter((p) => p.productCode !== code);
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(products, null, 2), "utf-8");
            await fs.writeFile(RANK_PATH, origRank, "utf-8");
            await fs.writeFile(RANK_AT_PATH, origAt, "utf-8");
        }
    });

    test("getProductMasterExportBuffer はランク価格が上限超えの列は空文字", async () => {
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "BIGP_" + Date.now();
        const origRank = await fs.readFile(RANK_PATH, "utf-8");
        try {
            const products = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            products.push({
                productCode: code,
                name: "B",
                manufacturer: "M",
                category: "猫",
                basePrice: 1,
                stockStatus: "即納",
                active: true,
                rankPrices: { A: 1e12 },
                rankPricesUpdatedAt: Date.now()
            });
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(products, null, 2), "utf-8");
            const buf = await productService.getProductMasterExportBuffer();
            const ExcelJS = require("exceljs");
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            const sheet = wb.worksheets[0];
            let found = false;
            sheet.eachRow((row, n) => {
                if (n >= 2 && row.getCell(1).value === code) {
                    const last = row.cellCount;
                    const v = row.getCell(last).value;
                    if (v === "" || v == null) found = true;
                }
            });
            expect(found).toBe(true);
        } finally {
            jest.restoreAllMocks();
            let products = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            products = products.filter((p) => p.productCode !== code);
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(products, null, 2), "utf-8");
            await fs.writeFile(RANK_PATH, origRank, "utf-8");
        }
    });

    test("addProduct は新規コードをマスタに追加", async () => {
        const code = "ADDP_" + Date.now();
        try {
            const r = await productService.addProduct({
                productCode: code,
                name: "追加品",
                manufacturer: "M",
                category: "猫",
                basePrice: 50,
                stockStatus: "即納"
            });
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.some((p) => p.productCode === code)).toBe(true);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => p.productCode !== code), null, 2),
                "utf-8"
            );
        }
    });

    test("getProductTemplateBuffer はランク列ヘッダに表示名を使う", async () => {
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([
            { id: "A", name: "ゴールド表示" },
            { id: "B", name: "銀" }
        ]);
        const buf = await productService.getProductTemplateBuffer();
        const ExcelJS = require("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const row1 = wb.worksheets[0].getRow(1).values;
        const joined = row1.join(",");
        expect(joined).toContain("ゴールド表示");
    });
});
