"use strict";

const productService = require("../../services/productService");

describe("productService deleteProduct", () => {
    test("存在しない productCode は success false", async () => {
        const r = await productService.deleteProduct("__NO_SUCH_PRODUCT_CODE__");
        expect(r.success).toBe(false);
        expect(String(r.message || "")).toContain("見つかりません");
    });
});
