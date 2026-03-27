"use strict";

const ExcelJS = require("exceljs");

const ORDER_LIST_EXPORT_HEADERS = [
    "注文日",
    "注文ID",
    "ステータス",
    "顧客ID",
    "顧客名",
    "納品先名",
    "納品先住所",
    "納品先電話",
    "納品指定日",
    "備考",
    "得意先注文番号",
    "荷主名",
    "商品コード",
    "商品名",
    "数量",
    "単価",
    "行金額",
    "注文合計",
    "連携",
    "納期目安"
];

function formatOrderDateYmdSlash(orderDate) {
    const d = new Date(orderDate);
    if (Number.isNaN(d.getTime())) return "";
    const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
    const x = new Date(jstMs);
    const y = x.getUTCFullYear();
    const m = String(x.getUTCMonth() + 1).padStart(2, "0");
    const day = String(x.getUTCDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
}

/**
 * 管理画面「注文一覧」用の表形式データ（1行目はヘッダー）
 * @param {Array} orders
 * @returns {Array<Array>}
 */
function buildOrderListExportRows(orders) {
    const rows = [ORDER_LIST_EXPORT_HEADERS.slice()];
    if (!Array.isArray(orders)) return rows;

    for (const order of orders) {
        const info = order.deliveryInfo || {};
        const dStr = formatOrderDateYmdSlash(order.orderDate);
        const delivDate = info.dateUnknown ? "確約不可" : (info.date || "");
        const exported = order.exported_at ? "連携済" : "未連携";
        const shipper = (info.shipper && info.shipper.name) || "";
        const total = order.totalAmount != null ? order.totalAmount : "";
        const items =
            order.items && order.items.length
                ? order.items
                : [{ code: "", name: "", quantity: "", price: "" }];

        for (const item of items) {
            const qty = item.quantity != null ? item.quantity : "";
            const price = item.price != null ? item.price : "";
            let lineSub = "";
            if (typeof qty === "number" && typeof price === "number") {
                lineSub = qty * price;
            }
            rows.push([
                dStr,
                order.orderId || "",
                order.status || "未発送",
                order.customerId || "",
                order.customerName || "",
                info.name || "",
                info.address || "",
                info.tel || "",
                delivDate,
                info.note || "",
                info.clientOrderNumber || "",
                shipper,
                item.code || "",
                item.name || "",
                qty,
                price,
                lineSub,
                total,
                exported,
                info.estimateMessage || ""
            ]);
        }
    }
    return rows;
}

function escapeCsvField(val) {
    const s = val === null || val === undefined ? "" : String(val);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function rowsToCsvString(rows) {
    return "\uFEFF" + rows.map((r) => r.map(escapeCsvField).join(",")).join("\r\n");
}

async function rowsToXlsxBuffer(rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("注文一覧");
    rows.forEach((row) => ws.addRow(row));
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}

module.exports = {
    ORDER_LIST_EXPORT_HEADERS,
    buildOrderListExportRows,
    rowsToCsvString,
    rowsToXlsxBuffer
};
