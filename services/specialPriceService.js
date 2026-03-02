// services/specialPriceService.js
// 【役割】見積データの検索、セキュリティチェック、有効期限判定を行う論理層
const fs = require('fs').promises;
const path = require('path');
const settingsService = require('./settingsService');
const { dbPath } = require("../dbPaths");

// データ保存場所
const ESTIMATES_FILE = dbPath('estimates.json');

/**
 * データをファイルから読み込むヘルパー関数
 * @returns {Promise<Array>} 見積データの配列
 */
async function loadEstimates() {
    try {
        const data = await fs.readFile(ESTIMATES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // ファイルが存在しない場合は空配列を返す
        return [];
    }
}

module.exports = {
    /**
     * CSV/Excelから解析された見積データを保存する
     * @param {Array} newEstimates 解析済みの見積配列
     */
    saveEstimates: async function (newEstimates) {
        // ここでは「全洗い替え」または「追記」の判断が必要ですが、
        // 整合性を保つため、今回はアップロードされたデータで上書き保存します。
        // 必要に応じて既存データとのマージロジックに変更可能です。
        await fs.writeFile(ESTIMATES_FILE, JSON.stringify(newEstimates, null, 2), 'utf-8');
        console.log(`[SpecialPrice] Saved ${newEstimates.length} records.`);
        return { success: true, count: newEstimates.length };
    },

    /**
     * 見積番号と顧客IDに基づいて、有効な特価明細を取得する
     * @param {string} estimateId ユーザーが入力した見積番号
     * @param {string} customerId ログイン中の顧客ID (セキュリティ用)
     * @returns {Promise<Array>} 有効な商品明細のリスト
     */
    getSpecialPrices: async function (estimateId, customerId) {
        const estimates = await loadEstimates();

        const today = new Date();
        today.setHours(0, 0, 0, 0); // 時間は無視して日付のみ比較

        // 見積番号の正規化（先頭のゼロを除去した値も比較用に用意）
        const normalizedInput = estimateId.replace(/^0+/, '');
        
        // 1. まず入力された見積番号でフィルタリング（先頭ゼロなし版もマッチ）
        let matches = estimates.filter(e => {
            const normalizedEstimate = e.estimateId.replace(/^0+/, '');
            return e.estimateId === estimateId || 
                   normalizedEstimate === estimateId ||
                   e.estimateId === normalizedInput ||
                   normalizedEstimate === normalizedInput;
        });

        // ヒットしない場合は即返却
        if (matches.length === 0) return [];

        // 2. セキュリティチェック (Security First)
        // 見積データ内の顧客コードと、セッションの顧客IDが一致するか確認
        const isOwner = matches.some(e => e.customerId === customerId);

        if (!isOwner) {
            console.warn(`[Security] Customer ${customerId} tried to access Estimate ${estimateId} belonging to another.`);
            // 他人の見積番号を入力された場合は「該当なし」として振る舞う（存在を推測させないため）
            return [];
        }

        // 3. 有効期限チェック
        const activeItems = matches.filter(item => {
            // A. 顧客IDの一致確認（厳格チェック）
            if (item.customerId !== customerId) return false;

            // B. 有効期限チェック
            if (item.validUntil) {
                const validDate = new Date(item.validUntil);
                if (validDate < today) return false; // 期限切れ
            }

            return true;
        });

        return activeItems;
    },

    /**
     * メーカー指定で見積データを削除する（管理者用）
     * 商品名（productName）に指定したメーカー名が含まれている見積を削除
     * @param {string} manufacturer 削除するメーカー名（部分一致・大文字小文字区別なし）
     * @returns {Promise<{deletedCount: number}>} 削除件数
     */
    deleteEstimatesByManufacturer: async function (manufacturer) {
        const estimates = await loadEstimates();
        const originalCount = estimates.length;
        
        // 検索用に正規化（大文字小文字を区別しない）
        const searchTerm = manufacturer.toUpperCase();
        
        // 商品名にメーカー名が含まれていない見積のみを残す
        const filtered = estimates.filter(e => {
            const productName = (e.productName || "").toUpperCase();
            return !productName.includes(searchTerm);
        });
        const deletedCount = originalCount - filtered.length;
        
        // 保存
        await fs.writeFile(ESTIMATES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
        console.log(`[SpecialPrice] Deleted ${deletedCount} estimates where productName contains: ${manufacturer}`);
        
        return { deletedCount };
    },

    /**
     * 商品コード指定で見積データを削除する（管理者用）
     * @param {Array<string>} productCodes 削除する商品コードのリスト
     * @returns {Promise<{deletedCount: number}>} 削除件数
     */
    deleteEstimatesByProductCodes: async function (productCodes) {
        const estimates = await loadEstimates();
        const originalCount = estimates.length;
        
        // 指定された商品コードに含まれない見積のみを残す
        const productCodeSet = new Set(productCodes);
        const filtered = estimates.filter(e => !productCodeSet.has(e.productCode));
        const deletedCount = originalCount - filtered.length;
        
        // 保存
        await fs.writeFile(ESTIMATES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
        console.log(`[SpecialPrice] Deleted ${deletedCount} estimates for ${productCodes.length} product codes.`);
        
        return { deletedCount };
    },

    /**
     * 現在の設定を取得する（settingsService 経由）
     */
    getSettings: async function () {
        return await settingsService.getSettings();
    }
};