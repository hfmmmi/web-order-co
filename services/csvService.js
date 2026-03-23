// services/csvService.js
// 【役割】CSV/Excelの生成・解析
const iconv = require("iconv-lite");
const { readToRowArrays, cellToDateString } = require("../utils/excelReader");
const {
    generateOrdersCsv,
    getDefaultOrderCsvSpec,
    resolveOrderCsvSpec
} = require("./csv/orderCsvExport");

const DEFAULT_ESTIMATE_ALIASES = {
    estimateId: ["見積番号", "見積No", "見積NO", "EstimateNo", "見積ID"],
    customerId: ["得意先コード", "得意先CD", "CustomerCode", "得意先", "顧客コード", "顧客CD"],
    productCode: ["商品コード", "商品CD", "ProductCode", "品番", "商品番号"],
    productName: ["商品名", "品名", "ProductName", "名称"],
    price: ["単価", "決定単価", "Price", "特価", "金額", "売価"],
    validUntil: ["有効期限", "期限", "ValidUntil", "納期", "有効期限日"],
    manufacturer: ["メーカー", "メーカ", "Maker", "Manufacturer", "ブランド"],
    subject: ["件名", "Subject", "タイトル", "案件名", "物件名"]
};

function mergeAliasGroups(base, override) {
    const out = {};
    for (const k of Object.keys(base)) {
        const extra = override && Array.isArray(override[k]) ? override[k] : [];
        const set = new Set(
            [...base[k], ...extra].map((s) => String(s || "").replace(/\s+/g, "")).filter(Boolean)
        );
        out[k] = [...set];
    }
    return out;
}

/**
 * 物流取込（列固定）用デフォルト列インデックス（0始まり・ヘッダー行あり想定）
 */
const DEFAULT_LOGISTICS_COLUMN_INDICES = {
    orderId: 0,
    orderDate: 1,
    customerId: 7,
    customerName: 8,
    productCode: 32,
    productName: 35,
    unitPrice: 39,
    quantity: 40
};

/**
 * @param {object} [indicesOverride] settings.dataFormats.logisticsFixedColumnImport
 */
