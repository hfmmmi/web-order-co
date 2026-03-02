const path = require("path");
const fs = require("fs").promises;
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");
const { readToObjects } = require("../../utils/excelReader");
const BaseAdapter = require("./baseAdapter");

const EXCEL_EXT = /\.(xlsx|xls)$/i;
const isExcelFile = (filename) => filename && EXCEL_EXT.test(String(filename).trim());
// ZIP/xlsx のマジックナンバー PK (0x50 0x4B)
const isExcelBuffer = (buf) => {
    if (!buf || (buf.length !== undefined && buf.length < 2)) return false;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return b[0] === 0x50 && b[1] === 0x4B;
};
function toBuffer(buf) {
    if (!buf) return Buffer.alloc(0);
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

async function parseExcelToRecords(buffer) {
    return await readToObjects(buffer, { defval: "" });
}

function decodeCsvBuffer(buffer, preferredEncoding) {
    const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const enc = (preferredEncoding || "").trim().toLowerCase().replace(/-/g, "_");
    if (enc === "utf_8" || enc === "utf8") {
        return iconv.decode(raw, "utf-8");
    }
    // 指定がなければ日本語CSV（Excelで保存など）は Shift_JIS のことが多い
    let content = iconv.decode(raw, "Shift_JIS");
    if (content.includes("\ufffd") || (raw.length >= 2 && raw[0] === 0xef && raw[1] === 0xbb)) {
        content = iconv.decode(raw, "utf-8");
    }
    return content;
}

function parseCsvToRecords(buffer, encoding) {
    const content = decodeCsvBuffer(buffer, encoding);
    return parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
    });
}

class CsvAdapter extends BaseAdapter {
    async pull(runOptions = {}) {
        if (runOptions.fileBuffer) return runOptions.fileBuffer;
        if (runOptions.rawText) return Buffer.from(runOptions.rawText, "utf-8");

        const configuredPath = runOptions.filePath || this.config.options?.filePath;
        if (!configuredPath) {
            throw new Error("CSVファイルのパスが指定されていません");
        }
        const absolutePath = path.isAbsolute(configuredPath)
            ? configuredPath
            : path.join(process.cwd(), configuredPath);

        return await fs.readFile(absolutePath);
    }

    async normalize(buffer, runOptions = {}) {
        if (!buffer) return [];
        const raw = toBuffer(buffer);
        if (raw.length === 0) return [];
        const filename = (runOptions.filename || "").trim();
        const encoding = runOptions.encoding || this.config.options?.encoding || "utf-8";

        let records;
        if (isExcelFile(filename) || isExcelBuffer(raw)) {
            records = await parseExcelToRecords(raw);
        } else {
            records = parseCsvToRecords(raw, encoding);
        }

        const productsMap = new Map();

        records.forEach(row => {
            const code = (row.product_code || row.productCode || row.code || "").trim();
            if (!code) return;

            const upsert = productsMap.get(code) || {
                productCode: code,
                warehouses: []
            };

            const totalFields = [
                row.total_qty,
                row.totalQty,
                row.qty,
                row.stock
            ].map(v => (v === undefined || v === null) ? null : String(v).trim());

            for (const val of totalFields) {
                if (val === null || val === "") continue;
                const num = parseInt(val.replace(/[^0-9-]/g, ""), 10);
                if (Number.isFinite(num)) {
                    upsert.totalQty = num;
                    break;
                }
            }

            if (row.reserved_qty !== undefined || row.reservedQty !== undefined) {
                const val = row.reserved_qty ?? row.reservedQty;
                const num = parseInt(String(val).replace(/[^0-9-]/g, ""), 10);
                if (Number.isFinite(num)) {
                    upsert.reservedQty = num;
                }
            }

            const publishRaw = row.publish ?? row.visible;
            if (publishRaw !== undefined && publishRaw !== "") {
                const normalized = String(publishRaw).toLowerCase();
                upsert.publish = ["1", "true", "公開", "yes"].includes(normalized);
            }

            if (row.hidden_message || row.hiddenMessage) {
                upsert.hiddenMessage = row.hidden_message || row.hiddenMessage;
            }

            if (row.manual_lock !== undefined || row.manualLock !== undefined) {
                const raw = row.manual_lock ?? row.manualLock;
                upsert.manualLock = ["1", "true", "lock"].includes(String(raw).toLowerCase());
            }

            const warehouseCode = (row.warehouse_code || row.warehouseCode || "").trim();
            const warehouseName = (row.warehouse_name || row.warehouseName || "").trim();
            const warehouseQtyRaw = row.warehouse_qty ?? row.warehouseQty ?? row.qty;
            const warehouseQty = Number(warehouseQtyRaw);

            if (warehouseCode || warehouseName || Number.isFinite(warehouseQty)) {
                const codeKey = warehouseCode || "default";
                const target = upsert.warehouses.find(w => w.code === codeKey);
                const qtyValue = Number.isFinite(warehouseQty) ? warehouseQty : 0;
                if (target) {
                    target.qty += qtyValue;
                } else {
                    upsert.warehouses.push({
                        code: codeKey,
                        name: warehouseName || (warehouseCode ? `${warehouseCode}倉庫` : "標準倉庫"),
                        qty: qtyValue
                    });
                }
            }

            upsert.timestamp = row.timestamp || row.last_synced_at || row.updated_at || null;
            upsert.source = "csv";
            productsMap.set(code, upsert);
        });

        return Array.from(productsMap.values());
    }
}

module.exports = CsvAdapter;
