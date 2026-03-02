const { calculateFinalPrice } = require("../../utils/priceCalc");

describe("Aランク: 価格計算ユニット", () => {
    test("特価がある場合は最優先される", () => {
        const product = { basePrice: 1000, rankPrices: { A: 900 } };
        const special = { specialPrice: 700 };
        expect(calculateFinalPrice(product, "A", special)).toBe(700);
    });

    test("特価がなくランク価格がある場合はランク価格を使う", () => {
        const product = { basePrice: 1000, rankPrices: { A: 900 } };
        expect(calculateFinalPrice(product, "A", null)).toBe(900);
    });

    test("特価もランク価格もない場合は標準価格を使う", () => {
        const product = { basePrice: 1000, rankPrices: {} };
        expect(calculateFinalPrice(product, "A", null)).toBe(1000);
    });

    test("標準価格が未定義なら0を返す", () => {
        const product = { rankPrices: {} };
        expect(calculateFinalPrice(product, "A", null)).toBe(0);
    });
});
