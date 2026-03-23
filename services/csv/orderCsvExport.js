// services/csv/orderCsvExport.js
// 受注CSVエクスポート仕様・セル解決・生成（csvService から分離）

const DEFAULT_ORDER_CSV_HEADER_LINE =
    "伝票まとめ番号,受注日,未使用,見積番号,物件コード,物件名,倉庫コード,得意先コード,得意先名,請求先コード,請求先名,締切区分,未使用,税計算単位,未使用,未使用,未使用,金額端数処理,未使用,税端数処理,未使用,未使用,備考,未使用,未使用,未使用,未使用,未使用,社内メモ,未使用,明細区分,未使用,商品コード,内訳1,内訳2,商品名,仕様・規格,入数,梱数,単価,数量,未使用,未使用,未使用,未使用,単位,原価,小計,未使用,未使用,未使用,未使用,未使用,未使用,納品日,納入先コード,納入先名,未使用,未使用,未使用,未使用,件名,未使用,税率名,税法,未使用,未使用,未使用,未使用,未使用,未使用,未使用,代理店コード,代理店名,未使用,未使用,担当者ID,取引区分コード,部門コード,未使用,回収先コード,未使用,倉庫名,未使用";

/** @returns {string[]} */
function getDefaultOrderCsvColumnKeys() {
    const keys = [];
    const push = (k, n) => {
        for (let i = 0; i < n; i++) keys.push(k);
    };
    push("orderId", 1);
    push("orderDate", 1);
    push("empty", 5);
    push("customerId", 1);
    push("customerName", 1);
    push("empty", 13);
    push("deliveryNote", 1);
    push("empty", 5);
    push("internalMemo", 1);
    push("empty", 1);
    push("literal:0", 1);
    push("empty", 1);
    push("productCode", 1);
    push("empty", 2);
    push("productName", 1);
    push("empty", 3);
    push("unitPrice", 1);
    push("quantity", 1);
    push("empty", 43);
    return keys;
}

function getDefaultOrderCsvSpec() {
    return {
        headerLine: DEFAULT_ORDER_CSV_HEADER_LINE,
        columnKeys: getDefaultOrderCsvColumnKeys()
    };
}

/**
 * 設定の orderCsvExport から最終仕様を決定（列数不一致時はデフォルトにフォールバック）
 * @param {object|null|undefined} custom settings.dataFormats.orderCsvExport
 */
function resolveOrderCsvSpec(custom) {
    const builtIn = getDefaultOrderCsvSpec();
    if (!custom || typeof custom !== "object") return builtIn;

    const headerLine =
        typeof custom.headerLine === "string" && custom.headerLine.trim()
            ? custom.headerLine.trim()
            : builtIn.headerLine;
    const headerCols = headerLine.split(",").length;

    let columnKeys = builtIn.columnKeys;
    if (Array.isArray(custom.columnKeys) && custom.columnKeys.length === headerCols) {
        columnKeys = custom.columnKeys.map((k) => String(k || "").trim() || "empty");
    } else if (Array.isArray(custom.columnKeys) && custom.columnKeys.length === builtIn.columnKeys.length) {
        columnKeys = custom.columnKeys.map((k) => String(k || "").trim() || "empty");
    }

    if (columnKeys.length !== headerCols) {
        return builtIn;
    }

    return { headerLine, columnKeys };
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * @param {string} token
 * @param {object} order
 * @param {object} item
 * @returns {string|number}
 */
function resolveOrderCsvCell(token, order, item) {
    if (!token || token === "empty") return "";
    if (token.startsWith("literal:")) return token.slice("literal:".length);
    switch (token) {
        case "orderId":
            return order.orderId != null ? order.orderId : "";
        case "orderDate":
            return formatDate(order.orderDate);
        case "customerId":
            return order.customerId || "";
        case "customerName":
            return order.customerName || "";
        case "deliveryNote":
            return order.deliveryInfo ? order.deliveryInfo.note || "" : "";
        case "internalMemo":
            return order.internalMemo != null ? String(order.internalMemo) : "";
        case "productCode":
            return item.code != null ? item.code : "";
        case "productName":
            return item.name != null ? item.name : "";
        case "unitPrice":
            return item.price != null ? item.price : "";
        case "quantity":
            return item.quantity != null ? item.quantity : "";
        default:
            return "";
    }
}

/**
 * 注文データからCSV形式の文字列を生成する
 * @param {object} exportSpec resolveOrderCsvSpec の戻り値
 */
function generateOrdersCsv(orders, productMaster, priceList, customerList, rankPriceMap, isUnexportedOnly, exportSpec) {
    const spec = exportSpec || getDefaultOrderCsvSpec();
    const { headerLine, columnKeys } = spec;
    const csvRows = [];

    orders.forEach((order) => {
        if (isUnexportedOnly && order.exported_at) {
            return;
        }

        order.items.forEach((item) => {
            const row = columnKeys.map((key) => resolveOrderCsvCell(key, order, item));
            csvRows.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        });
    });

    return "\uFEFF" + headerLine + "\n" + csvRows.join("\n");
}

module.exports = {
    generateOrdersCsv,
    getDefaultOrderCsvSpec,
    resolveOrderCsvSpec
};
