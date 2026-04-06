/**
 * products.json / customers.json が空（または未作成）のときだけ、連携確認用の最小サンプルを投入する。
 * 本番 (NODE_ENV=production) では実行しない。
 *
 *   npm run seed:erp-dev
 */
try {
    require("dotenv").config();
} catch (_) {
    /* optional */
}

const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcryptjs");
const { dbPath } = require("../dbPaths");

async function readJsonArray(file) {
    const p = dbPath(file);
    try {
        const raw = await fs.readFile(p, "utf8");
        const j = JSON.parse(raw);
        return Array.isArray(j) ? j : [];
    } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
    }
}

async function writeJson(file, data) {
    const p = dbPath(file);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
    if (process.env.NODE_ENV === "production") {
        console.error("[seed:erp-dev] 本番環境では実行しません。");
        process.exit(1);
    }

    let wrote = false;

    const products = await readJsonArray("products.json");
    if (products.length === 0) {
        const sample = [
            {
                productCode: "ERP-DEMO-001",
                name: "連携サンプル商品A",
                manufacturer: "",
                category: "サンプル",
                basePrice: 1000,
                stockStatus: "即納",
                active: true,
                rankPrices: {}
            },
            {
                productCode: "ERP-DEMO-002",
                name: "連携サンプル商品B",
                manufacturer: "",
                category: "サンプル",
                basePrice: 2500,
                stockStatus: "即納",
                active: true,
                rankPrices: {}
            }
        ];
        await writeJson("products.json", sample);
        console.log("[seed:erp-dev] products.json にサンプル 2 件を書き込みました。");
        wrote = true;
    } else {
        console.log("[seed:erp-dev] products.json は既にデータがあるためスキップしました。");
    }

    const customers = await readJsonArray("customers.json");
    if (customers.length === 0) {
        const hash = await bcrypt.hash("CustPass123!", 10);
        const sampleCust = [
            {
                customerId: "ERP-DEMO-01",
                password: hash,
                customerName: "連携サンプル得意先",
                priceRank: "A",
                email: "erp-demo@example.local"
            }
        ];
        await writeJson("customers.json", sampleCust);
        console.log("[seed:erp-dev] customers.json にサンプル 1 件を書き込みました（ログイン試験用パスワード: CustPass123!）。");
        wrote = true;
    } else {
        console.log("[seed:erp-dev] customers.json は既にデータがあるためスキップしました。");
    }

    if (!wrote) {
        console.log("[seed:erp-dev] 変更なし。空のマスタが無いため何もしませんでした。");
    }
}

main().catch((e) => {
    console.error("[seed:erp-dev]", e);
    process.exit(1);
});
