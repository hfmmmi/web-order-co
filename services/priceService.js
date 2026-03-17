// services/priceService.js
// 価格管理（個別特価・ランク価格表）の実務ロジックを担当
const path = require("path");
const fs = require("fs").promises;
const ExcelJS = require("exceljs");
const { readToRowArrays } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");
const settingsService = require("./settingsService");

// DBパス設定
const PRICES_DB_PATH = dbPath("prices.json");             // 個別特価
const RANK_PRICES_DB_PATH = dbPath("rank_prices.json");   // ランク価格
const RANK_PRICES_UPDATED_AT_PATH = dbPath("rank_prices_updated_at.json"); // ランク価格の最終更新日時（商品コード → タイムスタンプ）
const PRODUCTS_DB_PATH = dbPath("products.json");         // 商品マスタ(名称参照用)
const CUSTOMERS_DB_PATH = dbPath("customers.json");       // 顧客マスタ(名称参照用)

/** Excelセル値から整数円を取得。小数・文字列・浮動小数点誤差を安全に整数に丸める。上限 999,999,999 円 */
function parsePriceCell(val) {
    if (val === "" || val === undefined || val === null) return null;
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return null;
    const rounded = Math.round(n);
    return rounded <= 999999999 ? rounded : null;
}

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

    // 1. ランク価格 Excel一括更新（ヘッダー行から「商品コード」列・「ランク1」～「ランクN」列を自動判定）
    async updateRankPricesFromExcel(fileBuffer) {
        try {
            const jsonData = await readToRowArrays(fileBuffer, { sheetName: "Upload" });
            if (!jsonData.length) {
                return { success: false, message: "シートにデータがありません" };
            }

            const headerRow = jsonData[0].map(c => String(c || "").trim());

            // ヘッダーから「商品コード」「商品名」列のインデックスを取得
            const codeColIndex = headerRow.findIndex(h => h === "商品コード" || h.includes("商品コード"));
            if (codeColIndex === -1) {
                return { success: false, message: "ヘッダーに「商品コード」列が見つかりません" };
            }
            const nameColIndex = headerRow.findIndex(h => h === "商品名" || (String(h || "").trim() && h.includes("商品名")));

            // ヘッダーからランク列を取得（システム設定の表示名・ランク1/ランクA 形式に対応）
            const [rankIds, rankList] = await Promise.all([settingsService.getRankIds(), settingsService.getRankList()]);
            const rankCols = [];
            headerRow.forEach((h, index) => {
                const label = String(h || "").trim();
                if (!label) return;
                let rankKey = null;
                const byDisplayName = (rankList || []).find(r => r.name && String(r.name).trim() === label);
                if (byDisplayName && byDisplayName.id && rankIds.includes(byDisplayName.id)) {
                    rankKey = byDisplayName.id;
                } else {
                    const rankNum = label.match(/^ランク(\d+)$/);
                    const rankLetter = label.match(/^ランク([A-Z])$/i);
                    if (rankNum) {
                        const oneBased = parseInt(rankNum[1], 10);
                        rankKey = rankIds[oneBased - 1] || null;
                    } else if (rankLetter) {
                        const letter = rankLetter[1].toUpperCase();
                        if (rankIds.includes(letter)) rankKey = letter;
                    }
                }
                if (rankKey) rankCols.push({ index, rankKey });
            });
            if (rankCols.length === 0) {
                return { success: false, message: "ヘッダーにランク列（ランク1/ランクA またはシステム設定のランク名）が見つかりません" };
            }

            // 既存データの読み込み (Object形式)
            let rankPriceMap = {};
            try {
                const data = await fs.readFile(RANK_PRICES_DB_PATH, "utf-8");
                rankPriceMap = JSON.parse(data);
            } catch (e) { rankPriceMap = {}; }

            let productMaster = [];
            try {
                const data = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
                productMaster = JSON.parse(data);
            } catch (e) { productMaster = []; }

            let updateCount = 0;
            let nameUpdateCount = 0;

            // データ処理（2行目以降）
            jsonData.slice(1).forEach(row => {
                const code = String(row[codeColIndex] != null ? row[codeColIndex] : "").trim();
                if (!code) return;

                const prices = {};
                rankCols.forEach(({ index, rankKey }) => {
                    const num = parsePriceCell(row[index]);
                    if (num !== null) prices[rankKey] = num;
                });

                rankPriceMap[code] = prices;
                updateCount++;

                // Excelに「商品名」列がある場合、取り込みのたびに全件ともExcelの商品名で上書き（常に最新に同期）
                if (nameColIndex >= 0 && Array.isArray(productMaster)) {
                    const raw = row[nameColIndex];
                    const trimmed = raw != null ? String(raw).trim() : "";
                    const excelName = (trimmed !== "" && !/^#(NAME\?|VALUE!|REF!|DIV\/0!|NULL!|NA\(\)|NUM!|ERROR\?)$/i.test(trimmed))
                        ? trimmed
                        : "";
                    const product = productMaster.find(p => p.productCode === code);
                    if (product) {
                        product.name = excelName;
                        nameUpdateCount++;
                    }
                }
            });

            await fs.writeFile(RANK_PRICES_DB_PATH, JSON.stringify(rankPriceMap, null, 2));
            const now = Date.now();
            let updatedAt = {};
            try {
                const atData = await fs.readFile(RANK_PRICES_UPDATED_AT_PATH, "utf-8");
                updatedAt = JSON.parse(atData);
            } catch (e) { updatedAt = {}; }
            jsonData.slice(1).forEach(row => {
                const code = String(row[codeColIndex] != null ? row[codeColIndex] : "").trim();
                if (code) updatedAt[code] = now;
            });
            await fs.writeFile(RANK_PRICES_UPDATED_AT_PATH, JSON.stringify(updatedAt, null, 2));
            if (nameUpdateCount > 0) {
                await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(productMaster, null, 2));
            }
            const msg = nameUpdateCount > 0
                ? `ランク価格: ${updateCount}件を更新しました（商品名を${nameUpdateCount}件反映しました）`
                : `ランク価格: ${updateCount}件を更新しました`;
            return { success: true, message: msg };

        } catch (error) {
            console.error("[PriceService] Rank Update Error:", error);
            throw error;
        }
    }

    // 2. 個別特価の更新 (単一)
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
        const [productMaster, rankPriceMap] = await Promise.all([
            this._loadJson(PRODUCTS_DB_PATH),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").then(d => JSON.parse(d)).catch(() => ({}))
        ]);

        const masterByCode = (productMaster || []).reduce((acc, p) => { acc[p.productCode] = p; return acc; }, {});

        // ヘッダー順: 商品ｺｰﾄﾞ, メーカー名, 商品名, 定価, 仕様, 価格, 掛率（G列）
        const headers = "商品ｺｰﾄﾞ,メーカー名,商品名,定価,仕様,価格,掛率\n";
        const CATEGORY_ORDER = { "純正": 0, "再生": 1, "汎用": 2, "海外純正": 3 };
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
            const displayName = rawName.replace(/商品コード/g, "").trim().replace(/"/g, '""') || productCode;
            const category = String(product.category || "").trim();
            const manufacturer = String(product.manufacturer || "").trim();
            const basePrice = product.basePrice != null && product.basePrice !== "" ? Number(product.basePrice) : 0;
            const listPriceDisplay = (basePrice === 0 || !Number.isFinite(basePrice)) ? "" : String(Math.round(basePrice));
            const categoryOrder = CATEGORY_ORDER[category] ?? 99;
            rows.push({
                productCode,
                displayName,
                manufacturer,
                listPriceDisplay,
                category,
                price,
                categoryOrder,
                manufacturerSort: manufacturer
            });
        });

        rows.sort((a, b) => {
            if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
            if (a.categoryOrder === 0) return (a.manufacturerSort || "").localeCompare(b.manufacturerSort || "", "ja");
            return 0;
        });

        const csvRows = rows.map(r => {
            const esc = (v) => String(v).replace(/"/g, '""');
            const listPriceNum = r.listPriceDisplay === "" ? 0 : Number(r.listPriceDisplay);
            const ratePct = listPriceNum > 0 && Number.isFinite(listPriceNum)
                ? (Math.round((r.price / listPriceNum) * 1000) / 10).toFixed(1) + "%"
                : "-";
            return `${r.productCode},"${esc(r.manufacturer)}","${r.displayName}",${r.listPriceDisplay},"${esc(r.category)}",${r.price},${ratePct}`;
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
        const [productMaster, rankPriceMap, settings] = await Promise.all([
            this._loadJson(PRODUCTS_DB_PATH),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").then(d => JSON.parse(d)).catch(() => ({})),
            settingsService.getSettings()
        ]);
        const shippingRules = (settings && settings.shippingRules) ? settings.shippingRules : {};
        const masterByCode = (productMaster || []).reduce((acc, p) => { acc[p.productCode] = p; return acc; }, {});
        const CATEGORY_ORDER = { "純正": 0, "再生": 1, "汎用": 2, "海外純正": 3 };
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
            const displayName = rawName.replace(/商品コード/g, "").trim() || productCode;
            const category = String(product.category || "").trim();
            const manufacturer = String(product.manufacturer || "").trim();
            const basePrice = product.basePrice != null && product.basePrice !== "" ? Number(product.basePrice) : 0;
            const listPriceDisplay = (basePrice === 0 || !Number.isFinite(basePrice)) ? "" : String(Math.round(basePrice));
            const listPriceNum = listPriceDisplay === "" ? 0 : Number(listPriceDisplay);
            const ratePct = listPriceNum > 0 && Number.isFinite(listPriceNum)
                ? (Math.round((price / listPriceNum) * 1000) / 10).toFixed(1) + "%"
                : "-";
            const categoryOrder = CATEGORY_ORDER[category] ?? 99;
            rows.push({
                productCode,
                displayName,
                manufacturer: manufacturer || "その他",
                listPriceDisplay,
                category,
                price,
                ratePct,
                categoryOrder,
                manufacturerSort: manufacturer
            });
        });

        rows.sort((a, b) => {
            if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
            if (a.categoryOrder === 0) return (a.manufacturerSort || "").localeCompare(b.manufacturerSort || "", "ja");
            return 0;
        });

        const headerRow = ["商品ｺｰﾄﾞ", "メーカー名", "商品名", "定価", "仕様", "価格", "掛率"];
        const byManufacturer = {};
        rows.forEach(r => {
            const key = r.manufacturer || "その他";
            if (!byManufacturer[key]) byManufacturer[key] = [];
            byManufacturer[key].push(r);
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

        const manufacturerKeys = Object.keys(byManufacturer).sort((a, b) => a.localeCompare(b, "ja"));
        for (const maker of manufacturerKeys) {
            const sheetRows = byManufacturer[maker];
            const sheet = workbook.addWorksheet(sanitizeSheetName(maker), { headerFooter: { firstHeader: "", firstFooter: "" } });
            let rowIndex = 1;
            const ruleText = shippingRules[maker] || shippingRules["default"] || "";
            if (ruleText.trim()) {
                ruleText.split(/\r?\n/).forEach(line => {
                    sheet.getRow(rowIndex).getCell(1).value = line.trim();
                    rowIndex++;
                });
                rowIndex++;
            }
            sheet.addRow(headerRow);
            sheetRows.forEach(r => {
                sheet.addRow([r.productCode, r.manufacturer, r.displayName, r.listPriceDisplay, r.category, r.price, r.ratePct]);
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `価格表_ランク${rank}.xlsx`;
        return { buffer: Buffer.from(buffer), filename };
    }
}

module.exports = new PriceService();