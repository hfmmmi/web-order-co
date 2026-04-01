"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

jest.mock("../../services/settingsService", () => ({
    getRankIds: jest.fn(),
    getRankList: jest.fn()
}));

const { readToRowArrays } = require("../../utils/excelReader");
const settingsService = require("../../services/settingsService");
const productService = require("../../services/productService");
const { dbPath } = require("../../dbPaths");
const fs = require("fs").promises;

const PRODUCTS_DB_PATH = dbPath("products.json");

/** productService は先頭 PK のバッファのみ Excel として readToRowArrays に渡す */
function fakeXlsxBuffer() {
    return Buffer.from([0x50, 0x4b, 0x03, 0x04]);
}

describe("productService importFromExcel ランク列・定価分岐", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        settingsService.getRankIds.mockResolvedValue(["A", "B", "C"]);
        settingsService.getRankList.mockResolvedValue([
            { id: "A", name: "ゴールド" },
            { id: "B", name: "シルバー" },
            { id: "C", name: "ブロンズ" }
        ]);
    });

    test("定価 OPEN で basePrice 0", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "定価", "仕様", "在庫", "メーカー", "ゴールド"],
            ["PX_OPEN", "N", "OPEN", "純正", "可", "M", "100"]
        ]);
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            await fs.writeFile(PRODUCTS_DB_PATH, "[]", "utf-8");
            const r = await productService.importFromExcel(fakeXlsxBuffer());
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === "PX_OPEN");
            expect(p.basePrice).toBe(0);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
        }
    });

    test("ランク列ラベル ランクB で列解決", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "定価", "仕様", "在庫", "メーカー", "ランクB"],
            ["PX_RB", "N", "100", "純正", "可", "M", "200"]
        ]);
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            await fs.writeFile(PRODUCTS_DB_PATH, "[]", "utf-8");
            const r = await productService.importFromExcel(fakeXlsxBuffer());
            expect(r.success).toBe(true);
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === "PX_RB");
            expect(p.rankPrices.B).toBe(200);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
        }
    });

    test("ランク列を表示名（ゴールド）で解決", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "定価", "仕様", "在庫", "メーカー", "ゴールド"],
            ["PX_DN", "N", "50", "純正", "遅延", "M", "300"]
        ]);
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            await fs.writeFile(PRODUCTS_DB_PATH, "[]", "utf-8");
            await productService.importFromExcel(fakeXlsxBuffer());
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            const p = list.find((x) => x.productCode === "PX_DN");
            expect(p.rankPrices.A).toBe(300);
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
        }
    });

    test("在庫列が「可」なら即納に正規化", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "定価", "仕様", "在庫", "メーカー"],
            ["PX_ST", "N", "100", "純正", "可", "M"]
        ]);
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            await fs.writeFile(PRODUCTS_DB_PATH, "[]", "utf-8");
            await productService.importFromExcel(fakeXlsxBuffer());
            const list = JSON.parse(await fs.readFile(PRODUCTS_DB_PATH, "utf-8"));
            expect(list[0].stockStatus).toBe("即納");
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
        }
    });

    test("既存商品は更新分岐（名前 sanitize）", async () => {
        readToRowArrays.mockResolvedValue([
            ["商品コード", "商品名", "定価", "仕様", "在庫", "メーカー", "ゴールド"],
            ["P001", "改名テスト", "1200", "純正", "可", "TestMaker", "999"]
        ]);
        const orig = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        try {
            await productService.importFromExcel(fakeXlsxBuffer());
            const r = await productService.importFromExcel(fakeXlsxBuffer());
            expect(r.message).toContain("更新");
        } finally {
            await fs.writeFile(PRODUCTS_DB_PATH, orig, "utf-8");
        }
    });
});
