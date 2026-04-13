// services/productService.js
// 商品管理に関する実務ロジック（CRUD + Excel取込・CSV取込）を担当
const fs = require("fs").promises;
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");
const { readProductMasterImportRows, ExcelJS } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");
const settingsService = require("./settingsService");
const priceService = require("./priceService");
const { INTEGRATION_SNAPSHOT_MAX_LIMIT } = require("../utils/integrationSnapshotLimit");

// DBパス設定
const PRODUCTS_DB_PATH = dbPath("products.json");

/** xlsx は ZIP 形式のため先頭が PK (0x50 0x4B)。それ以外は CSV として扱う */
function isExcelBuffer(buf) {
    if (!buf || (buf.length !== undefined && buf.length < 2)) return false;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return b[0] === 0x50 && b[1] === 0x4B;
}

/** CSV バッファを行の配列の配列にパース（UTF-8 / Shift_JIS 対応）。readToRowArrays と同じ形で返す */
function parseCsvToRowArrays(buffer) {
    const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (raw.length === 0) return [];
    let content = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
        ? iconv.decode(raw, "utf-8")
        : iconv.decode(raw, "Shift_JIS");
    if (content.includes("\ufffd")) content = iconv.decode(raw, "utf-8");
    const rows = parse(content, {
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true
    });
    return rows.map(row => Array.isArray(row) ? row.map(c => (c == null ? "" : c)) : []);
}

/** 商品マスタの税抜価格・仕入単価など、非負整数円に正規化 */
function normalizeNonNegativeIntPrice(val, fallback = 0) {
    if (typeof val === "number" && Number.isFinite(val)) return Math.max(0, Math.round(val));
    return fallback;
}

/** セル値から整数円を取得。小数・浮動小数点誤差を丸め、上限 999,999,999 円。無効は null */
function parsePriceCell(val) {
    if (val === "" || val === undefined || val === null) return null;
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return null;
    const rounded = Math.round(n);
    return rounded <= 999999999 ? rounded : null;
}

/** Excelのエラー表示（#NAME? 等）や空を除去し、有効な商品名のみ返す。無効な場合は null */
function sanitizeProductName(val) {
    if (val == null) return null;
    const s = String(val).trim();
    if (s === "") return null;
    if (/^#(NAME\?|VALUE!|REF!|DIV\/0!|NULL!|NA\(\)|NUM!|ERROR\?)$/i.test(s)) return null;
    return s;
}

/** 商品マスタの rankPrices と rank_prices.json の採用ルール（マスタ全件Excelと同一） */
function buildMergedRankPricesSource(product, rankPriceMap, rankPricesUpdatedAt) {
    const timeProduct = (product.rankPricesUpdatedAt != null && Number.isFinite(product.rankPricesUpdatedAt))
        ? product.rankPricesUpdatedAt
        : 0;
    const timeRank = rankPricesUpdatedAt[product.productCode] != null
        ? Number(rankPricesUpdatedAt[product.productCode])
        : 0;
    const hasProductRank = Object.keys(product.rankPrices || {}).length > 0;
    const useProduct = timeProduct > 0 && timeProduct >= timeRank && hasProductRank;
    const rankFromTable = rankPriceMap[product.productCode] || {};
    const rankFromProduct = product.rankPrices || {};
    return useProduct ? { ...rankFromTable, ...rankFromProduct } : rankFromTable;
}

function normalizedMergedRankPrices(merged) {
    const out = {};
    for (const k of Object.keys(merged || {})) {
        const v = merged[k];
        if (v == null || v === "") continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) continue;
        const rounded = Math.round(n);
        if (rounded <= 999999999) out[k] = rounded;
    }
    return out;
}

class ProductService {
    
    // 1. 全商品取得
    async getAllProducts() {
        try {
            const data = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
            return JSON.parse(data);
        } catch (error) {
            console.error("[ProductService] Load Error:", error);
            throw new Error("商品データの読み込みに失敗しました");
        }
    }

