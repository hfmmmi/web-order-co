/**
 * 商品、顧客ランク、個別特価情報から、最終的な提供価格を算出する
 * * @param {Object} product - 商品マスタのデータ（basePrice, rankPricesを含む）
 * @param {String} rank - 顧客のランク（"A"〜"P" または ""）
 * @param {Object|null} specialPriceEntry - 個別価格マスタのエントリ（あれば優先）
 * @returns {Number} 最終価格
 */
function calculateFinalPrice(product, rank, specialPriceEntry) {
    // 1. 個別特価（Special Price）が優先
    if (specialPriceEntry) {
        return specialPriceEntry.specialPrice;
    }

    // 2. ランク価格（Rank Price）。顧客ランクがあり、商品にそのランクの価格設定があれば採用。
    if (rank && product.rankPrices && product.rankPrices[rank]) {
        return product.rankPrices[rank];
    }

    // 3. それ以外は標準価格（Base Price）。設定ミスでundefinedなら0円を防ぐため || 0。
    return product.basePrice || 0;
}

// 他のファイルから呼び出せるようにエクスポート
module.exports = { calculateFinalPrice };