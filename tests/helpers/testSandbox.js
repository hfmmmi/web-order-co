const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcryptjs");
const { DATA_ROOT } = require("../../dbPaths");

// 業務データではなく「DATA_ROOT 配下」のテスト用DBだけを操作する
// ※ DATA_ROOT は DATA_DIR が指定されていればそのパス、なければプロジェクト直下
// ★安全装置: DATA_DIR を付け忘れて「プロジェクト直下」を触ろうとしたら即エラーにする
const PROJECT_ROOT = path.join(__dirname, "..", "..");
if (DATA_ROOT === PROJECT_ROOT && process.env.ALLOW_REAL_DB_FOR_TESTS !== "1") {
    throw new Error(
        "安全装置: テスト実行前に必ず DATA_DIR をテスト用ディレクトリに設定してください（本番データ保護）。\n" +
        "例: PowerShell で `$env:DATA_DIR = 'tests/_sandbox_data'` と設定してから npm run test:api を実行してください。"
    );
}

const DB_FILES = [
    "admins.json",
    "customers.json",
    "orders.json",
    "settings.json",
    "products.json",
    "prices.json",
    "rank_prices.json",
    "support_tickets.json",
    "estimates.json",
    "login_rate_limit.json",
    "reset_rate_limit.json",
    "reset_tokens.json",
    "admin_reset_tokens.json",
    "invite_tokens.json",
    "proxy_requests.json",
    "kaitori_requests.json",
    "kaitori_master.json",
    "stocks.json",
    "config/stocks-adapters.json",
    "logs/admin-auth.json",
    "logs/customer-auth.json",
    "logs/stocks-history.json"
];

function abs(relPath) {
    return path.join(DATA_ROOT, relPath);
}

async function backupDbFiles() {
    const backup = new Map();
    for (const rel of DB_FILES) {
        const filePath = abs(rel);
        try {
            const content = await fs.readFile(filePath, "utf-8");
            backup.set(rel, { exists: true, content });
        } catch (err) {
            if (err && err.code === "ENOENT") {
                backup.set(rel, { exists: false, content: "" });
                continue;
            }
            throw err;
        }
    }
    return backup;
}

async function restoreDbFiles(backup) {
    for (const [rel, state] of backup.entries()) {
        const filePath = abs(rel);
        if (!state.exists) {
            try {
                await fs.unlink(filePath);
            } catch (err) {
                if (!err || err.code !== "ENOENT") throw err;
            }
            continue;
        }
        await fs.writeFile(filePath, state.content, "utf-8");
    }
}

async function seedBaseData() {
    // 本番環境で誤ってテスト用初期化ロジックを実行しないための安全装置
    if (process.env.NODE_ENV === "production") {
        throw new Error("seedBaseData() must not be run in production (DB reset protection)");
    }

    // CI/ローカル問わず DATA_ROOT が無ければ作成（Git は空ディレクトリを追跡しないため）
    await fs.mkdir(DATA_ROOT, { recursive: true });

    const adminPassword = await bcrypt.hash("AdminPass123!", 10);
    const customerPassword = await bcrypt.hash("CustPass123!", 10);

    const admins = [
        {
            adminId: "test-admin",
            password: adminPassword,
            name: "テスト管理者"
        }
    ];

    const customers = [
        {
            customerId: "TEST001",
            password: customerPassword,
            customerName: "テスト顧客",
            priceRank: "A",
            email: "test001@example.com"
        },
        {
            customerId: "TEST002",
            password: customerPassword,
            customerName: "テスト顧客2",
            priceRank: "B",
            email: "test002@example.com"
        },
        {
            customerId: "TEST003",
            password: customerPassword,
            customerName: "ランク未設定顧客",
            email: "test003@example.com"
        }
    ];

    const products = [
        {
            productCode: "P001",
            name: "テストトナーA",
            manufacturer: "TestMaker",
            category: "純正",
            basePrice: 1200,
            stockStatus: "即納",
            active: true
        },
        {
            productCode: "P002",
            name: "テストトナーB",
            manufacturer: "TestMaker",
            category: "純正",
            basePrice: 2000,
            stockStatus: "即納",
            active: true
        }
    ];

    const prices = [
        {
            customerId: "TEST001",
            productCode: "P001",
            specialPrice: 900
        }
    ];

    const rankPrices = {
        P001: { A: 1000, B: 1100 },
        P002: { A: 1800, B: 1900 }
    };

    const settings = {
        blockedManufacturers: [],
        blockedProductCodes: [],
        mail: {
            smtp: {
                host: "",
                port: 587,
                secure: false,
                user: "",
                password: ""
            },
            from: "",
            orderNotifyTo: "",
            supportNotifyTo: "",
            templates: {}
        },
        features: {
            orders: true,
            kaitori: true,
            support: true,
            cart: true,
            history: true,
            collection: true,
            announcements: true,
            adminKaitori: true,
            adminOrders: true,
            adminProducts: true,
            adminCustomers: true,
            adminPrices: true,
            adminSupport: true
        },
        announcements: [],
        recaptcha: {
            siteKey: "",
            secretKey: ""
        }
    };

    await fs.writeFile(abs("admins.json"), JSON.stringify(admins, null, 2), "utf-8");
    await fs.writeFile(abs("customers.json"), JSON.stringify(customers, null, 2), "utf-8");
    await fs.writeFile(abs("orders.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("settings.json"), JSON.stringify(settings, null, 2), "utf-8");
    await fs.writeFile(abs("products.json"), JSON.stringify(products, null, 2), "utf-8");
    await fs.writeFile(abs("prices.json"), JSON.stringify(prices, null, 2), "utf-8");
    await fs.writeFile(abs("rank_prices.json"), JSON.stringify(rankPrices, null, 2), "utf-8");
    await fs.writeFile(abs("support_tickets.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("estimates.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("login_rate_limit.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("reset_rate_limit.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("reset_tokens.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("admin_reset_tokens.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("invite_tokens.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("proxy_requests.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("kaitori_requests.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("kaitori_master.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("stocks.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.mkdir(abs("config"), { recursive: true });
    await fs.writeFile(abs("config/stocks-adapters.json"), JSON.stringify({
        version: 1,
        updatedAt: null,
        display: {
            enabled: false,
            hiddenMessage: "仕入先直送のため在庫表示は行っておりません",
            showStocklessLabel: true,
            stocklessLabel: "仕入先直送",
            allowOrderingWhenZero: true,
            highlightThresholdMinutes: 180,
            warehousePresets: []
        },
        adapters: []
    }, null, 2), "utf-8");
    await fs.mkdir(abs("logs"), { recursive: true });
    await fs.writeFile(abs("logs/admin-auth.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("logs/customer-auth.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("logs/stocks-history.json"), JSON.stringify([], null, 2), "utf-8");

    const { invalidateSettingsCache } = require("../../services/settingsService");
    invalidateSettingsCache();
}

async function readJson(relPath) {
    const data = await fs.readFile(abs(relPath), "utf-8");
    return JSON.parse(data);
}

async function writeJson(relPath, value) {
    await fs.writeFile(abs(relPath), JSON.stringify(value, null, 2), "utf-8");
}

module.exports = {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
};
