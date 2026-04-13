// services/priceService.js
// 価格管理（個別特価・ランク価格表）の実務ロジックを担当
const path = require("path");
const fs = require("fs").promises;
const ExcelJS = require("exceljs");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");
const settingsService = require("./settingsService");
const { parsePriceCell, normalizeManufacturerKey } = require("./priceManufacturerNormalize");

// DBパス設定
const PRICES_DB_PATH = dbPath("prices.json");             // 個別特価
const RANK_PRICES_DB_PATH = dbPath("rank_prices.json");   // ランク価格
const RANK_PRICES_UPDATED_AT_PATH = dbPath("rank_prices_updated_at.json"); // ランク価格の最終更新日時（商品コード → タイムスタンプ）
const PRODUCTS_DB_PATH = dbPath("products.json");         // 商品マスタ(名称参照用)
const CUSTOMERS_DB_PATH = dbPath("customers.json");       // 顧客マスタ(名称参照用)

class PriceService {

    // 共通: JSON読み込みヘルパー
    async _loadJson(filePath) {
        try {
            const data = await fs.readFile(filePath, "utf-8");
            return JSON.parse(data);
        } catch (error) {
            console.error(`[PriceService] Load Error (${path.basename(filePath)}):`, error);
            return []; // エラー時は空配列または空オブジェクトを返す
        }
    }

    // 1. 個別特価の更新 (単一)
    async updateSpecialPrice(customerId, productCode, newPrice) {
        const priceList = await this._loadJson(PRICES_DB_PATH);
        const index = priceList.findIndex(p => p.customerId === customerId && p.productCode === productCode);
        
        if (index !== -1) {
            priceList[index].specialPrice = parseInt(newPrice);
        } else {
            priceList.push({ 
                customerId, 
                productCode, 
                specialPrice: parseInt(newPrice) 
            });
        }
        
        await fs.writeFile(PRICES_DB_PATH, JSON.stringify(priceList, null, 2));
        return { success: true, message: "価格を保存しました" };
    }

    // 3. 個別特価の削除
    async deleteSpecialPrice(customerId, productCode) {
        let priceList = await this._loadJson(PRICES_DB_PATH);
        const initialLength = priceList.length;
        
        priceList = priceList.filter(p => !(p.customerId === customerId && p.productCode === productCode));

        if (priceList.length === initialLength) {
            return { success: false, message: "対象データが見つかりませんでした" };
        }

        await fs.writeFile(PRICES_DB_PATH, JSON.stringify(priceList, null, 2));
        return { success: true, message: "特価設定を削除しました" };
    }

    // 4. 特定顧客の現在価格取得 (Base vs Special)
    async getPriceForAdmin(customerId, productCode) {
        const [priceList, productMaster] = await Promise.all([
            this._loadJson(PRICES_DB_PATH),
            this._loadJson(PRODUCTS_DB_PATH)
        ]);

        const specialEntry = priceList.find(p => p.customerId === customerId && p.productCode === productCode);
        const product = productMaster.find(p => p.productCode === productCode);
        const basePrice = product ? product.basePrice : 0;

        return {
            success: true,
            currentPrice: specialEntry ? specialEntry.specialPrice : basePrice,
            isSpecial: !!specialEntry
        };
    }

    // 5. 特定顧客の特価リスト全取得 (名称付き)
    async getCustomerPriceList(customerId) {
        const [priceList, productMaster] = await Promise.all([
            this._loadJson(PRICES_DB_PATH),
            this._loadJson(PRODUCTS_DB_PATH)
        ]);

        const customerPrices = priceList.filter(p => p.customerId === customerId);

        return customerPrices.map(cp => {
            const product = productMaster.find(p => p.productCode === cp.productCode);
            return {
                productCode: cp.productCode,
                productName: product ? product.name : "不明な商品",
                basePrice: product ? product.basePrice : 0,
                specialPrice: cp.specialPrice
            };
        });
    }

    // 6. 全特価リスト取得 (管理画面一覧用・名称結合)
    async getAllSpecialPrices() {
        const [priceList, products, customers] = await Promise.all([
            this._loadJson(PRICES_DB_PATH),
            this._loadJson(PRODUCTS_DB_PATH),
            this._loadJson(CUSTOMERS_DB_PATH)
        ]);

        return priceList.map(p => {
            const product = products.find(prod => prod.productCode === p.productCode);
            const customer = customers.find(cust => cust.customerId === p.customerId);
            return {
                customerId: p.customerId,
                customerName: customer ? customer.customerName : "（削除された顧客）",
                productCode: p.productCode,
                productName: product ? product.name : "（削除された商品）",
                specialPrice: p.specialPrice
            };
        });
    }

