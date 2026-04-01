"use strict";

/**
 * routes/orders-api.js の orderMatchesDownloadCsvKeyword 純関数分岐
 */
const { orderMatchesDownloadCsvKeyword: match } = require("../../routes/orders-api");

describe("orderMatchesDownloadCsvKeyword", () => {
    const order = {
        orderId: 9100,
        customerId: "CUSTKEY",
        customerName: "山田商事株式会社",
        items: [
            { code: "PROD-A", name: "純正トナー" },
            { code: "PROD-B", name: "汎用" }
        ]
    };

    test("キーワードが空・空白・null は常に true", () => {
        expect(match(order, "")).toBe(true);
        expect(match(order, "   ")).toBe(true);
        expect(match(order, null)).toBe(true);
        expect(match(order, undefined)).toBe(true);
    });

    test("(コード) 形式で顧客IDが完全一致（大小文字区別）", () => {
        expect(match(order, "(CUSTKEY)")).toBe(true);
        expect(match(order, "(custkey)")).toBe(false);
    });

    test("(コード) 形式で明細の商品コードが完全一致", () => {
        expect(match({ ...order, customerId: "OTHER" }, "(PROD-A)")).toBe(true);
    });

    test("(コード) 形式でどちらも一致しなければ false", () => {
        expect(match(order, "(NOPE)")).toBe(false);
    });

    test("注文IDの部分一致（大文字小文字無視）", () => {
        expect(match(order, "910")).toBe(true);
    });

    test("顧客IDの部分一致", () => {
        expect(match(order, "cust")).toBe(true);
    });

    test("顧客名の部分一致", () => {
        expect(match(order, "山田")).toBe(true);
    });

    test("明細のコードまたは品名に含まれるキーワード", () => {
        expect(match(order, "トナー")).toBe(true);
        expect(match(order, "prod-a")).toBe(true);
        expect(match(order, "汎用")).toBe(true);
    });

    test("どれにも当てはまらなければ false", () => {
        expect(match(order, "存在しない検索語xyz")).toBe(false);
    });

    test("items が無い・空でも他条件でマッチしなければ false", () => {
        expect(match({ orderId: 1, customerId: "X", customerName: "", items: [] }, "zzz")).toBe(false);
    });

    test("customerName 未設定でも orderId でマッチ", () => {
        expect(match({ orderId: 777, customerId: "A", items: [] }, "777")).toBe(true);
    });

    test("(コード) 内側が空白のみのときは完全一致扱いで不一致になりうる", () => {
        expect(match(order, "(  )")).toBe(false);
    });
});
