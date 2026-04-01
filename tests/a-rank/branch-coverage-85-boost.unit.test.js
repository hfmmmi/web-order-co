"use strict";

/**
 * 分岐カバレッジ 85% 向け: productService の取込・エクスポートの未踏分岐を集中的に通す
 */
jest.mock("../../services/priceService", () => ({
    getRankPrices: jest.fn(),
    getRankPricesUpdatedAt: jest.fn()
}));

const ExcelJS = require("exceljs");
const fs = require("fs").promises;
const priceService = require("../../services/priceService");
const productService = require("../../services/productService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const PRODUCTS_DB_PATH = dbPath("products.json");

function headerNameToCol(sheet) {
    const m = {};
    sheet.getRow(1).eachCell((cell, colNumber) => {
        m[String(cell.value ?? "").trim()] = colNumber;
    });
    return m;
}

async function rowValuesForProductCode(buffer, productCode) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet("商品マスタ");
    const header = headerNameToCol(sheet);
    for (let r = 2; r <= sheet.rowCount; r++) {
        const v = sheet.getRow(r).getCell(1).value;
        if (String(v ?? "").trim() === String(productCode).trim()) {
            const out = [];
            sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
                out[colNumber] = cell.value;
            });
            return { out, header };
        }
    }
    return { out: null, header };
}

function colForRank(header, rankList, id) {
    const name = (rankList || []).find((r) => r.id === id)?.name;
    if (!name) return -1;
    return header[String(name).trim()] ?? -1;
}

describe("branch boost: productService export (priceService mock)", () => {
    let origProducts;

    beforeAll(async () => {
        origProducts = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(PRODUCTS_DB_PATH, origProducts, "utf-8");
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("useProduct が true のとき商品 rankPrices がテーブルより優先される", async () => {
        priceService.getRankPrices.mockResolvedValue({ UB1: { A: 10, B: 20 } });
        priceService.getRankPricesUpdatedAt.mockResolvedValue({ UB1: 100 });
        const list = JSON.parse(origProducts).filter((p) => p.productCode !== "UB1");
        list.push({
            productCode: "UB1",
            name: "名前",
            manufacturer: "M",
            category: "猫",
            basePrice: 400,
            stockStatus: "遅延",
            rankPrices: { A: 999 },
            rankPricesUpdatedAt: 500
        });
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");

        const rankList = await settingsService.getRankList();
        const buf = await productService.getProductMasterExportBuffer();
        const { out: vals, header } = await rowValuesForProductCode(buf, "UB1");
        expect(vals).not.toBeNull();
        const cA = colForRank(header, rankList, "A");
        expect(cA).toBeGreaterThan(0);
        expect(vals[cA]).toBe(999);
    });

    test("useProduct が false のとき rank 価格はテーブルのみ（商品側より新しいテーブル日時）", async () => {
        priceService.getRankPrices.mockResolvedValue({ UB2: { A: 777 } });
        priceService.getRankPricesUpdatedAt.mockResolvedValue({ UB2: 900 });
        const list = JSON.parse(origProducts).filter((p) => p.productCode !== "UB2");
        list.push({
            productCode: "UB2",
            name: "N",
            manufacturer: "M",
            category: "猫",
            basePrice: 100,
            stockStatus: "即納",
            rankPrices: { A: 1 },
            rankPricesUpdatedAt: 100
        });
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");

        const rankList = await settingsService.getRankList();
        const buf = await productService.getProductMasterExportBuffer();
        const { out: vals, header } = await rowValuesForProductCode(buf, "UB2");
        expect(vals).not.toBeNull();
        const cA = colForRank(header, rankList, "A");
        expect(vals[cA]).toBe(777);
    });

    test("ランク価格が上限超え・負数・非有限は空セルになる", async () => {
        priceService.getRankPrices.mockResolvedValue({
            UB3: { A: 1000000000000, B: -5, C: Number.NaN }
        });
        priceService.getRankPricesUpdatedAt.mockResolvedValue({});
        const list = JSON.parse(origProducts).filter((p) => p.productCode !== "UB3");
        list.push({
            productCode: "UB3",
            name: "N",
            manufacturer: "M",
            category: "猫",
            basePrice: 1,
            stockStatus: "即納",
            rankPrices: {},
            rankPricesUpdatedAt: 0
        });
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");

        const rankList = await settingsService.getRankList();
        const buf = await productService.getProductMasterExportBuffer();
        const { out: vals, header } = await rowValuesForProductCode(buf, "UB3");
        expect(vals).not.toBeNull();
        for (const id of ["A", "B", "C"]) {
            const c = colForRank(header, rankList, id);
            if (c > 0) expect(vals[c] === "" || vals[c] == null).toBe(true);
        }
    });

    test("basePrice 0 は OPEN、即納以外の在庫はそのまま文字列化", async () => {
        priceService.getRankPrices.mockResolvedValue({});
        priceService.getRankPricesUpdatedAt.mockResolvedValue({});
        const list = JSON.parse(origProducts).filter((p) => !String(p.productCode).startsWith("UB4"));
        list.push({
            productCode: "UB4_ST",
            name: "S",
            manufacturer: "M",
            category: "仕様",
            basePrice: 0,
            stockStatus: "入荷待ち",
            rankPrices: {},
            rankPricesUpdatedAt: 0
        });
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");

        const buf = await productService.getProductMasterExportBuffer();
        const { out: vals, header } = await rowValuesForProductCode(buf, "UB4_ST");
        expect(vals).not.toBeNull();
        expect(vals[header["定価"]]).toBe("OPEN");
        expect(vals[header["在庫"]]).toBe("入荷待ち");
    });
});

describe("branch boost: productService importFromExcel CSV エッジ", () => {
    let origProducts;

    beforeAll(async () => {
        origProducts = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(PRODUCTS_DB_PATH, origProducts, "utf-8");
    });

    test("UTF-8 BOM 付き CSV でも取り込める", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "BOM_" + Date.now();
        const body = `商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n${code},,100,猫,可,M,50\n`;
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        try {
            await productService.importFromExcel(Buffer.concat([bom, Buffer.from(body, "utf-8")]));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === code);
            expect(p.name).toBe(code);
            expect(p.rankPrices.A).toBe(50);
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

    test("定価が数値化できない場合は basePrice 0", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        const code = "BADP_" + Date.now();
        const csv =
            "商品コード,商品名,定価,仕様,在庫,メーカー,ランク1\n" + `${code},N,価格不明,猫,可,M,\n`;
        try {
            await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((x) => x.productCode === code).basePrice).toBe(0);
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

    test("空バッファはデータなしエラー", async () => {
        jest.spyOn(settingsService, "getRankIds").mockResolvedValue(["A"]);
        jest.spyOn(settingsService, "getRankList").mockResolvedValue([{ id: "A", name: "ランク1" }]);
        await expect(productService.importFromExcel(Buffer.alloc(0))).rejects.toThrow("データがありません");
        jest.restoreAllMocks();
    });

    test("addProduct は basePrice 負数を 0 に丸める", async () => {
        const code = "NEG_" + Date.now();
        try {
            const r = await productService.addProduct({ productCode: code, name: "n", basePrice: -9 });
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list.find((p) => p.productCode === code).basePrice).toBe(0);
        } finally {
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            await fs.writeFile(
                PRODUCTS_DB_PATH,
                JSON.stringify(list.filter((p) => p.productCode !== code), null, 2),
                "utf-8"
            );
        }
    });
});
