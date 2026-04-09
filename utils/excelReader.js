// utils/excelReader.js
// 社外アップロードを想定した安全な Excel 読み込み（exceljs 使用・xlsx 脆弱性回避）
const ExcelJS = require("exceljs");

/**
 * ExcelJS のセル値を行データ用に正規化する（リッチテキスト・数式の result など）
 * ヘッダーが「ランク」+「A」と別フォントのとき等、オブジェクトのままだと String で [object Object] になるのを防ぐ。
 * @param {*} v
 * @returns {string|number|boolean|Date|*}
 */
function normalizeExcelCellValue(v) {
    if (v == null) return "";
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (v instanceof Date) return v;
    if (t !== "object") return v;
    if (Array.isArray(v.richText)) {
        return v.richText.map(part => (part && part.text != null ? String(part.text) : "")).join("");
    }
    if (v.formula != null && Object.prototype.hasOwnProperty.call(v, "result")) {
        return normalizeExcelCellValue(v.result);
    }
    if (v.sharedFormula != null && Object.prototype.hasOwnProperty.call(v, "result")) {
        return normalizeExcelCellValue(v.result);
    }
    if (v.hyperlink != null && v.text != null) return String(v.text);
    if (Object.prototype.hasOwnProperty.call(v, "error") && v.error != null) {
        return String(v.error);
    }
    return v;
}

/**
 * Excel バッファを読み、先頭シートを行の配列の配列で返す（header: 1 相当）
 * @param {Buffer} buffer
 * @param {Object} options - { sheetIndex: 0, sheetName: null } sheetName 指定時はその名前のシート
 * @returns {Promise<Array<Array>>}
 */
async function readToRowArrays(buffer, options = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = options.sheetName
        ? workbook.getWorksheet(options.sheetName) || workbook.worksheets[options.sheetIndex ?? 0]
        : workbook.worksheets[options.sheetIndex ?? 0];
    if (!sheet) return [];
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
        const values = row.values; // 1-indexed, values[0] is empty
        const arr = values ? values.slice(1).map(v => normalizeExcelCellValue(v)) : [];
        rows.push(arr);
    });
    return rows;
}

/**
 * 先頭行をキーとしたオブジェクトの配列で返す（sheet_to_json 相当）
 * @param {Buffer} buffer
 * @param {Object} options - { sheetIndex: 0, sheetName: null, defval: "" }
 * @returns {Promise<Array<Object>>}
 */
async function readToObjects(buffer, options = {}) {
    const rows = await module.exports.readToRowArrays(buffer, {
        sheetIndex: options.sheetIndex ?? 0,
        sheetName: options.sheetName
    });
    if (rows.length < 2) return [];
    const defval = options.defval !== undefined ? options.defval : "";
    const headers = rows[0].map(h => String(h ?? defval).trim());
    const result = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((key, j) => {
            let val = row[j];
            if (val instanceof Date) val = val.toISOString().split("T")[0];
            else if (val == null) val = defval;
            obj[key] = val;
        });
        result.push(obj);
    }
    return result;
}

/**
 * Excel 日付シリアル値を YYYY-MM-DD に変換（FLAM/importFlamData 用）
 * @param {number} serial
 * @returns {string|null}
 */
function excelSerialToDateString(serial) {
    if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
    // 1970-01-01 を基準にミリ秒に変換（Excel serial 25569 = 1970-01-01）
    const ms = (serial - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const c = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${c}`;
}

/**
 * セル値が Date または Excel シリアルの場合に YYYY-MM-DD を返す
 * @param {*} cellValue
 * @returns {string|null}
 */
function cellToDateString(cellValue) {
    if (cellValue instanceof Date) return cellValue.toISOString().split("T")[0];
    if (typeof cellValue === "number") return excelSerialToDateString(cellValue);
    return null;
}

module.exports = {
    readToRowArrays,
    readToObjects,
    normalizeExcelCellValue,
    excelSerialToDateString,
    cellToDateString,
    ExcelJS
};
