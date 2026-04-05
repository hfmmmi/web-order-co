"use strict";

const pricesRoutes = require("../../routes/admin/pricesRoutes");

describe("pricesRoutes.normalizeDownloadRankParam", () => {
    test("null / undefined は A にフォールバック", () => {
        expect(pricesRoutes.normalizeDownloadRankParam(null)).toBe("A");
        expect(pricesRoutes.normalizeDownloadRankParam(undefined)).toBe("A");
    });

    test("英字を抽出して大文字化", () => {
        expect(pricesRoutes.normalizeDownloadRankParam("b2")).toBe("B");
    });
});
