"use strict";

const { getRankPriceImportBuffer } = require("../../utils/rankPriceImportBuffer");

describe("getRankPriceImportBuffer", () => {
    test("files が無いとき ok false", () => {
        expect(getRankPriceImportBuffer({ files: null })).toEqual({ ok: false });
    });

    test("rankExcelFile のみ data が Buffer", () => {
        const buf = Buffer.from([1, 2, 3]);
        const r = getRankPriceImportBuffer({
            files: { rankExcelFile: { data: buf, name: "a.xlsx" } }
        });
        expect(r.ok).toBe(true);
        expect(r.fileBuffer.equals(buf)).toBe(true);
    });

    test("file のみ（field 名 file）", () => {
        const buf = Buffer.from("x");
        const r = getRankPriceImportBuffer({
            files: { file: { data: buf, name: "f.xlsx" } }
        });
        expect(r.ok).toBe(true);
        expect(r.fileBuffer.equals(buf)).toBe(true);
    });

    test("file のみで data が無いとき rankExcelFile||file の第2項を評価して空バッファ", () => {
        const r = getRankPriceImportBuffer({
            files: { file: { name: "nodata.xlsx" } }
        });
        expect(r.ok).toBe(true);
        expect(r.fileBuffer.length).toBe(0);
    });

    test("rankExcelFile が先で data が無いときは空バッファ（file に data があっても rank を優先）", () => {
        const r = getRankPriceImportBuffer({
            files: {
                rankExcelFile: { name: "empty.xlsx" },
                file: { data: Buffer.from([1, 2]), name: "has.xlsx" }
            }
        });
        expect(r.ok).toBe(true);
        expect(r.fileBuffer.length).toBe(0);
    });

    test("data が Buffer でないとき Buffer.from にフォールバック", () => {
        const r = getRankPriceImportBuffer({
            files: {
                rankExcelFile: { data: new Uint8Array([10, 20]), name: "x.xlsx" }
            }
        });
        expect(r.ok).toBe(true);
        expect(Buffer.isBuffer(r.fileBuffer)).toBe(true);
        expect(r.fileBuffer[0]).toBe(10);
    });

    test("data が undefined のとき Buffer.from([])", () => {
        const r = getRankPriceImportBuffer({
            files: {
                rankExcelFile: { name: "empty.xlsx" }
            }
        });
        expect(r.ok).toBe(true);
        expect(r.fileBuffer.length).toBe(0);
    });

    test("data が文字列のとき Buffer.from に渡す", () => {
        const r = getRankPriceImportBuffer({
            files: {
                rankExcelFile: { data: "AB", name: "s.xlsx" }
            }
        });
        expect(r.ok).toBe(true);
        expect(r.fileBuffer.toString()).toBe("AB");
    });
});
