"use strict";

const { sanitizeAdminName } = require("../../routes/auth/sanitizeAdminName");

describe("sanitizeAdminName 分岐", () => {
    test("null/undefined は空文字", () => {
        expect(sanitizeAdminName(null)).toBe("");
        expect(sanitizeAdminName(undefined)).toBe("");
    });

    test("文字列以外は空文字", () => {
        expect(sanitizeAdminName(123)).toBe("");
        expect(sanitizeAdminName({})).toBe("");
    });

    test("先に100文字に切詰めた後に危険文字除去（長さは100未満になり得る）", () => {
        const long = `a<b>"'&${"x".repeat(120)}`;
        const out = sanitizeAdminName(long);
        expect(out).not.toMatch(/[<>"'&]/);
        expect(out.length).toBeLessThanOrEqual(100);
        expect(out.startsWith("ab")).toBe(true);
    });
});
