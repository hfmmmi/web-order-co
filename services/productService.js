// services/productService.js
// 商品管理に関する実務ロジック（CRUD + Excel取込）を担当
const path = require("path");
const fs = require("fs").promises;
const { readToRowArrays } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");

// DBパス設定
const PRODUCTS_DB_PATH = dbPath("products.json");

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

    // 2. 商品追加
    async addProduct(newProduct) {
        const productMaster = await this.getAllProducts();
        
        const exists = productMaster.find(p => p.productCode === newProduct.productCode);
        if (exists) {
            return { success: false, message: "この商品コードは既に存在します" };
        }

        productMaster.push(newProduct);
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

    // 5. Excel一括取込（exceljs 使用・社外アップロード対応）
    async importFromExcel(fileBuffer) {
        try {
            const jsonData = await readToRowArrays(fileBuffer);

            const productMaster = await this.getAllProducts();
            let updateCount = 0, addCount = 0;
            const ranks = ["A", "B", "C", "D", "E", "F", "G", "P"];

            // 1行目はヘッダーなのでスキップ
            const tasks = jsonData.slice(1).map(async (row) => {
                const code = String(row[0] || "").trim();
                if (!code) return null;

                // 価格処理
                let basePrice = 0;
                const rawPrice = String(row[3] || "").trim().toUpperCase();
                if (rawPrice !== "") {
                    basePrice = rawPrice.includes("OPEN") ? 0 : (parseInt(rawPrice.replace(/[^0-9]/g, "")) || 0);
                }

                // 在庫・ランク価格処理
                const stockStatus = String(row[5] || "").trim() === "可" ? "即納" : String(row[5] || "即納");
                const rankPrices = {};
                ranks.forEach((r, i) => {
                    const val = row[6 + i];
                    if (val && val !== "") rankPrices[r] = parseInt(String(val).replace(/[^0-9]/g, "")) || 0;
                });

                return { code, basePrice, stockStatus, rankPrices, nameInCsv: row[1], maker: row[2] };
            });

            // 非同期処理の結果待ち
            const validRows = (await Promise.all(tasks)).filter(r => r !== null);

            validRows.forEach(input => {
                const idx = productMaster.findIndex(p => p.productCode === input.code);
                if (idx !== -1) {
                    // 更新
                    const existing = productMaster[idx];
                    existing.basePrice = input.basePrice;
                    existing.stockStatus = input.stockStatus;
                    existing.manufacturer = input.maker;
                    existing.rankPrices = input.rankPrices;
                    updateCount++;
                } else {
                    // 新規
                    productMaster.push({
                        productCode: input.code,
                        name: input.nameInCsv,
                        basePrice: input.basePrice,
                        manufacturer: input.maker,
                        stockStatus: input.stockStatus,
                        rankPrices: input.rankPrices
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

    // 内部用: 保存処理
    async _save(data) {
        await fs.writeFile(PRODUCTS_DB_PATH, JSON.stringify(data, null, 2));
    }
}

module.exports = new ProductService();