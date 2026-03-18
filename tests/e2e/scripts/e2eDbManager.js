const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcryptjs");

// ★本番データ保護: E2E は専用ディレクトリのみ使用（プロジェクト直下は触らない）
const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
const E2E_DATA = path.join(PROJECT_ROOT, "tests", "e2e", ".e2e_data");

function abs(rel) {
    return path.join(E2E_DATA, rel);
}

async function seedForE2E() {
    await fs.mkdir(E2E_DATA, { recursive: true });
    await fs.mkdir(path.join(E2E_DATA, "logs"), { recursive: true });

    const adminPassword = await bcrypt.hash("AdminPass123!", 10);
    const customerPassword = await bcrypt.hash("CustPass123!", 10);

    const admins = [
        {
            adminId: "test-admin",
            password: adminPassword,
            name: "E2E管理者"
        }
    ];

    const customers = [
        {
            customerId: "TEST001",
            password: customerPassword,
            customerName: "E2E顧客",
            priceRank: "A",
            email: "e2e-customer@example.com"
        }
    ];

    const products = [
        {
            productCode: "P001",
            name: "E2Eテスト商品A",
            manufacturer: "E2Eメーカー",
            category: "純正",
            basePrice: 1200,
            stockStatus: "即納",
            active: true
        },
        {
            productCode: "P002",
            name: "E2Eテスト商品B",
            manufacturer: "E2Eメーカー",
            category: "純正",
            basePrice: 2200,
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
        P002: { A: 2000, B: 2100 }
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
        announcements: [
            {
                id: "e2e-general-ann",
                title: "E2E一般お知らせ",
                body: "これはE2E検証用の一般お知らせです。",
                type: "info",
                target: "customer",
                category: "general",
                enabled: true,
                startDate: null,
                endDate: null,
                linkUrl: "",
                linkText: ""
            },
            {
                id: "e2e-order-ann",
                title: "E2E注文関連バナー",
                body: "これはE2E検証用の注文関連バナーです。",
                type: "warning",
                target: "customer",
                category: "order",
                enabled: true,
                startDate: null,
                endDate: null,
                linkUrl: "",
                linkText: ""
            }
        ],
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
    await fs.writeFile(abs("invite_tokens.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.writeFile(abs("proxy_requests.json"), JSON.stringify({}, null, 2), "utf-8");
    await fs.mkdir(abs("logs"), { recursive: true });
    await fs.writeFile(abs("logs/admin-auth.json"), JSON.stringify([], null, 2), "utf-8");
    await fs.writeFile(abs("logs/customer-auth.json"), JSON.stringify([], null, 2), "utf-8");
}

// 後方互換: 本番データを触らないため backup/restore は no-op（E2E は .e2e_data のみ使用）
async function backup() {
    console.log("[E2E] backup skipped (using dedicated .e2e_data only).");
}
async function restore() {
    console.log("[E2E] restore skipped (no project root data was changed).");
}

module.exports = {
    backup,
    restore,
    seedForE2E
};