    /**
     * 管理画面一覧用: rank_prices.json とのマージ済みランク別価格（mergedRankPrices）と remarks を付与
     */
    async getAllProductsForAdmin() {
        const [productMaster, rankPriceMap, rankPricesUpdatedAt] = await Promise.all([
            this.getAllProducts(),
            priceService.getRankPrices(),
            priceService.getRankPricesUpdatedAt()
        ]);
        return productMaster.map((p) => {
            const merged = buildMergedRankPricesSource(p, rankPriceMap, rankPricesUpdatedAt);
            return {
                ...p,
                mergedRankPrices: normalizedMergedRankPrices(merged),
                remarks: p.remarks != null ? String(p.remarks) : ""
            };
        });
    }

    // 2. 商品追加（リクエストから正規化して category 等を確実に保存）
    async addProduct(newProduct) {
        return runWithJsonFileWriteLock(PRODUCTS_DB_PATH, async () => {
            const productMaster = await this.getAllProducts();
            const code = (newProduct && newProduct.productCode != null) ? String(newProduct.productCode).trim() : "";
            if (!code) {
                return { success: false, message: "商品コードは必須です" };
            }
            const exists = productMaster.find(p => p.productCode === code);
            if (exists) {
                return { success: false, message: "この商品コードは既に存在します" };
            }

            const normalized = {
                productCode: code,
                name: (newProduct.name != null && newProduct.name !== "") ? String(newProduct.name).trim() : code,
                manufacturer: (newProduct.manufacturer != null) ? String(newProduct.manufacturer).trim() : "",
                category: (newProduct.category != null) ? String(newProduct.category).trim() : "",
                remarks: (newProduct.remarks != null) ? String(newProduct.remarks).trim() : "",
                basePrice: normalizeNonNegativeIntPrice(newProduct.basePrice, 0),
                purchaseUnitPrice: normalizeNonNegativeIntPrice(newProduct.purchaseUnitPrice, 0),
                stockStatus: (newProduct.stockStatus != null && String(newProduct.stockStatus).trim() !== "") ? String(newProduct.stockStatus).trim() : "即納",
                active: newProduct.active !== false,
                rankPrices: (newProduct.rankPrices && typeof newProduct.rankPrices === "object") ? newProduct.rankPrices : {}
            };
            if (Object.keys(normalized.rankPrices || {}).length > 0) {
                normalized.rankPricesUpdatedAt = Date.now();
            }
            productMaster.push(normalized);
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(productMaster, null, 2));
            return { success: true };
        });
    }

    // 3. 商品更新（部分更新可。未指定フィールドは既存値を維持し rankPrices を消さない）
    async updateProduct(updateData) {
        return runWithJsonFileWriteLock(PRODUCTS_DB_PATH, async () => {
            const productMaster = await this.getAllProducts();
            const code = (updateData && updateData.productCode != null) ? String(updateData.productCode).trim() : "";
            const index = productMaster.findIndex(p => p.productCode === code);

            if (index === -1) {
                return { success: false, message: "商品が見つかりません" };
            }

            const cur = productMaster[index];
            const next = { ...cur };

            if (Object.prototype.hasOwnProperty.call(updateData, "name")) {
                const n = updateData.name != null ? String(updateData.name).trim() : "";
                next.name = n || cur.productCode;
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "manufacturer")) {
                next.manufacturer = updateData.manufacturer != null ? String(updateData.manufacturer).trim() : "";
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "category")) {
                next.category = updateData.category != null ? String(updateData.category).trim() : "";
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "remarks")) {
                next.remarks = updateData.remarks != null ? String(updateData.remarks).trim() : "";
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "basePrice")) {
                next.basePrice = normalizeNonNegativeIntPrice(updateData.basePrice, 0);
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "purchaseUnitPrice")) {
                next.purchaseUnitPrice = normalizeNonNegativeIntPrice(updateData.purchaseUnitPrice, 0);
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "stockStatus")) {
                const s = updateData.stockStatus != null ? String(updateData.stockStatus).trim() : "";
                next.stockStatus = s || cur.stockStatus || "即納";
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "active")) {
                next.active = updateData.active !== false;
            }
            if (Object.prototype.hasOwnProperty.call(updateData, "rankPrices")) {
                next.rankPrices = updateData.rankPrices && typeof updateData.rankPrices === "object" ? updateData.rankPrices : {};
                if (Object.keys(next.rankPrices).length > 0) {
                    next.rankPricesUpdatedAt = Date.now();
                } else {
                    delete next.rankPricesUpdatedAt;
                }
            }

            next.productCode = cur.productCode;
            productMaster[index] = next;
            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(productMaster, null, 2));
            return { success: true };
        });
    }

    // 4. 商品削除
    async deleteProduct(productCode) {
        return runWithJsonFileWriteLock(PRODUCTS_DB_PATH, async () => {
            const productMaster = await this.getAllProducts();
            const newMaster = productMaster.filter(p => p.productCode !== productCode);

            if (productMaster.length === newMaster.length) {
                return { success: false, message: "削除対象が見つかりません" };
            }

            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(newMaster, null, 2));
            return { success: true };
        });
    }

    /** Base64 または Buffer を受け取り、Excel一括取込を実行（API用） */
    async importProductCsv(fileData) {
        const buffer = typeof fileData === "string"
            ? Buffer.from(fileData, "base64")
            : (Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData));
        return this.importFromExcel(buffer);
    }

    // 5. Excel/CSV 一括取込（1行目ヘッダーで列を判定。商品コード, 商品名, 定価, 仕様, 在庫, メーカー, 備考 + ランク列。ランク列は列位置自由）
    async importFromExcel(fileBuffer) {
        try {
            let jsonData;
            if (isExcelBuffer(fileBuffer)) {
                jsonData = await readProductMasterImportRows(fileBuffer);
            } else {
                jsonData = parseCsvToRowArrays(fileBuffer);
            }
            if (!jsonData.length) {
                throw new Error("ファイルにデータがありません。Excel(.xlsx/.xls) または CSV 形式を確認してください。");
            }

            const headerRow = jsonData[0].map(c => String(c ?? "").trim());
            const codeCol = headerRow.findIndex(h => h === "商品コード" || (String(h || "").trim() && h.includes("商品コード")));
            if (codeCol === -1) {
                throw new Error("ヘッダーに「商品コード」列が見つかりません。");
            }
            const nameCol = headerRow.findIndex(h => h === "商品名" || (String(h || "").trim() && h.includes("商品名")));
            const priceCol = headerRow.findIndex(h => String(h || "").trim() === "定価");
            const categoryCol = headerRow.findIndex(h => {
                const t = String(h || "").trim();
                return t === "仕様" || t === "規格" || t === "カテゴリ";
            });
            const stockCol = headerRow.findIndex(h => String(h || "").trim() === "在庫");
            const makerCol = headerRow.findIndex(h => String(h || "").trim() === "メーカー");
            const remarksCol = headerRow.findIndex(h => String(h || "").trim() === "備考");

            const [rankIds, rankList] = await Promise.all([settingsService.getRankIds(), settingsService.getRankList()]);
            const reserved = new Set(
                [codeCol, nameCol, priceCol, categoryCol, stockCol, makerCol, remarksCol].filter((i) => i >= 0)
            );
            const rankCols = [];
            headerRow.forEach((h, index) => {
                if (reserved.has(index)) return;
                const label = String(h || "").trim();
                if (!label) return;
                let rankKey = null;
                const byDisplayName = (rankList || []).find(r => r.name && String(r.name).trim() === label);
                if (byDisplayName && byDisplayName.id && rankIds.includes(byDisplayName.id)) {
                    rankKey = byDisplayName.id;
                } else if (rankIds.includes(label)) {
                    rankKey = label;
                } else {
                    const rankNum = label.match(/^ランク(\d+)$/);
                    const rankLetter = label.match(/^ランク([A-Z])$/i);
                    if (rankNum) {
                        rankKey = rankIds[parseInt(rankNum[1], 10) - 1] || null;
                    } else if (rankLetter) {
                        const letter = rankLetter[1].toUpperCase();
                        if (rankIds.includes(letter)) {
                            rankKey = letter;
                        } else {
                            // 「ランクP」が列名でも、rankCount=5 では内部IDは E で表示名だけ「P」のことがある
                            const bySuffixDisplay = (rankList || []).find(
                                (r) => r && r.name && String(r.name).trim() === letter
                            );
                            if (bySuffixDisplay && bySuffixDisplay.id && rankIds.includes(bySuffixDisplay.id)) {
                                rankKey = bySuffixDisplay.id;
                            }
                        }
                    }
                }
                if (rankKey && rankIds.includes(rankKey)) rankCols.push({ index, rankKey });
            });
            if (rankCols.length === 0) {
                rankIds.forEach((rankKey, i) => {
                    const idx = 6 + i;
                    if (idx < headerRow.length) rankCols.push({ index: idx, rankKey });
                });
            }

            return await runWithJsonFileWriteLock(PRODUCTS_DB_PATH, async () => {
            const productMaster = await this.getAllProducts();
            let updateCount = 0, addCount = 0;

            const tasks = jsonData.slice(1).map(async (row) => {
                const code = String(row[codeCol] != null ? row[codeCol] : "").trim();
                if (!code) return null;

                let basePrice = 0;
                const priceVal = priceCol >= 0 ? row[priceCol] : null;
                const rawPrice = String(priceVal ?? "").trim().toUpperCase();
                if (rawPrice !== "") {
                    if (rawPrice.includes("OPEN")) {
                        basePrice = 0;
                    } else {
                        const parsed = parsePriceCell(priceVal);
                        basePrice = parsed !== null ? parsed : 0;
                    }
                }

                const stockVal = String((stockCol >= 0 ? row[stockCol] : "") ?? "").trim();
                const stockStatus = stockVal === "可" ? "即納" : (stockVal || "即納");
                const rankPrices = {};
                rankCols.forEach(({ index, rankKey }) => {
                    const val = row[index];
                    const price = parsePriceCell(val);
                    if (price !== null) rankPrices[rankKey] = price;
                });

                const nameInCsv = nameCol >= 0 ? row[nameCol] : "";
                const maker = makerCol >= 0 ? row[makerCol] : "";
                const category = categoryCol >= 0 ? String(row[categoryCol] ?? "").trim() : "";
                const remarksVal = remarksCol >= 0 ? String(row[remarksCol] ?? "").trim() : undefined;
                return { code, basePrice, stockStatus, rankPrices, nameInCsv, maker, category, remarksVal };
            });

            const validRows = (await Promise.all(tasks)).filter(r => r !== null);
            const now = Date.now();
            const rankMirrorForPrices = [];

            validRows.forEach(input => {
                const importedName = sanitizeProductName(input.nameInCsv);
                const hasRankData = Object.keys(input.rankPrices || {}).length > 0;
                const idx = productMaster.findIndex(p => p.productCode === input.code);
                if (idx !== -1) {
                    const existing = productMaster[idx];
                    existing.basePrice = input.basePrice;
                    existing.stockStatus = input.stockStatus;
                    existing.manufacturer = input.maker != null ? String(input.maker).trim() : "";
                    existing.category = input.category != null ? String(input.category).trim() : "";
                    if (hasRankData) {
                        existing.rankPrices = input.rankPrices;
                        existing.rankPricesUpdatedAt = now;
                        rankMirrorForPrices.push({ productCode: input.code, rankPrices: { ...input.rankPrices } });
                    }
                    if (importedName !== null) existing.name = importedName;
                    if (input.remarksVal !== undefined) {
                        existing.remarks = input.remarksVal;
                    }
                    updateCount++;
                } else {
                    productMaster.push({
                        productCode: input.code,
                        name: importedName !== null ? importedName : input.code,
                        basePrice: input.basePrice,
                        manufacturer: input.maker != null ? String(input.maker).trim() : "",
                        category: input.category != null ? String(input.category).trim() : "",
                        remarks: input.remarksVal !== undefined ? input.remarksVal : "",
                        stockStatus: input.stockStatus,
                        rankPrices: input.rankPrices || {},
                        rankPricesUpdatedAt: hasRankData ? now : undefined
                    });
                    if (hasRankData) {
                        rankMirrorForPrices.push({ productCode: input.code, rankPrices: { ...input.rankPrices } });
                    }
                    addCount++;
                }
            });

            await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(productMaster, null, 2));
            if (rankMirrorForPrices.length > 0) {
                await priceService.mergeRankPricesFromMasterImport(rankMirrorForPrices, now);
            }
            return { success: true, message: `処理完了: 更新${updateCount}件 / 新規${addCount}件` };
            });

        } catch (error) {
            console.error("[ProductService] Import Error:", error);
            throw error;
        }
    }

    /** 一括取込用テンプレート（ヘッダー: 商品コード, 商品名, メーカー, 定価, 仕様, 在庫 + ランク列） */
    async getProductTemplateBuffer() {
        const rankList = await settingsService.getRankList();
        const headers = ["商品コード", "商品名", "メーカー", "定価", "仕様", "在庫", ...rankList.map(r => r.name), "備考"];
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("商品マスタ");
        sheet.addRow(headers);
        return workbook.xlsx.writeBuffer();
    }

    /** 登録済みマスタ全件を一括取込形式の Excel バッファで返す（設定のランク数・表示名に準拠。ランク価格は時系列で新しい方を採用） */
    async getProductMasterExportBuffer() {
        const [rankList, products, rankPriceMap, rankPricesUpdatedAt] = await Promise.all([
            settingsService.getRankList(),
            this.getAllProducts(),
            priceService.getRankPrices(),
            priceService.getRankPricesUpdatedAt()
        ]);
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("商品マスタ");
        sheet.addRow(["商品コード", "商品名", "メーカー", "定価", "仕様", "在庫", ...rankList.map(r => r.name), "備考"]);
        for (const p of products) {
            const basePrice = p.basePrice === 0 ? "OPEN" : (p.basePrice || "");
            const stockStatus = (p.stockStatus === "即納" ? "可" : (p.stockStatus || ""));
            const mergedRank = buildMergedRankPricesSource(p, rankPriceMap, rankPricesUpdatedAt);
            const rankValues = rankList.map(r => {
                const v = mergedRank[r.id];
                if (v == null || v === "") return "";
                const n = Number(v);
                if (!Number.isFinite(n) || n < 0) return "";
                const rounded = Math.round(n);
                return rounded <= 999999999 ? rounded : "";
            });
            const row = [
                p.productCode || "",
                p.name || "",
                p.manufacturer || "",
                basePrice,
                p.category || "",
                stockStatus,
                ...rankValues,
                p.remarks != null ? String(p.remarks) : ""
            ];
            sheet.addRow(row);
        }
        return workbook.xlsx.writeBuffer();
    }

    /**
     * 販管連携用: 商品マスタのスナップショット（ランク別単価の詳細は含めず basePrice 中心）
     * @param {{ limit?: string|number, activeOnly?: string|boolean }} opts
     */
    async getProductsSnapshotForIntegration(opts = {}) {
        let productMaster;
        try {
            productMaster = await this.getAllProducts();
        } catch {
            return { products: [], count: 0 };
        }
        const list = Array.isArray(productMaster) ? productMaster : [];
        const activeOnly = opts.activeOnly === true || opts.activeOnly === "1" || opts.activeOnly === "true";
        const filtered = activeOnly ? list.filter((p) => p && p.active !== false) : list;
        const rawLim = parseInt(String(opts.limit), 10);
        const lim = Number.isFinite(rawLim) && rawLim >= 1
            ? Math.min(rawLim, INTEGRATION_SNAPSHOT_MAX_LIMIT)
            : filtered.length;
        const slice = filtered.slice(0, lim);
        const products = slice.map((p) => ({
            productCode: p.productCode,
            name: p.name,
            manufacturer: p.manufacturer || "",
            category: p.category || "",
            basePrice: typeof p.basePrice === "number" && Number.isFinite(p.basePrice) ? Math.max(0, Math.round(p.basePrice)) : 0,
            purchaseUnitPrice: normalizeNonNegativeIntPrice(p.purchaseUnitPrice, 0),
            active: p.active !== false,
            stockStatus: p.stockStatus || ""
        }));
        return { products, count: products.length };
    }
}

module.exports = new ProductService();