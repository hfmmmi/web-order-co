// services/customerService.js
// 顧客管理に関する実務ロジック（検索・登録・更新・Excel取込）を担当
const fs = require("fs").promises;
const bcrypt = require("bcryptjs");
const { readToRowArrays } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

// DBパス設定
const CUSTOMERS_DB_PATH = dbPath("customers.json");

class CustomerService {

    // 1. 全顧客データの読み込み（内部用）
    async _loadAll() {
        try {
            const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
            return JSON.parse(data);
        } catch (error) {
            console.error("[CustomerService] Load Error:", error);
            return []; // エラー時は空配列を返す（ファイルがない場合など）
        }
    }

    // ★追加: 全顧客取得（API互換性のため）
    // admin-api.js から呼ばれるショートカット
    async getAllCustomers(keyword = "", page = 1) {
        return await this.searchCustomers(keyword, page, 50);
    }

    // 3. 顧客検索（ページネーション対応）
    async searchCustomers(keyword = "", page = 1, limit = 50) {
        const list = await this._loadAll();
        // ★修正: null安全対策 (keywordがundefinedの場合に備える)
        const safeKeyword = (keyword || "").normalize('NFKC').toLowerCase();

        const filtered = list.filter(c => {
            const id = c.customerId ? String(c.customerId).normalize('NFKC').toLowerCase() : "";
            const name = c.customerName ? String(c.customerName).normalize('NFKC').toLowerCase() : "";
            return id.includes(safeKeyword) || name.includes(safeKeyword);
        });

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedItems = filtered.slice(startIndex, endIndex);

        // セキュリティのためパスワードを除外して返す（代理ログイン許可は管理画面表示用）
        const safeList = paginatedItems.map(c => ({
            customerId: c.customerId,
            customerName: c.customerName,
            priceRank: c.priceRank || "",
            email: c.email || "",
            allowProxyLogin: c.allowProxyLogin === true
        }));

        return {
            customers: safeList,
            totalCount: filtered.length,
            currentPage: Number(page),
            totalPages: Math.ceil(filtered.length / limit)
        };
    }

    // 4. 顧客追加
    async addCustomer({ customerId, customerName, password, priceRank, email }) {
        return runWithJsonFileWriteLock(CUSTOMERS_DB_PATH, async () => {
            const list = await this._loadAll();

            if (list.find(c => c.customerId === customerId)) {
                return { success: false, message: "このIDは既に使用されています" };
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newList = [...list, {
                customerId: String(customerId).trim(),
                customerName: String(customerName).trim(),
                password: hashedPassword,
                priceRank: priceRank ? String(priceRank).trim().toUpperCase() : "",
                email: email ? String(email).trim() : ""
            }];

            await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(newList, null, 2));
            return { success: true, message: "顧客を登録しました" };
        });
    }

