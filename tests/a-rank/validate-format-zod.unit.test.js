"use strict";

const { formatZodErrors } = require("../../middlewares/validate");

describe("formatZodErrors", () => {
    test("通常 issue は path と message を返す", () => {
        const rows = formatZodErrors(
            [{ path: ["a", "b"], message: "bad", code: "invalid_type" }],
            "body"
        );
        expect(rows[0].path).toBe("a.b");
        expect(rows[0].message).toBe("bad");
    });

    test("path 空のとき pathPrefix を使う", () => {
        const rows = formatZodErrors([{ path: [], message: "root", code: "custom" }], "query");
        expect(rows[0].path).toBe("query");
    });

    test("unrecognized_keys で keys を展開（basePath が prefix と同じ）", () => {
        const rows = formatZodErrors(
            [
                {
                    code: "unrecognized_keys",
                    keys: ["extra1", "extra2"],
                    path: []
                }
            ],
            "body"
        );
        expect(rows.map((r) => r.path)).toEqual(["extra1", "extra2"]);
        expect(rows.every((r) => r.message === "未定義の項目です")).toBe(true);
    });

    test("unrecognized_keys でネスト path 付き", () => {
        const rows = formatZodErrors(
            [
                {
                    code: "unrecognized_keys",
                    keys: ["x"],
                    path: ["nested"]
                }
            ],
            "body"
        );
        expect(rows[0].path).toBe("nested.x");
    });

    test("unrecognized_keys だが keys が空なら通常行として処理", () => {
        const rows = formatZodErrors(
            [{ code: "unrecognized_keys", keys: [], path: [], message: "mk" }],
            "body"
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].path).toBe("body");
        expect(rows[0].message).toBe("mk");
    });
});