async function importFlamData(fileBuffer, indicesOverride) {
    const jsonData = await readToRowArrays(fileBuffer);
    const idx = { ...DEFAULT_LOGISTICS_COLUMN_INDICES, ...(indicesOverride || {}) };

    const newOrdersMap = new Map();
    const COL_ORDER_ID = idx.orderId;
    const COL_DATE = idx.orderDate;
    const COL_CUST_ID = idx.customerId;
    const COL_CUST_NAME = idx.customerName;
    const COL_PROD_CODE = idx.productCode;
    const COL_PROD_NAME = idx.productName;
    const COL_PRICE = idx.unitPrice;
    const COL_QTY = idx.quantity;

    for (let i = 1; i < jsonData.length; i++) {
        const cols = jsonData[i];
        if (!cols || cols.length === 0) continue;

        const rawId = cols[COL_ORDER_ID];
        if (!rawId) continue;

        const finalOrderId = String(rawId).trim();
        let finalDate = new Date().toISOString().split("T")[0];
        if (cols[COL_DATE]) {
            const parsed = cellToDateString(cols[COL_DATE]);
            if (parsed) finalDate = parsed;
            else finalDate = String(cols[COL_DATE]).trim().replace(/\//g, "-");
        }

        const custId = String(cols[COL_CUST_ID] || "").trim();
        const custName = String(cols[COL_CUST_NAME] || "名称不明").trim();
        const prodCode = String(cols[COL_PROD_CODE] || "").trim();
        const prodName = String(cols[COL_PROD_NAME] || "不明な商品").trim();
        const price = parseInt(cols[COL_PRICE], 10) || 0;
        const quantity = parseInt(cols[COL_QTY], 10) || 0;

        if (!newOrdersMap.has(finalOrderId)) {
            newOrdersMap.set(finalOrderId, {
                orderId: finalOrderId,
                id: finalOrderId,
                customerId: custId || "GUEST",
                customerName: custName,
                deliveryInfo: { name: custName, note: "外部取込データ" },
                items: [],
                totalAmount: 0,
                status: "発送済",
                orderDate: finalDate,
                source: "external",
                exported_at: new Date().toISOString()
            });
        }

        const order = newOrdersMap.get(finalOrderId);
        const finalCode = prodCode || `UNKNOWN-${Math.floor(Math.random() * 1000)}`;

        order.items.push({
            code: finalCode,
            name: prodName,
            price: price,
            quantity: quantity
        });

        order.totalAmount += price * quantity;
    }

    return Array.from(newOrdersMap.values());
}

/**
 * ★見積CSV/Excelデータの解析
 * @param {Buffer} fileBuffer
 * @param {string} fileName
 * @param {object} [estimateImportAliasesOverride] dataFormats.estimateImportAliases（キーごとに追加ヘッダー名の配列）
 */
async function parseEstimatesData(fileBuffer, fileName = "", estimateImportAliasesOverride) {
    const INVALID_CUSTOMER_CODES = ["0000", "", "フリー", "FREE"];

    let rows = [];
    let headers = [];

    const isExcel =
        fileName.match(/\.(xlsx?|xls)$/i) ||
        (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b) ||
        (fileBuffer[0] === 0xd0 && fileBuffer[1] === 0xcf);

    if (isExcel) {
        try {
            const jsonData = await readToRowArrays(fileBuffer);
            if (jsonData.length < 2) {
                return [];
            }
            headers = jsonData[0].map((h) => String(h || "").trim());
            rows = jsonData.slice(1);
        } catch (e) {
            console.error("[CSV Service] Excelファイルの読み込みに失敗:", e.message);
            return [];
        }
    } else {
        let content = iconv.decode(fileBuffer, "Shift_JIS");
        if (content.includes("\ufffd") || (fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb)) {
            content = iconv.decode(fileBuffer, "utf-8");
        }

        const lines = content.split(/\r\n|\n|\r/).filter((line) => line.trim() !== "");
        if (lines.length < 2) {
            return [];
        }

        headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        rows = lines.slice(1).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
    }

    const aliasGroups = mergeAliasGroups(DEFAULT_ESTIMATE_ALIASES, estimateImportAliasesOverride || {});
    const map = {
        estimateId: -1,
        customerId: -1,
        productCode: -1,
        productName: -1,
        price: -1,
        validUntil: -1,
        manufacturer: -1,
        subject: -1
    };

    headers.forEach((h, index) => {
        const cleanH = String(h).replace(/\s+/g, "");
        for (const field of Object.keys(map)) {
            const list = aliasGroups[field] || [];
            if (list.includes(cleanH)) {
                map[field] = index;
            }
        }
    });

    if (map.customerId === -1 || map.productCode === -1 || map.price === -1) {
        console.error("[CSV Service] 必須列不足。検出状況:", map);
        return [];
    }

    const parsedData = [];
    let skippedCount = 0;

    for (const row of rows) {
        if (!row || row.length < 3) continue;

        const customerId = String(row[map.customerId] || "").trim();
        const productCode = String(row[map.productCode] || "").trim();
        const priceStr = String(row[map.price] || "");

        if (INVALID_CUSTOMER_CODES.includes(customerId)) {
            skippedCount++;
            continue;
        }

        if (!customerId || !productCode || !priceStr) continue;

        const price = parseInt(String(priceStr).replace(/,/g, ""), 10);
        if (isNaN(price)) continue;

        let validUntil = null;
        if (map.validUntil !== -1 && row[map.validUntil] !== undefined && row[map.validUntil] !== "") {
            const rawDate = row[map.validUntil];
            validUntil = cellToDateString(rawDate);
            if (!validUntil && typeof rawDate === "string") {
                const dateStr = rawDate.replace(/\//g, "-");
                if (!isNaN(Date.parse(dateStr))) validUntil = new Date(dateStr).toISOString().split("T")[0];
            }
        }

        parsedData.push({
            estimateId: map.estimateId !== -1 ? String(row[map.estimateId] || "").trim() : "",
            customerId: customerId,
            productCode: productCode,
            productName: map.productName !== -1 ? String(row[map.productName] || "").trim() : "",
            unitPrice: price,
            price: price,
            validUntil: validUntil,
            manufacturer: map.manufacturer !== -1 ? String(row[map.manufacturer] || "").trim() : "",
            subject: map.subject !== -1 ? String(row[map.subject] || "").trim() : "",
            status: "有効",
            updatedAt: new Date().toISOString()
        });
    }

    if (skippedCount > 0) {
        console.log(`[CSV Service] 無効な顧客コードを含む ${skippedCount} 件をスキップしました`);
    }
    return parsedData;
}

function parseExternalOrdersCsv(fileBuffer) {
    let content = iconv.decode(fileBuffer, "Shift_JIS");
    if (content.includes("\ufffd") || (fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb)) {
        content = iconv.decode(fileBuffer, "utf-8");
    }

    const lines = content
        .split(/\r\n|\n|\r/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((v) => String(v || "").trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map((line) => line.split(",").map((v) => String(v || "").trim().replace(/^"|"$/g, "")));

    const headerIndex = (candidates, fallback) => {
        for (const key of candidates) {
            const i = headers.findIndex((h) => h.toLowerCase() === key.toLowerCase());
            if (i >= 0) return i;
        }
        return fallback;
    };

    const idxOrderId = headerIndex(["orderId", "受注番号", "伝票まとめ番号"], 0);
    const idxCustomerId = headerIndex(["customerId", "得意先コード"], 1);
    const idxCustomerName = headerIndex(["customerName", "得意先名"], 2);
    const idxProductCode = headerIndex(["productCode", "商品コード"], 3);
    const idxProductName = headerIndex(["productName", "商品名"], 4);
    const idxPrice = headerIndex(["price", "単価"], 5);
    const idxQty = headerIndex(["quantity", "数量"], 6);
    const idxDate = headerIndex(["orderDate", "受注日"], 7);

    const grouped = new Map();
    for (const row of rows) {
        const orderId = String(row[idxOrderId] || "").trim();
        if (!orderId) continue;
        const customerId = String(row[idxCustomerId] || "").trim();
        const customerName = String(row[idxCustomerName] || "").trim();
        const productCode = String(row[idxProductCode] || "").trim();
        const productName = String(row[idxProductName] || "").trim();
        const price = parseInt(String(row[idxPrice] || "0").replace(/,/g, ""), 10) || 0;
        const quantity = parseInt(String(row[idxQty] || "0").replace(/,/g, ""), 10) || 0;
        const orderDateRaw = String(row[idxDate] || "").trim();
        const orderDate = orderDateRaw || new Date().toISOString();

        if (!grouped.has(orderId)) {
            grouped.set(orderId, {
                orderId,
                customerId,
                customerName: customerName || customerId || "名称不明",
                deliveryInfo: {
                    name: customerName || customerId || "名称不明",
                    note: "外部取込データ"
                },
                items: [],
                totalAmount: 0,
                status: "未発送",
                orderDate,
                source: "external",
                exported_at: null
            });
        }

        const target = grouped.get(orderId);
        if (productCode && quantity > 0) {
            target.items.push({
                code: productCode,
                name: productName || productCode,
                price,
                quantity
            });
            target.totalAmount += price * quantity;
        }
    }

    return Array.from(grouped.values()).filter((o) => Array.isArray(o.items) && o.items.length > 0);
}

function parseShippingCsv(fileBuffer) {
    let content = iconv.decode(fileBuffer, "Shift_JIS");
    if (content.includes("\ufffd") || (fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb)) {
        content = iconv.decode(fileBuffer, "utf-8");
    }

    const lines = content
        .split(/\r\n|\n|\r/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length < 2) return [];

    const parseLine = (line) => line.split(",").map((v) => String(v || "").trim().replace(/^"|"$/g, ""));
    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);

    const records = [];
    for (const row of rows) {
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = row[index] || "";
        });
        records.push(entry);
    }
    return records;
}

module.exports = {
    generateOrdersCsv,
    getDefaultOrderCsvSpec,
    resolveOrderCsvSpec,
    importFlamData,
    parseEstimatesData,
    parseExternalOrdersCsv,
    parseShippingCsv,
    DEFAULT_ESTIMATE_ALIASES,
    DEFAULT_LOGISTICS_COLUMN_INDICES
};
