/**
 * productService.getAllProducts の読込失敗分岐
 */
"use strict";

const fs = require("fs").promises;
const productService = require("../../services/productService");

describe("Aランク: productService getAllProducts エラー", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("products.json 読込失敗時は業務エラーを投げる", async () => {
        jest.spyOn(fs, "readFile").mockRejectedValueOnce(new Error("ENOENT"));
        await expect(productService.getAllProducts()).rejects.toThrow("商品データの読み込みに失敗しました");
    });
});
