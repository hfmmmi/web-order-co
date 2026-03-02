// services/priceService.js
// 価格管理（個別特価・ランク価格表）の実務ロジックを担当
const path = require("path");
const fs = require("fs").promises;
const { readToRowArrays } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");

// DBパス設定
const PRICES_DB_PATH = dbPath("prices.json");             // 個別特価
const RANK_PRICES_DB_PATH = dbPath("rank_prices.json");   // ランク価格
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

    // 1. ランク価格 Excel一括更新
    async updateRankPricesFromExcel(fileBuffer) {
        try {
            const jsonData = await readToRowArrays(fileBuffer, { sheetName: "Upload" });
            
            // ファイル形式チェック (簡易)
            const isRankFile = jsonData[0] && String(jsonData[0][0]).includes("商品コード") && jsonData[0].length > 6;
            if (!isRankFile) {
                return { success: false, message: "ファイル形式が認識できません（ランク価格用フォーマットか確認してください）" };
            }

            // 既存データの読み込み (Object形式)
            let rankPriceMap = {};
            try {
                const data = await fs.readFile(RANK_PRICES_DB_PATH, "utf-8");
                rankPriceMap = JSON.parse(data);
            } catch (e) { rankPriceMap = {}; }

            const ranks = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "P"];
            let updateCount = 0;

            // データ処理
            jsonData.slice(1).forEach(row => {
                const code = String(row[0] || "").trim();
                if (!code) return;
                
                const prices = {};
                ranks.forEach((r, i) => {
                    // Excelの列位置: G列(Index 6)からランクA開始と仮定
                    const val = row[6 + i];
                    if (val !== "") {
                        prices[r] = parseInt(String(val).replace(/[^0-9]/g, "")) || 0;
                    }
                });
                
                rankPriceMap[code] = prices;
                updateCount++;
            });

            await fs.writeFile(RANK_PRICES_DB_PATH, JSON.stringify(rankPriceMap, null, 2));
            return { success: true, message: `ランク価格: ${updateCount}件を更新しました` };

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
        return { success: true };
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

    // 7. 指定ランクの価格表CSV生成（メール添付・配布用）
    async getPricelistCsvForRank(rank) {
        const [productMaster, rankPriceMap] = await Promise.all([
            this._loadJson(PRODUCTS_DB_PATH),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").then(d => JSON.parse(d)).catch(() => ({}))
        ]);

        const headers = "商品コード,商品名,メーカー,規格,価格\n";
        const csvRows = [];

        (productMaster || []).forEach(product => {
            const rankPrices = rankPriceMap[product.productCode] || {};
            const price = rankPrices[rank] ?? product.basePrice ?? 0;
            if (price === 0) return;

            const row = `${product.productCode},"${(product.name || "").replace(/"/g, '""')}",${product.manufacturer || ""},${product.category || ""},${price}`;
            csvRows.push(row);
        });

        const csvData = "\uFEFF" + headers + csvRows.join("\n");
        const filename = `価格表_ランク${rank}.csv`;
        return { csv: csvData, filename };
    }
}

module.exports = new PriceService();