// services/priceManufacturerNormalize.js
// 価格表・Excel取込でメーカー名をキー化するための正規化（priceService から分離）

/** Excelセル値から整数円を取得。小数・文字列・浮動小数点誤差を安全に整数に丸める。上限 999,999,999 円 */
function parsePriceCell(val) {
    if (val === "" || val === undefined || val === null) return null;
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return null;
    const rounded = Math.round(n);
    return rounded <= 999999999 ? rounded : null;
}

const HALF_KATAKANA = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
const FULL_KATAKANA = "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン";

/**
 * メーカー名をシート分け・並び順用に正規化する（半角/全角・大文字/小文字を同一扱い）
 * @param {string} str
 * @returns {string}
 */
function normalizeManufacturerKey(str) {
    if (typeof str !== "string") return "";
    let s = str.trim();
    if (!s) return "";
    let out = "";
    for (let i = 0; i < s.length; i++) {
        const idx = HALF_KATAKANA.indexOf(s[i]);
        out += idx >= 0 ? FULL_KATAKANA[idx] : s[i];
    }
    s = out;
    s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    return s.toUpperCase();
}

module.exports = { parsePriceCell, normalizeManufacturerKey };
