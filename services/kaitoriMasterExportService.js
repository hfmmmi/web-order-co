// services/kaitoriMasterExportService.js
// 買取マスタをエンプティ買取一覧 Excel テンプレート形式で出力
const path = require("path");
const fs = require("fs").promises;
const ExcelJS = require("exceljs");
const { dbPath } = require("../dbPaths");

const TEMPLATE_PATH = path.join(__dirname, "../assets/templates/kaitori-master-export-template.xlsx");
const SHEET_NAME = "ｴﾝﾌﾟﾃｨﾘｽﾄ";
const DATA_START_ROW = 5;
const FOOTER_LABEL = "買取（お値引き）合計金額";
const OSAKA_FOOTER_COL = 10; // J
const HYOGO_FOOTER_COL = 2; // B
const OSAKA_FOOTER_ROWS = 2;
const KAITORI_MASTER_STATUS_ENDED = "買取終了";

function columnToLetter(col) {
    let n = col;
    let s = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function cellText(value) {
    if (value == null) return "";
    if (typeof value === "object") {
        if (value.richText) return value.richText.map((t) => t.text).join("");
        if (value.formula != null) return String(value.result ?? "");
        if (value.text) return String(value.text);
    }
    return String(value);
}

function isEndedItem(item) {
    return item.status === KAITORI_MASTER_STATUS_ENDED;
}

function splitMasterByDestination(items) {
    const hyogo = [];
    const osaka = [];
    for (const item of items) {
        if ((item.destination || "大阪") === "兵庫") hyogo.push(item);
        else osaka.push(item);
    }
    const byMakerName = (a, b) => {
        const ma = String(a.maker || "");
        const mb = String(b.maker || "");
        if (ma !== mb) return ma.localeCompare(mb, "ja");
        return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    };
    hyogo.sort(byMakerName);
    osaka.sort(byMakerName);
    return { hyogo, osaka };
}

function copyRowStyles(sheet, fromRow, toRow) {
    const src = sheet.getRow(fromRow);
    const dst = sheet.getRow(toRow);
    if (src.height) dst.height = src.height;
    for (let col = 1; col <= 15; col++) {
        const srcCell = src.getCell(col);
        const dstCell = dst.getCell(col);
        if (srcCell.style && Object.keys(srcCell.style).length > 0) {
            dstCell.style = JSON.parse(JSON.stringify(srcCell.style));
        }
    }
}

function clearBlock(sheet, row, startCol) {
    for (let offset = 0; offset < 7; offset++) {
        sheet.getCell(row, startCol + offset).value = null;
    }
}

function writeBlockRow(sheet, row, startCol, item) {
    const ended = isEndedItem(item);
    const price = parseInt(item.price, 10) || 0;

    sheet.getCell(row, startCol).value = item.maker || "";
    sheet.getCell(row, startCol + 1).value = item.name || "";
    sheet.getCell(row, startCol + 2).value = item.type || "";
    sheet.getCell(row, startCol + 3).value = price;
    sheet.getCell(row, startCol + 4).value = "";

    const amountCol = startCol + 5;
    const noteCol = startCol + 6;
    if (ended) {
        sheet.getCell(row, amountCol).value = "-";
        sheet.getCell(row, noteCol).value = KAITORI_MASTER_STATUS_ENDED;
    } else {
        const priceCol = columnToLetter(startCol + 3);
        const qtyCol = columnToLetter(startCol + 4);
        sheet.getCell(row, amountCol).value = {
            formula: `${priceCol}${row}*${qtyCol}${row}`
        };
        sheet.getCell(row, noteCol).value = "";
    }
}

function findFooterRow(sheet, col) {
    for (let row = DATA_START_ROW; row <= sheet.rowCount; row++) {
        const text = cellText(sheet.getCell(row, col).value);
        if (text.includes(FOOTER_LABEL)) return row;
    }
    return null;
}

function safeMerge(sheet, range) {
    try {
        sheet.mergeCells(range);
    } catch (_e) {
        // 既存マージと重複する場合は無視
    }
}

function applyOsakaFooterLayout(sheet, osakaFooterRow) {
    const r1 = osakaFooterRow;
    const r2 = osakaFooterRow + 1;
    const lastOsakaDataRow = Math.max(DATA_START_ROW, r1 - 1);

    safeMerge(sheet, `J${r1}:L${r1}`);
    safeMerge(sheet, `J${r2}:L${r2}`);
    safeMerge(sheet, `M${r2}:O${r2}`);

    sheet.getCell(r1, 10).value = FOOTER_LABEL;
    sheet.getCell(r1, 11).value = FOOTER_LABEL;
    sheet.getCell(r1, 12).value = FOOTER_LABEL;
    sheet.getCell(r1, 13).value = "：";
    sheet.getCell(r1, 14).value = {
        formula: `SUM(N${DATA_START_ROW}:N${lastOsakaDataRow})`
    };
    sheet.getCell(r1, 15).value = "円(税込)";

    sheet.getCell(r2, 10).value = "出荷個口数";
    sheet.getCell(r2, 11).value = "出荷個口数";
    sheet.getCell(r2, 12).value = "出荷個口数";
    sheet.getCell(r2, 13).value = "[　　　　　]個口";
    sheet.getCell(r2, 14).value = "[　　　　　]個口";
    sheet.getCell(r2, 15).value = "[　　　　　]個口";
}

function applyHyogoFooterLayout(sheet, hyogoFooterRow) {
    const r1 = hyogoFooterRow;
    const r2 = hyogoFooterRow + 1;
    const r3 = hyogoFooterRow + 2;
    const lastHyogoDataRow = Math.max(DATA_START_ROW, r1 - 1);

    safeMerge(sheet, `B${r1}:D${r1}`);
    safeMerge(sheet, `B${r2}:D${r2}`);
    safeMerge(sheet, `E${r2}:G${r2}`);

    sheet.getCell(r1, 2).value = FOOTER_LABEL;
    sheet.getCell(r1, 3).value = FOOTER_LABEL;
    sheet.getCell(r1, 4).value = FOOTER_LABEL;
    sheet.getCell(r1, 5).value = "：";
    sheet.getCell(r1, 6).value = {
        formula: `SUM(F${DATA_START_ROW}:F${lastHyogoDataRow})`
    };
    sheet.getCell(r1, 7).value = "円(税込)";

    sheet.getCell(r2, 2).value = "回収個口数";
    sheet.getCell(r2, 3).value = "回収個口数";
    sheet.getCell(r2, 4).value = "回収個口数";
    sheet.getCell(r2, 5).value = "[　　　　　]個口";
    sheet.getCell(r2, 6).value = "[　　　　　]個口";
    sheet.getCell(r2, 7).value = "[　　　　　]個口";

    sheet.getCell(r3, 7).value = "※こちらの買取・お値引きは税込での計算となりますので、ご注意ください";
}

function resolveHyogoRowIndex(index, osakaFooterRow, segment1RowCount) {
    if (index < segment1RowCount) return DATA_START_ROW + index;
    return osakaFooterRow + (index - segment1RowCount);
}

async function loadMasterItems() {
    try {
        const raw = await fs.readFile(dbPath("kaitori_master.json"), "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
        return [];
    }
}

async function buildKaitoriMasterExportBuffer(items) {
    const masterItems = items != null ? items : await loadMasterItems();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const sheet = workbook.getWorksheet(SHEET_NAME);
    if (!sheet) {
        throw new Error("買取マスタ出力テンプレートのシートが見つかりません");
    }

    const { hyogo, osaka } = splitMasterByDestination(masterItems);
    const osakaCount = osaka.length;
    const hyogoCount = hyogo.length;

    let osakaFooterRow = findFooterRow(sheet, OSAKA_FOOTER_COL);
    let hyogoFooterRow = findFooterRow(sheet, HYOGO_FOOTER_COL);
    if (osakaFooterRow == null || hyogoFooterRow == null) {
        throw new Error("買取マスタ出力テンプレートのフッター行が見つかりません");
    }

    // 大阪ブロック：データ行のみ増減（I～O 側フッター2行は osakaFooterRow 以降に固定）
    const osakaTemplateDataRows = osakaFooterRow - DATA_START_ROW;
    const deltaOsaka = osakaCount - osakaTemplateDataRows;
    if (deltaOsaka > 0) {
        const blankRows = Array.from({ length: deltaOsaka }, () => []);
        sheet.spliceRows(osakaFooterRow, 0, ...blankRows);
        for (let i = 0; i < deltaOsaka; i++) {
            copyRowStyles(sheet, DATA_START_ROW, osakaFooterRow + i);
        }
        osakaFooterRow += deltaOsaka;
        hyogoFooterRow += deltaOsaka;
    } else if (deltaOsaka < 0) {
        sheet.spliceRows(DATA_START_ROW + osakaCount, -deltaOsaka);
        osakaFooterRow += deltaOsaka;
        hyogoFooterRow += deltaOsaka;
    }

    const segment1RowCount = osakaFooterRow - DATA_START_ROW;
    const hyogoOnlyNeeded = Math.max(0, hyogoCount - segment1RowCount);
    const targetHyogoFooterRow = osakaFooterRow + Math.max(OSAKA_FOOTER_ROWS, hyogoOnlyNeeded);
    const deltaHyogo = targetHyogoFooterRow - hyogoFooterRow;

    // 兵庫ブロック：大阪フッター直後の兵庫データ行のみ増減（兵庫フッター直前で行を挿入/削除）
    if (deltaHyogo > 0) {
        const blankRows = Array.from({ length: deltaHyogo }, () => []);
        sheet.spliceRows(hyogoFooterRow, 0, ...blankRows);
        for (let i = 0; i < deltaHyogo; i++) {
            copyRowStyles(sheet, osakaFooterRow, hyogoFooterRow + i);
        }
        hyogoFooterRow += deltaHyogo;
    } else if (deltaHyogo < 0) {
        sheet.spliceRows(hyogoFooterRow + deltaHyogo, -deltaHyogo);
        hyogoFooterRow += deltaHyogo;
    }

    for (let row = DATA_START_ROW; row < osakaFooterRow; row++) {
        clearBlock(sheet, row, 1);
        clearBlock(sheet, row, 9);
    }
    for (let row = osakaFooterRow; row < hyogoFooterRow; row++) {
        clearBlock(sheet, row, 1);
    }

    for (let i = 0; i < hyogoCount; i++) {
        const row = resolveHyogoRowIndex(i, osakaFooterRow, segment1RowCount);
        writeBlockRow(sheet, row, 1, hyogo[i]);
    }

    for (let j = 0; j < osakaCount; j++) {
        writeBlockRow(sheet, DATA_START_ROW + j, 9, osaka[j]);
    }

    applyOsakaFooterLayout(sheet, osakaFooterRow);
    applyHyogoFooterLayout(sheet, hyogoFooterRow);

    return workbook.xlsx.writeBuffer();
}

function buildExportFilename(date = new Date()) {
    const stamp = date.toISOString().slice(0, 10);
    return `エンプティ買取お値引き一覧_${stamp}.xlsx`;
}

module.exports = {
    buildKaitoriMasterExportBuffer,
    buildExportFilename,
    splitMasterByDestination,
    isEndedItem,
    resolveHyogoRowIndex,
    TEMPLATE_PATH,
    SHEET_NAME
};
