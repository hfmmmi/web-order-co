/**
 * services/settingsService のユニットテスト（applyTemplate / getAnnouncements / getMailConfig 分岐）
 * npm run test:api / test:all で実行
 */
const settingsService = require("../../services/settingsService");
const { applyTemplate } = settingsService;

describe("Aランク: settingsService.applyTemplate ユニット", () => {
    test("プレースホルダ {{key}} を vars の値で置換する", () => {
        const t = "Hello {{customerName}}, order {{orderId}}.";
        const out = applyTemplate(t, { customerName: "山田", orderId: "ORD-001" });
        expect(out).toBe("Hello 山田, order ORD-001.");
    });

    test("同一プレースホルダが複数ある場合はすべて置換する", () => {
        const t = "{{x}} and {{x}}";
        expect(applyTemplate(t, { x: "A" })).toBe("A and A");
    });

    test("vars にないキーは置換されず残る", () => {
        const t = "{{a}} {{b}}";
        expect(applyTemplate(t, { a: "1" })).toBe("1 {{b}}");
    });

    test("template が空文字のときは空文字を返す", () => {
        expect(applyTemplate("", { x: "1" })).toBe("");
    });

    test("template が null/undefined のときは空文字を返す", () => {
        expect(applyTemplate(null, { x: "1" })).toBe("");
        expect(applyTemplate(undefined, { x: "1" })).toBe("");
    });

    test("vars の値が null/undefined のときは空文字に置換する", () => {
        const t = "a={{v}}";
        expect(applyTemplate(t, { v: null })).toBe("a=");
        expect(applyTemplate(t, { v: undefined })).toBe("a=");
    });

    test("vars が空オブジェクトのときはプレースホルダがそのまま残る", () => {
        const t = "{{customerName}}";
        expect(applyTemplate(t, {})).toBe("{{customerName}}");
    });
});

