/**
 * 管理画面・顧客検索用: 半角/全角・ひらがな/カタカナ・大文字小文字・空白を揃えて比較しやすくする。
 */
const HALF_KATAKANA =
    "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
const FULL_KATAKANA =
    "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン";

function normalizeSearchKey(str) {
    if (str == null) return "";
    let s = String(str).normalize("NFKC").trim();
    if (!s) return "";

    let out = "";
    for (let i = 0; i < s.length; i++) {
        const idx = HALF_KATAKANA.indexOf(s[i]);
        out += idx >= 0 ? FULL_KATAKANA[idx] : s[i];
    }
    s = out;

    // ひらがな → カタカナ（「まねじ」≒「マネジ」）
    s = s.replace(/[\u3041-\u3096]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );

    return s.toLowerCase().replace(/\s+/g, "");
}

module.exports = { normalizeSearchKey };
