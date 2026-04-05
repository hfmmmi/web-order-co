"use strict";

const orderService = require("../../services/orderService");

describe("orderService firstCsvRowValue / fromPublicId", () => {
    const { firstCsvRowValue, fromPublicId } = orderService.__testOnly;

    test("firstCsvRowValue は row 無し・keys 無しで空文字", () => {
        expect(firstCsvRowValue(null, ["a"])).toBe("");
        expect(firstCsvRowValue({ x: 1 }, null)).toBe("");
        expect(firstCsvRowValue({ x: 1 }, [])).toBe("");
    });

    test("firstCsvRowValue は空値をスキップして次のキーを採用", () => {
        expect(firstCsvRowValue({ a: "", b: "  ok  " }, ["a", "b"])).toBe("ok");
    });

    test("fromPublicId は W 付き数値・無効を扱う", () => {
        expect(fromPublicId("")).toBeNull();
        expect(fromPublicId(null)).toBeNull();
        expect(fromPublicId("W99")).toBe(99);
        expect(fromPublicId("W")).toBeNull();
        expect(fromPublicId("Wabc")).toBeNull();
    });
});
