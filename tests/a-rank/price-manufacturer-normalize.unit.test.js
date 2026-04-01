"use strict";

const { parsePriceCell, normalizeManufacturerKey } = require("../../services/priceManufacturerNormalize");

describe("priceManufacturerNormalize", () => {
    describe("parsePriceCell", () => {
        test("空・未定義・null は null", () => {
            expect(parsePriceCell("")).toBeNull();
            expect(parsePriceCell(undefined)).toBeNull();
            expect(parsePriceCell(null)).toBeNull();
        });

        test("負の数・非有限は null", () => {
            expect(parsePriceCell(-1)).toBeNull();
            expect(parsePriceCell(Number.NaN)).toBeNull();
            expect(parsePriceCell(Number.POSITIVE_INFINITY)).toBeNull();
        });

        test("上限超えは null", () => {
            expect(parsePriceCell(1_000_000_000)).toBeNull();
        });

        test("正常値は整数に丸める", () => {
            expect(parsePriceCell(100.6)).toBe(101);
            expect(parsePriceCell("42")).toBe(42);
            expect(parsePriceCell(999_999_999)).toBe(999_999_999);
        });
    });

    describe("normalizeManufacturerKey", () => {
        test("非文字列は空", () => {
            expect(normalizeManufacturerKey(null)).toBe("");
            expect(normalizeManufacturerKey(1)).toBe("");
        });

        test("空白のみは空", () => {
            expect(normalizeManufacturerKey("   ")).toBe("");
        });

        test("半角カタカナを全角にし大文字化", () => {
            expect(normalizeManufacturerKey(" ﾃｽﾄ ")).toBe("テスト");
        });

        test("全角英数字を半角にし大文字化", () => {
            expect(normalizeManufacturerKey("ａｂ１２")).toBe("AB12");
        });
    });
});
