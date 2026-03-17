// services/productService.js
// 商品管理に関する実務ロジック（CRUD + Excel取込・CSV取込）を担当
const path = require("path");
const fs = require("fs").promises;
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");
const { readToRowArrays, ExcelJS } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");
const settingsService = require("./settingsService");
const priceService = require("./priceService");

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

    // 2. 商品追加（リクエストから正規化して category 等を確実に保存）
    async addProduct(newProduct) {
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
            basePrice: typeof newProduct.basePrice === "number" && Number.isFinite(newProduct.basePrice) ? Math.max(0, Math.round(newProduct.basePrice)) : 0,
            stockStatus: (newProduct.stockStatus != null && String(newProduct.stockStatus).trim() !== "") ? String(newProduct.stockStatus).trim() : "即納",
            active: newProduct.active !== false,
            rankPrices: (newProduct.rankPrices && typeof newProduct.rankPrices === "object") ? newProduct.rankPrices : {}
        };
        if (Object.keys(normalized.rankPrices || {}).length > 0) {
            normalized.rankPricesUpdatedAt = Date.now();
        }
        productMaster.push(normalized);
        await this._save(productMaster);
        return { success: true };
    }

    // 3. 商品更新
    async updateProduct(updateData) {
        const productMaster = await this.getAllProducts();
        const index = productMaster.findIndex(p => p.productCode === updateData.productCode);

        if (index === -1) {
            return { success: false, message: "商品が見つかりません" };
        }

        productMaster[index] = updateData;
        await this._save(productMaster);
        return { success: true };
    }

    // 4. 商品削除
    async deleteProduct(productCode) {
        const productMaster = await this.getAllProducts();
        const newMaster = productMaster.filter(p => p.productCode !== productCode);
        
        if (productMaster.length === newMaster.length) {
            return { success: false, message: "削除対象が見つかりません" };
        }

        await this._save(newMaster);
        return { success: true };
    }

    /** Base64 または Buffer を受け取り、Excel一括取込を実行（API用） */
    async importProductCsv(fileData) {
        const buffer = typeof fileData === "string"
            ? Buffer.from(fileData, "base64")
            : (Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData));
        return this.importFromExcel(buffer);
    }

    // 5. Excel/CSV 一括取込（1行目ヘッダーで列を判定。商品コード, 商品名, 定価, 仕様, 在庫, メーカー + ランク列）
    async importFromExcel(fileBuffer) {
        try {
            const jsonData = isExcelBuffer(fileBuffer)
                ? await readToRowArrays(fileBuffer)
                : parseCsvToRowArrays(fileBuffer);
            if (!jsonData.length) {
                throw new Error("ファイルにデータがありません。Excel(.xlsx/.xls) または CSV 形式を確認してください。");
            }

            const headerRow = jsonData[0].map(c => String(c ?? "").trim());
            const col = (key) => headerRow.findIndex(h => String(h || "").trim() === key);
            const codeCol = col("商品コード");
            if (codeCol === -1) {
                throw new Error("ヘッダーに「商品コード」列が見つかりません。");
            }
            const nameCol = col("商品名");
            const priceCol = col("定価");
            const categoryCol = headerRow.findIndex(h => {
                const t = String(h || "").trim();
                return t === "仕様" || t === "規格" || t === "カテゴリ";
            });
            const stockCol = col("在庫");
            const makerCol = col("メーカー");

            const [rankIds, rankList] = await Promise.all([settingsService.getRankIds(), settingsService.getRankList()]);
            const rankCols = [];
            for (let i = 6; i < headerRow.length; i++) {
                const label = String(headerRow[i] ?? "").trim();
                if (!label) continue;
                let rankKey = null;
                if (rankIds.includes(label)) rankKey = label;
                else {
                    const byDisplayName = (rankList || []).find(r => r.name && String(r.name).trim() === label);
                    if (byDisplayName && byDisplayName.id) rankKey = byDisplayName.id;
                    else {
                        const rankLetter = label.match(/^ランク([A-Z])$/i);
                        const rankNum = label.match(/^ランク(\d+)$/);
                        if (rankLetter) rankKey = rankLetter[1].toUpperCase();
                        else if (rankNum) rankKey = rankIds[parseInt(rankNum[1], 10) - 1] || null;
                    }
                }
                if (rankKey && rankIds.includes(rankKey)) rankCols.push({ index: i, rankKey });
            }
            if (rankCols.length === 0) {
                rankIds.forEach((rankKey, i) => {
                    const idx = 6 + i;
                    if (idx < headerRow.length) rankCols.push({ index: idx, rankKey });
                });
            }

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
                return { code, basePrice, stockStatus, rankPrices, nameInCsv, maker, category };
            });

            const validRows = (await Promise.all(tasks)).filter(r => r !== null);
            const now = Date.now();

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
                    }
                    if (importedName !== null) existing.name = importedName;
                    updateCount++;
                } else {
                    productMaster.push({
                        productCode: input.code,
                        name: importedName !== null ? importedName : input.code,
                        basePrice: input.basePrice,
                        manufacturer: input.maker != null ? String(input.maker).trim() : "",
                        category: input.category != null ? String(input.category).trim() : "",
                        stockStatus: input.stockStatus,
                        rankPrices: input.rankPrices || {},
                        rankPricesUpdatedAt: hasRankData ? now : undefined
                    });
                    addCount++;
                }
            });

            await this._save(productMaster);
            return { success: true, message: `処理完了: 更新${updateCount}件 / 新規${addCount}件` };

        } catch (error) {
            console.error("[ProductService] Import Error:", error);
            throw error;
        }
    }

    /** 一括取込用テンプレート（ヘッダー: 商品コード, 商品名, メーカー, 定価, 仕様, 在庫 + ランク列） */
    async getProductTemplateBuffer() {
        const rankList = await settingsService.getRankList();
        const headers = ["商品コード", "商品名", "メーカー", "定価", "仕様", "在庫", ...rankList.map(r => r.name)];
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
        sheet.addRow(["商品コード", "商品名", "メーカー", "定価", "仕様", "在庫", ...rankList.map(r => r.name)]);
        for (const p of products) {
            const basePrice = p.basePrice === 0 ? "OPEN" : (p.basePrice || "");
            const stockStatus = (p.stockStatus === "即納" ? "可" : (p.stockStatus || ""));
            const timeProduct = (p.rankPricesUpdatedAt != null && Number.isFinite(p.rankPricesUpdatedAt)) ? p.rankPricesUpdatedAt : 0;
            const timeRank = rankPricesUpdatedAt[p.productCode] != null ? Number(rankPricesUpdatedAt[p.productCode]) : 0;
            const hasProductRank = Object.keys(p.rankPrices || {}).length > 0;
            const useProduct = timeProduct > 0 && timeProduct >= timeRank && hasProductRank;
            const rankFromTable = rankPriceMap[p.productCode] || {};
            const rankFromProduct = p.rankPrices || {};
            const mergedRank = useProduct
                ? { ...rankFromTable, ...rankFromProduct }
                : rankFromTable;
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
                ...rankValues
            ];
            sheet.addRow(row);
        }
        return workbook.xlsx.writeBuffer();
    }

    // 内部用: 保存処理
    async _save(data) {
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(data, null, 2));
    }
}

module.exports = new ProductService();