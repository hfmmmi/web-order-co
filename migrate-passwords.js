// このスクリプトは、既存の「平文パスワード」を「ハッシュ化」して保存し直すためのツールです。
// 実行コマンド: node migrate-passwords.js

const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcryptjs"); // 暗号化ライブラリ
const { dbPath } = require("./dbPaths");

const CUSTOMERS_DB_PATH = dbPath("customers.json");

async function migrate() {
    try {
        console.log("🔄 パスワードの暗号化移行を開始します...");

        // 顧客データ読込
        const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
        const customers = JSON.parse(data);

        // 1件ずつループで暗号化(mapとPromise.allで並列処理)
        const newCustomers = await Promise.all(customers.map(async (customer) => {
            // すでに暗号化されているかチェック(簡易的: $2a$から始まっていればハッシュ済み)
            if (customer.password.startsWith("$2a$")) {
                console.log(`[Skip] ${customer.customerName} はすでに暗号化されています`);
                return customer;
            }

            // 暗号紙実行(コスト10でハッシュ化)、万が一パスワードが空の場合は"default123"を設定する安全策追加
            const plainPass = customer.password || "default123";
            const hashedPassword = await bcrypt.hash(customer.password, 10);
            console.log(`[OK] ${customer.customerName}: ${customer.password} -> ${hashedPassword}`);

            // パスワードを置き換えた新しいオブジェクトを返す
            return {
                ...customer,
                password: hashedPassword
            };
        }));
        // ファイルに上書き保存
        await fs.writeFile(CUSTOMERS_DB_PATH, JSON.stringify(newCustomers, null, 2));
        console.log("✅ 全データの移行が完了しました！");
    } catch (error) {
        console.error("❌ エラー発生:", error);
    }
}

migrate();