    // 5. 顧客更新
    async updateCustomer({ customerId, customerName, password, priceRank, email }) {
        return runWithJsonFileWriteLock(CUSTOMERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const index = list.findIndex(c => c.customerId === customerId);

            if (index === -1) {
                return { success: false, message: "顧客が見つかりません" };
            }

            list[index].customerName = String(customerName).trim();
            list[index].priceRank = priceRank ? String(priceRank).trim().toUpperCase() : "";
            list[index].email = email !== undefined ? String(email || "").trim() : (list[index].email || "");

            if (password && String(password).trim() !== "") {
                list[index].password = await bcrypt.hash(String(password).trim(), 10);
            }

            await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "顧客情報を更新しました" };
        });
    }

    // 6. Excel一括取込（exceljs 使用・社外アップロード対応）
    async importFromExcel(fileBuffer) {
        try {
            const jsonData = await readToRowArrays(fileBuffer);

            return runWithJsonFileWriteLock(CUSTOMERS_DB_PATH, async () => {
                let customerList = await this._loadAll();
                let updateCount = 0;
                let addCount = 0;

                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length < 2) continue;

                    const inputId = String(row[0]).trim();
                    const inputPass = String(row[1]).trim();
                    const inputName = row[2] ? String(row[2]).trim() : "名称未設定";
                    const inputRank = row[3] ? String(row[3]).trim().toUpperCase() : "";
                    const inputEmail = row[4] ? String(row[4]).trim() : "";

                    if (!inputId || !inputPass) continue;

                    const hashedPassword = await bcrypt.hash(inputPass, 10);
                    const idx = customerList.findIndex(c => c.customerId === inputId);

                    if (idx !== -1) {
                        customerList[idx].password = hashedPassword;
                        customerList[idx].customerName = inputName;
                        customerList[idx].priceRank = inputRank;
                        if (inputEmail) customerList[idx].email = inputEmail;
                        updateCount++;
                    } else {
                        customerList.push({
                            customerId: inputId,
                            password: hashedPassword,
                            customerName: inputName,
                            priceRank: inputRank,
                            email: inputEmail
                        });
                        addCount++;
                    }
                }

                await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(customerList, null, 2));
                return { success: true, message: `取込成功: 更新${updateCount}件 / 新規${addCount}件` };
            });

        } catch (error) {
            console.error("[CustomerService] Import Error:", error);
            // エラーを投げてAPI側でキャッチさせる
            throw new Error("Excelファイルの読み込みに失敗しました: " + error.message);
        }
    }

    // ★New: 7. パスワード更新専用（ユーザー初期設定用）
    async updateCustomerPassword(customerId, newPassword) {
        return runWithJsonFileWriteLock(CUSTOMERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const index = list.findIndex(c => c.customerId === customerId);

            if (index === -1) {
                return { success: false, message: "IDが見つかりません" };
            }

            const hashedPassword = await bcrypt.hash(String(newPassword).trim(), 10);
            list[index].password = hashedPassword;

            await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "パスワード設定が完了しました" };
        });
    }

    // 8. 顧客IDで1件取得（メール送信用など、email含む。代理ログイン許可フラグ含む）
    async getCustomerById(customerId) {
        const list = await this._loadAll();
        const c = list.find(x => x.customerId === customerId);
        if (!c) return null;
        return {
            customerId: c.customerId,
            customerName: c.customerName,
            priceRank: c.priceRank || "",
            email: c.email || "",
            allowProxyLogin: c.allowProxyLogin === true
        };
    }

    /**
     * 販管連携: 表示・価格系のみ部分更新（パスワードは変更しない）
     * @param {{ customerId: string, customerName?: string, email?: string, priceRank?: string, idempotencyKey?: string, syncVersion?: number }} payload
     */
    async applyIntegrationCustomerPatch(payload) {
        const {
            customerId,
            customerName,
            email,
            priceRank,
            idempotencyKey,
            syncVersion
        } = payload || {};

        return runWithJsonFileWriteLock(CUSTOMERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const index = list.findIndex((c) => c.customerId === customerId);

            if (index === -1) {
                return { success: false, message: "顧客が見つかりません" };
            }

            const row = list[index];
            const key = idempotencyKey ? String(idempotencyKey).trim() : "";
            if (key && row.erpSync && row.erpSync.lastIdempotencyKey === key) {
                return { success: true, idempotent: true, message: "既に適用済みです" };
            }

            if (customerName !== undefined) {
                list[index].customerName = String(customerName).trim();
            }
            if (email !== undefined) {
                list[index].email = String(email || "").trim();
            }
            if (priceRank !== undefined) {
                list[index].priceRank = priceRank ? String(priceRank).trim().toUpperCase() : "";
            }

            list[index].erpSync = {
                ...(row.erpSync || {}),
                source: "integration",
                lastAt: new Date().toISOString(),
                ...(syncVersion !== undefined && Number.isFinite(Number(syncVersion))
                    ? { syncVersion: Number(syncVersion) }
                    : {}),
                ...(key ? { lastIdempotencyKey: key } : {})
            };

            await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "顧客情報を更新しました" };
        });
    }

    /**
     * 販管連携用: 顧客スナップショット（パスワード等は含まない）
     * @param {{ limit?: string|number }} opts
     */
    async getCustomersSnapshotForIntegration(opts = {}) {
        const raw = await this._loadAll();
        const list = Array.isArray(raw) ? raw : [];
        const lim = Math.min(Math.max(1, parseInt(String(opts.limit), 10) || 2000), 5000);
        const slice = list.slice(0, lim);
        const customers = slice.map((c) => ({
            customerId: c.customerId,
            customerName: c.customerName,
            email: c.email || "",
            priceRank: c.priceRank || "",
            allowProxyLogin: c.allowProxyLogin === true
        }));
        return { customers, count: customers.length };
    }

    // 9. 顧客本人による「管理者の代理ログインを許可」の更新（アカウント設定用）
    async updateCustomerAllowProxy(customerId, allowProxyLogin) {
        return runWithJsonFileWriteLock(CUSTOMERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const index = list.findIndex(c => c.customerId === customerId);
            if (index === -1) {
                return { success: false, message: "顧客が見つかりません" };
            }
            list[index].allowProxyLogin = allowProxyLogin === true;
            await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "設定を保存しました" };
        });
    }
}

module.exports = new CustomerService();