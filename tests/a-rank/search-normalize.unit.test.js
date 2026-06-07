const { normalizeSearchKey } = require("../../utils/searchNormalize");

describe("searchNormalize", () => {
    test("半角・全角・大文字小文字を同一視する", () => {
        expect(normalizeSearchKey("Ｃ８２０")).toBe(normalizeSearchKey("c820"));
        expect(normalizeSearchKey("C820")).toBe("c820");
    });

    test("ひらがなとカタカナを同一視する", () => {
        expect(normalizeSearchKey("まねじ")).toBe(normalizeSearchKey("マネジ"));
        expect(normalizeSearchKey("ひふみ")).toBe(normalizeSearchKey("ヒフミ"));
    });

    test("空白は除去して比較する", () => {
        expect(normalizeSearchKey("c 820")).toBe(normalizeSearchKey("c820"));
    });
});
