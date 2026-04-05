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

    test("items が配列でないとき明細ループに入らず false になりうる", () => {
        expect(
            match(
                { orderId: 1, customerId: "Z", customerName: "", items: { code: "X" } },
                "トナー"
            )
        ).toBe(false);
    });

    test("customerId が無い注文でも orderId 等のフリー検索が動く", () => {
        expect(match({ orderId: 8801, customerName: "", items: [] }, "880")).toBe(true);
    });

    test("(コード) 検索で顧客ID不一致でも明細コード一致で true", () => {
        expect(
            match(
                { orderId: 1, customerId: "OTHER", customerName: "", items: [{ code: "MATCHX", name: "n" }] },
                "(MATCHX)"
            )
        ).toBe(true);
    });

    test("明細の code が空でも name のみで部分一致", () => {
        expect(
            match(
                { orderId: 1, customerId: "C", customerName: "", items: [{ name: "特殊ラベル品" }] },
                "ラベル"
            )
        ).toBe(true);
    });

    test("(コード) で items が空配列なら false", () => {
        expect(match({ orderId: 1, customerId: "X", customerName: "", items: [] }, "(ZZZ)")).toBe(false);
    });

    test("items 未定義でも注文ID・顧客のフリー検索は動く", () => {
        const o = { orderId: 501, customerId: "CID501", customerName: "無明細商事" };
        expect(match(o, "501")).toBe(true);
        expect(match(o, "cid501")).toBe(true);
        expect(match(o, "無明細")).toBe(true);
    });

    test("(コード) 内が空白のみなら括弧モードに入らず通常検索へ", () => {
        const o = { orderId: 9, customerId: "X", customerName: "", items: [] };
        expect(match(o, "(   )")).toBe(false);
    });

    test("明細の code が数値でも文字列比較で一致", () => {
        expect(
            match(
                { orderId: 1, customerId: "Q", customerName: "", items: [{ code: 100, name: "n" }] },
                "(100)"
            )
        ).toBe(true);
    });

    test("顧客名が undefined でも orderId 検索は動く", () => {
        expect(match({ orderId: 7002, customerId: "Z", items: [] }, "7002")).toBe(true);
    });
});
