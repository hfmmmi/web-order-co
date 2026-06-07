/**
 * ブラウザ用 searchNormalize（utils/searchNormalize.js と同じロジック）
 */
(function (global) {
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

        s = s.replace(/[\u3041-\u3096]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) + 0x60)
        );

        return s.toLowerCase().replace(/\s+/g, "");
    }

    global.normalizeSearchKey = normalizeSearchKey;
})(typeof window !== "undefined" ? window : globalThis);