    // 6.5. ランク価格の保存（管理画面からの直接保存）
    async saveRankPrices(body) {
        const data = body && typeof body === "object" ? body : {};
        const map = data.rows && Array.isArray(data.rows) ? data.rows : data;
        let rankPriceMap = {};
        if (Array.isArray(map)) {
            map.forEach(row => {
                const code = String(row.productCode || row.code || row[0] || "").trim();
                if (!code) return;
                const prices = row.prices || row.ranks || row;
                if (typeof prices === "object" && !Array.isArray(prices)) {
                    const p = {};
                    Object.keys(prices).forEach(k => {
                        const v = prices[k];
                        if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) p[k] = parseInt(v);
                    });
                    if (Object.keys(p).length) rankPriceMap[code] = p;
                }
            });
        } else if (typeof map === "object") {
            rankPriceMap = map;
        }
        await fs.writeFile(RANK_PRICES_DB_PATH, JSON.stringify(rankPriceMap, null, 2));
        const now = Date.now();
        let updatedAt = {};
        try {
            const atData = await fs.readFile(RANK_PRICES_UPDATED_AT_PATH, "utf-8");
            updatedAt = JSON.parse(atData);
        } catch (e) { updatedAt = {}; }
        Object.keys(rankPriceMap).forEach(code => { updatedAt[code] = now; });
        await fs.writeFile(RANK_PRICES_UPDATED_AT_PATH, JSON.stringify(updatedAt, null, 2));
        return { success: true };
    }

    /**
     * 商品マスタ一括取込後: products.json のランク価格と rank_prices.json を同期する
     * （価格表DL・顧客側のマージは rank_prices を参照するため、ここを更新しないと反映されない）
     * @param {Array<{ productCode: string, rankPrices: Record<string, number> }>} entries
     * @param {number} timestamp
     */
    async mergeRankPricesFromMasterImport(entries, timestamp) {
        if (!Array.isArray(entries) || entries.length === 0) return;
        const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
        await runWithJsonFileWriteLock(RANK_PRICES_DB_PATH, async () => {
            let rankPriceMap = {};
            try {
                rankPriceMap = JSON.parse(await fs.readFile(RANK_PRICES_DB_PATH, "utf-8"));
            } catch (e) {
                rankPriceMap = {};
            }
            let updatedAt = {};
            try {
                updatedAt = JSON.parse(await fs.readFile(RANK_PRICES_UPDATED_AT_PATH, "utf-8"));
            } catch (e) {
                updatedAt = {};
            }
            entries.forEach((ent) => {
                const code = String(ent && ent.productCode != null ? ent.productCode : "").trim();
                const rp = ent && ent.rankPrices && typeof ent.rankPrices === "object" ? ent.rankPrices : {};
                if (!code || Object.keys(rp).length === 0) return;
                rankPriceMap[code] = { ...rp };
                updatedAt[code] = ts;
            });
            await fs.writeFile(RANK_PRICES_DB_PATH, JSON.stringify(rankPriceMap, null, 2));
            await fs.writeFile(RANK_PRICES_UPDATED_AT_PATH, JSON.stringify(updatedAt, null, 2));
        });
    }

    /** ランク価格表の商品別最終更新日時（マスタ全件DLの時系列マージ用） */
    async getRankPricesUpdatedAt() {
        try {
            const data = await fs.readFile(RANK_PRICES_UPDATED_AT_PATH, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    }

    // 6.6. ランク価格一覧取得（管理画面用）
    async getRankPrices() {
        try {
            const data = await fs.readFile(RANK_PRICES_DB_PATH, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    }

    // 7. 指定ランクの価格表CSV生成（メール添付・配布用）※取り込みExcel(rank_prices)に存在する商品のみ
    // 並び順: 1.純正（メーカー名順）→ 2.再生 → 3.汎用 → 4.海外純正。メーカー列はメーカー名、商品名から「商品コード」表記は除去。
    async getPricelistCsvForRank(rank) {
        const [productMaster, rankPriceMap, fmt] = await Promise.all([
            this._loadJson(PRODUCTS_DB_PATH),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").then(d => JSON.parse(d)).catch(() => ({})),
            settingsService.getPriceListFormatConfig()
        ]);

        const masterByCode = (productMaster || []).reduce((acc, p) => { acc[p.productCode] = p; return acc; }, {});

        const headers = fmt.csvHeaderLine.endsWith("\n") ? fmt.csvHeaderLine : `${fmt.csvHeaderLine}\n`;
        const headerFirstLine = String(headers.split(/\r?\n/).find((l) => l.trim()) || "");
        const headerCols = headerFirstLine.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
        const includeRemarksCol = headerCols.length > 0 && headerCols[headerCols.length - 1] === "備考";
        const CATEGORY_ORDER = fmt.categoryOrder;
        const stripToken = fmt.productNameStripFromDisplay || "";
        const splitCat = fmt.manufacturerSplitCategory;
        const rows = [];

        Object.keys(rankPriceMap || {}).forEach(productCode => {
            const rankPrices = rankPriceMap[productCode] || {};
            let price = rankPrices[rank] ?? 0;
            if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 999999999) {
                price = 0;
            } else {
                price = Math.round(price);
            }
            if (price === 0) return;

            const product = masterByCode[productCode] || { productCode, name: productCode, manufacturer: "", category: "", basePrice: 0 };
            const rawName = (product.name || product.productCode || "").trim();
            let displayName = rawName;
            if (stripToken) {
                displayName = rawName.split(stripToken).join("").trim();
            } else {
                displayName = rawName.replace(/商品コード/g, "").trim();
            }
            if (!displayName) displayName = productCode;
            displayName = displayName.replace(/"/g, '""');
            const category = String(product.category || "").trim();
            const manufacturer = String(product.manufacturer || "").trim();
            const basePrice = product.basePrice != null && product.basePrice !== "" ? Number(product.basePrice) : 0;
            const listPriceDisplay = (basePrice === 0 || !Number.isFinite(basePrice)) ? "" : String(Math.round(basePrice));
            const categoryOrder = CATEGORY_ORDER[category] ?? 99;
            const remarks = product.remarks != null ? String(product.remarks) : "";
            rows.push({
                productCode,
                displayName,
                manufacturer,
                listPriceDisplay,
                category,
                price,
                categoryOrder,
                manufacturerSort: normalizeManufacturerKey(manufacturer) || manufacturer,
                remarks
            });
        });

        rows.sort((a, b) => {
            if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
            if (a.category === splitCat) return (a.manufacturerSort || "").localeCompare(b.manufacturerSort || "", "ja");
            return 0;
        });

        const csvRows = rows.map(r => {
            const esc = (v) => String(v).replace(/"/g, '""');
            const listPriceNum = r.listPriceDisplay === "" ? 0 : Number(r.listPriceDisplay);
            const ratePct = listPriceNum > 0 && Number.isFinite(listPriceNum)
                ? (Math.round((r.price / listPriceNum) * 1000) / 10).toFixed(1) + "%"
                : "-";
            let line = `${r.productCode},"${esc(r.manufacturer)}","${r.displayName}",${r.listPriceDisplay},"${esc(r.category)}",${r.price},${ratePct}`;
            if (includeRemarksCol) line += `,"${esc(r.remarks)}"`;
            return line;
        });
        const csvData = "\uFEFF" + headers + csvRows.join("\n");
        const filename = `価格表_ランク${rank}.csv`;
        return { csv: csvData, filename };
    }

    /**
     * 指定ランクの価格表をExcelで生成（メーカー別シート・各シート先頭に送料規定）
     * @returns {Promise<{ buffer: Buffer, filename: string }>}
     */
    async getPricelistExcelForRank(rank) {
        const [productMaster, rankPriceMap, settings, fmt] = await Promise.all([
            this._loadJson(PRODUCTS_DB_PATH),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").then(d => JSON.parse(d)).catch(() => ({})),
            settingsService.getSettings(),
            settingsService.getPriceListFormatConfig()
        ]);
        const shippingRules = (settings && settings.shippingRules) ? settings.shippingRules : {};
        const masterByCode = (productMaster || []).reduce((acc, p) => { acc[p.productCode] = p; return acc; }, {});
        const CATEGORY_ORDER = fmt.categoryOrder;
        const stripToken = fmt.productNameStripFromDisplay || "";
        const splitCat = fmt.manufacturerSplitCategory;
        const sheetNamesByCategory = fmt.sheetNamesByCategory || {};
        const sheetManufacturerSortCategory = fmt.sheetManufacturerSortCategory;
        const sortSheetKey =
            sheetNamesByCategory[sheetManufacturerSortCategory] != null
                ? sheetNamesByCategory[sheetManufacturerSortCategory]
                : sheetManufacturerSortCategory;
        const rows = [];

        Object.keys(rankPriceMap || {}).forEach(productCode => {
            const rankPrices = rankPriceMap[productCode] || {};
            let price = rankPrices[rank] ?? 0;
            if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 999999999) {
                price = 0;
            } else {
                price = Math.round(price);
            }
            if (price === 0) return;

            const product = masterByCode[productCode] || { productCode, name: productCode, manufacturer: "", category: "", basePrice: 0 };
            const rawName = (product.name || product.productCode || "").trim();
            let displayName = rawName;
            if (stripToken) {
                displayName = rawName.split(stripToken).join("").trim();
            } else {
                displayName = rawName.replace(/商品コード/g, "").trim();
            }
            displayName = displayName || productCode;
            const category = String(product.category || "").trim();
            const manufacturer = String(product.manufacturer || "").trim();
            const basePrice = product.basePrice != null && product.basePrice !== "" ? Number(product.basePrice) : 0;
            const listPriceDisplay = (basePrice === 0 || !Number.isFinite(basePrice)) ? "" : String(Math.round(basePrice));
            const listPriceNum = listPriceDisplay === "" ? 0 : Number(listPriceDisplay);
            const ratePct = listPriceNum > 0 && Number.isFinite(listPriceNum)
                ? (Math.round((price / listPriceNum) * 1000) / 10).toFixed(1) + "%"
                : "-";
            const categoryOrder = CATEGORY_ORDER[category] ?? 99;
            const manufacturerDisplay = manufacturer || "その他";
            const manufacturerKey = normalizeManufacturerKey(manufacturerDisplay) || manufacturerDisplay;
            const remarks = product.remarks != null ? String(product.remarks) : "";
            rows.push({
                productCode,
                displayName,
                manufacturer: manufacturerDisplay,
                manufacturerKey: manufacturerKey || "その他",
                listPriceDisplay,
                category,
                price,
                ratePct,
                categoryOrder,
                manufacturerSort: manufacturerKey || manufacturerDisplay,
                remarks
            });
        });

        rows.sort((a, b) => {
            if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
            if (a.category === splitCat) return (a.manufacturerSort || "").localeCompare(b.manufacturerSort || "", "ja");
            return 0;
        });

        const headerRow = Array.isArray(fmt.excelHeaderRow) && fmt.excelHeaderRow.length ? [...fmt.excelHeaderRow] : ["商品ｺｰﾄﾞ", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率", "備考"];
        const bySheet = {};
        rows.forEach((r) => {
            const isSplitByManufacturer = r.category === splitCat;
            const sheetKey = isSplitByManufacturer
                ? (r.manufacturerKey || "その他")
                : (sheetNamesByCategory[r.category] != null ? sheetNamesByCategory[r.category] : "その他");
            const displayName = isSplitByManufacturer ? r.manufacturer : (sheetKey === "その他" ? "その他" : sheetKey);
            if (!bySheet[sheetKey]) bySheet[sheetKey] = { rows: [], displayName, categoryOrder: r.categoryOrder, isSeijou: isSplitByManufacturer };
            bySheet[sheetKey].rows.push(r);
        });

        const workbook = new ExcelJS.Workbook();
        const sheetNamesLower = new Set(); // Excelのシート名は大文字小文字を区別しないため、小文字で重複判定
        const sanitizeSheetName = (name) => {
            let s = String(name).replace(/[\\/:*?\[\]]/g, " ").trim();
            if (s.length > 31) s = s.slice(0, 31);
            if (!s) s = "シート";
            const base = s;
            let n = 0;
            while (sheetNamesLower.has(s.toLowerCase())) {
                n++;
                s = (base.slice(0, 28) + "_" + n).slice(0, 31);
            }
            sheetNamesLower.add(s.toLowerCase());
            return s;
        };

        // シート順: 純正(メーカー名順) → 再生 → 汎用 → 海外純正 → その他
        const sheetKeysSorted = Object.keys(bySheet).sort((a, b) => {
            const ga = bySheet[a];
            const gb = bySheet[b];
            if (ga.categoryOrder !== gb.categoryOrder) return ga.categoryOrder - gb.categoryOrder;
            return (a || "").localeCompare(b || "", "ja");
        });

        const thinBorder = { style: "thin" };

        for (const sheetKey of sheetKeysSorted) {
            const group = bySheet[sheetKey];
            const sheetRows = group.rows;
            const makerDisplay = group.displayName || sheetKey;
            const sheet = workbook.addWorksheet(sanitizeSheetName(makerDisplay), { headerFooter: { firstHeader: "", firstFooter: "" } });
            let rowIndex = 1;
            // 送料規定: 代表表示名・正規化キー・default の順で参照（半角/全角・大小文字の違いを吸収）
            const ruleText = shippingRules[makerDisplay] || shippingRules[sheetKey] || shippingRules["default"] || "";
            const ruleStartRow = rowIndex;
            if (ruleText.trim()) {
                ruleText.split(/\r?\n/).forEach(line => {
                    sheet.getRow(rowIndex).getCell(1).value = line.trim();
                    rowIndex++;
                });
                rowIndex++; // 表との空き行
            }
            const ruleEndRow = ruleText.trim() ? rowIndex - 2 : 0; // 送料規定の最終行（rowIndex-2は空き行の1つ前）

            // addRow はシート末尾に追加するため、ヘッダーは「送料規定の次行」= ruleEndRow+1 に入る（送料なし時は1行目）
            const headerRowIndex = ruleEndRow + 1;
            sheet.addRow(headerRow);
            rowIndex = headerRowIndex + 1;
            // 設定のカテゴリ（既定: 再生）はメーカー名順で並び替え
            const rowsToAdd = sheetKey === sortSheetKey
                ? [...sheetRows].sort((a, b) => (a.manufacturerSort || "").localeCompare(b.manufacturerSort || "", "ja"))
                : sheetRows;
            const colCount = Math.max(1, headerRow.length);
            const padPriceRow = (r) => {
                const base = [r.productCode, r.manufacturer, r.displayName, r.listPriceDisplay, r.category, r.price, r.ratePct];
                const remarksVal = r.remarks != null ? String(r.remarks) : "";
                while (base.length < colCount) {
                    if (base.length === 7) base.push(remarksVal);
                    else base.push("");
                }
                return base.slice(0, colCount);
            };
            rowsToAdd.forEach((r) => {
                sheet.addRow(padPriceRow(r));
                rowIndex++;
            });
            const dataEndRow = rowIndex - 1;

            const defaultWidths = [14, 14, 36, 10, 12, 10, 10, 20];
            for (let c = 1; c <= colCount; c++) {
                sheet.getColumn(c).width = defaultWidths[c - 1] != null ? defaultWidths[c - 1] : 12;
            }

            // ウィンドウ枠の固定: 送料規定＋ヘッダー行までを固定し、縦スクロールしても見出しが残る
            sheet.views = [{ state: "frozen", ySplit: headerRowIndex }];

            // 送料規定エリアに枠線（1列結合の見た目で左端のみ枠）
            if (ruleEndRow >= ruleStartRow) {
                for (let r = ruleStartRow; r <= ruleEndRow; r++) {
                    sheet.getCell(r, 1).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
                }
            }

            // ヘッダー行: 太字・背景色・中央揃え
            for (let c = 1; c <= colCount; c++) {
                const cell = sheet.getCell(headerRowIndex, c);
                cell.font = { bold: true };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
            }

            // データ行: 既定8列レイアウト時は定価(4)・価格(6)・掛率(7)を従来どおり書式設定
            for (let r = headerRowIndex + 1; r <= dataEndRow; r++) {
                for (let c = 1; c <= colCount; c++) {
                    const cell = sheet.getCell(r, c);
                    cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
                    if (c === 6 && colCount >= 6) {
                        cell.numFmt = "#,##0";
                        cell.alignment = { horizontal: "right", vertical: "middle" };
                    } else if (c === 4 && colCount >= 4) {
                        const v = cell.value;
                        if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(String(v).trim()))) {
                            cell.numFmt = "#,##0";
                            cell.alignment = { horizontal: "right", vertical: "middle" };
                        } else {
                            cell.alignment = { vertical: "middle", wrapText: true };
                        }
                    } else if (c === 7 && colCount >= 7) {
                        cell.alignment = { horizontal: "center", vertical: "middle" };
                    } else {
                        cell.alignment = { vertical: "middle", wrapText: true };
                    }
                }
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `価格表_ランク${rank}.xlsx`;
        return { buffer: Buffer.from(buffer), filename };
    }
}

module.exports = new PriceService();