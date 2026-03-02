const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcryptjs");

const ROOT = path.join(__dirname, "..", "..", "..");
const TMP_DIR = path.join(ROOT, "tests", "e2e", ".tmp");
const BACKUP_PATH = path.join(TMP_DIR, "db-backup.json");

const TARGET_FILES = [
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
    "invite_tokens.json",
    "proxy_requests.json",
    "logs/admin-auth.json",
    "logs/customer-auth.json"
];

function abs(rel) {
    return path.join(ROOT, rel);
}

async function backup() {
    const payload = {};
    for (const rel of TARGET_FILES) {
        const filePath = abs(rel);
        try {
            payload[rel] = {
                exists: true,
                content: await fs.readFile(filePath, "utf-8")
            };
        } catch (err) {
            if (err && err.code === "ENOENT") {
                payload[rel] = { exists: false, content: "" };
                continue;
            }
            throw err;
        }
    }
    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.writeFile(BACKUP_PATH, JSON.stringify(payload, null, 2), "utf-8");
}

async function restore() {
    let raw;
    try {
        raw = await fs.readFile(BACKUP_PATH, "utf-8");
    } catch (err) {
        if (err && err.code === "ENOENT") return;
        throw err;
    }

    const payload = JSON.parse(raw);
    for (const rel of TARGET_FILES) {
        const snapshot = payload[rel];
        const filePath = abs(rel);
        if (!snapshot || !snapshot.exists) {
            try {
                await fs.unlink(filePath);
            } catch (err) {
                if (!err || err.code !== "ENOENT") throw err;
            }
            continue;
        }
        await fs.writeFile(filePath, snapshot.content, "utf-8");
    }

    await fs.unlink(BACKUP_PATH).catch(() => {});
}

async function seedForE2E() {
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

module.exports = {
    backup,
    restore,
    seedForE2E
};
