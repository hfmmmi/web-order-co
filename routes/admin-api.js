// routes/admin-api.js
// 管理者機能ルーティング（Logicは /services/ へ移譲済み）
const express = require("express");
const router = express.Router();

// 実務部隊（Services）の召喚
const productService = require("../services/productService");
const customerService = require("../services/customerService");
const priceService = require("../services/priceService");
const orderService = require("../services/orderService"); // 統合版

// ★新規追加: 見積＆CSVロジック部隊
const specialPriceService = require("../services/specialPriceService");
const csvService = require("../services/csvService");
const stockService = require("../services/stockService");
const { createAdapter } = require("../services/stockAdapters");
const settingsService = require("../services/settingsService");
const mailService = require("../services/mailService");
const excelReader = require("../utils/excelReader");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../dbPaths");
const bcrypt = require("bcryptjs");
const { validateBody } = require("../middlewares/validate");
const {
    addCustomerSchema,
    updateCustomerSchema,
    adminSettingsUpdateSchema,
    adminAccountUpdateSchema
} = require("../validators/requestSchemas");

const ADMINS_DB_PATH = dbPath("admins.json");
const INVITE_TOKENS_PATH = dbPath("invite_tokens.json");
const INVITE_EXPIRY_HOURS = 24;
const PROXY_REQUESTS_PATH = dbPath("proxy_requests.json");
const PROXY_REQUEST_EXPIRY_MS = 10 * 60 * 1000; // 10分

async function loadProxyRequests() {
    try {
        const data = await fs.readFile(PROXY_REQUESTS_PATH, "utf-8");
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

async function saveProxyRequests(obj) {
    await fs.writeFile(PROXY_REQUESTS_PATH, JSON.stringify(obj, null, 2));
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

// =================================================================
// 🛡️ ADMIN AUTH MIDDLEWARE (防衛ライン)
// =================================================================
function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) {
        return res.status(401).json({ message: "管理者権限が必要です" });
    }
    next();
}

// =================================================================
// ⚙️ 0. システム設定 (Settings API)
// =================================================================

// 公開用設定（顧客向け features とお知らせ・認証不要）
router.get("/settings/public", async (req, res) => {
    try {
        const settings = await settingsService.getSettings();
        const features = await settingsService.getFeatures();
        const publicFeatures = {
            orders: features.orders !== false,
            kaitori: features.kaitori !== false,
            support: features.support !== false,
            cart: features.cart !== false,
            history: features.history !== false,
            collection: features.collection !== false,
            announcements: features.announcements !== false
        };
        const orderBanners = await settingsService.getAnnouncements("customer", "order");
        const announcements = await settingsService.getAnnouncements("customer");
        const recaptcha = settings.recaptcha || {};
        const recaptchaSiteKey = (recaptcha.siteKey && String(recaptcha.siteKey).trim()) ? String(recaptcha.siteKey).trim() : "";
        const cartShippingNotice = (settings.cartShippingNotice != null && String(settings.cartShippingNotice).trim() !== "")
            ? String(settings.cartShippingNotice)
            : "";
        const publicBranding = await settingsService.getPublicBranding();
        res.json({
            features: publicFeatures,
            orderBanners: Array.isArray(orderBanners) ? orderBanners : [],
            announcements: Array.isArray(announcements) ? announcements : [],
            recaptchaSiteKey: recaptchaSiteKey,
            cartShippingNotice,
            publicBranding
        });
    } catch (e) {
        res.status(500).json({ message: "設定の取得に失敗しました" });
    }
});

// 管理者用設定取得（パスワードは返却せず、設定済みかどうかのみ）
router.get("/admin/settings", requireAdmin, async (req, res) => {
    try {
        const isProduction = process.env.NODE_ENV === "production";
        const envMailPasswordSet = !!String(process.env.MAIL_PASSWORD || "").trim();
        const settings = await settingsService.getSettings();
        const features = await settingsService.getFeatures();
        const mail = settings.mail || {};
        const smtpRaw = mail.smtp || {};
        const hasPassword = isProduction
            ? envMailPasswordSet
            : !!(smtpRaw.password && String(smtpRaw.password).trim());
        const safeMail = {
            smtp: {
                service: smtpRaw.service,
                user: smtpRaw.user || smtpRaw.auth?.user || "",
                host: smtpRaw.host || "",
                port: smtpRaw.port,
                secure: smtpRaw.secure,
                passwordSet: hasPassword,
                passwordManagedByEnv: isProduction
            },
            from: mail.from,
            orderNotifyTo: mail.orderNotifyTo,
            supportNotifyTo: mail.supportNotifyTo,
            templates: mail.templates || {}
        };
        const recaptcha = settings.recaptcha || {};
        res.json({
            blockedManufacturers: settings.blockedManufacturers || [],
            blockedProductCodes: settings.blockedProductCodes || [],
            mail: safeMail,
            features,
            productSchema: settings.productSchema || null,
            announcements: settings.announcements || [],
            recaptcha: {
                siteKey: recaptcha.siteKey || "",
                secretKeySet: !!(recaptcha.secretKey && String(recaptcha.secretKey).trim())
            },
            rankCount: settings.rankCount != null ? Math.min(26, Math.max(1, parseInt(settings.rankCount, 10) || 10)) : 10,
            rankNames: settings.rankNames || {},
            shippingRules: settings.shippingRules || {},
            cartShippingNotice: settings.cartShippingNotice || "",
            dataFormats: settings.dataFormats || {}
        });
    } catch (e) {
        res.status(500).json({ message: "設定の取得に失敗しました" });
    }
});

// 管理者用設定更新
router.put("/admin/settings", requireAdmin, validateBody(adminSettingsUpdateSchema), async (req, res) => {
    try {
        const partial = req.body;
        await settingsService.updateSettings(partial);
        // メール設定変更を次回送信から反映するためキャッシュを破棄
        if (mailService.clearTransporterCache) mailService.clearTransporterCache();
        res.json({ success: true, message: "設定を保存しました" });
    } catch (e) {
        res.status(500).json({ message: e.message || "設定の保存に失敗しました" });
    }
});

// =================================================================
// 👤 管理者アカウント（ID・パスワード・表示名・メール）
// =================================================================
router.get("/admin/account", requireAdmin, async (req, res) => {
    try {
        const data = await fs.readFile(ADMINS_DB_PATH, "utf-8");
        const list = JSON.parse(data);
        if (!Array.isArray(list) || list.length === 0) {
            return res.json({ adminId: "", name: "", passwordSet: false, email: "" });
        }
        const admin = list[0];
        res.json({
            adminId: admin.adminId || "",
            name: admin.name || "",
            passwordSet: !!(admin.password && String(admin.password).trim()),
            email: (admin.email && String(admin.email).trim()) || ""
        });
    } catch (e) {
        if (e.code === "ENOENT") {
            return res.json({ adminId: "", name: "", passwordSet: false, email: "" });
        }
        res.status(500).json({ message: "管理者アカウントの取得に失敗しました" });
    }
});

router.put("/admin/account", requireAdmin, validateBody(adminAccountUpdateSchema), async (req, res) => {
    try {
        const { adminId, name, password, email } = req.body;
        let list = [];
        try {
            const data = await fs.readFile(ADMINS_DB_PATH, "utf-8");
            list = JSON.parse(data);
        } catch (e) {
            if (e.code !== "ENOENT") throw e;
        }
        if (!Array.isArray(list)) list = [];

        let admin = list[0] || null;
        if (!admin) {
            if (!password || password.length < 4) {
                return res.status(400).json({ message: "初回作成時はパスワードを4文字以上で指定してください" });
            }
            admin = { adminId: "", password: "", name: "" };
            list = [admin];
        }

        admin.adminId = adminId;
        if (name !== undefined) admin.name = name;
        if (email !== undefined) admin.email = email === "" ? undefined : email;
        if (password && String(password).trim().length >= 4) {
            admin.password = await bcrypt.hash(String(password).trim(), 10);
        }

        await fs.writeFile(ADMINS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
        res.json({ success: true, message: "管理者アカウントを保存しました" });
    } catch (e) {
        res.status(500).json({ message: e.message || "管理者アカウントの保存に失敗しました" });
    }
});

// =================================================================
// 📦 1. 商品管理 (Product Management)
// =================================================================

// 商品追加
router.post("/add-product", requireAdmin, async (req, res) => {
    try {
        const result = await productService.addProduct(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 管理者用商品一覧
router.get("/admin/products", requireAdmin, async (req, res) => {
    try {
        const data = await productService.getAllProducts();
        res.json(data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 商品更新
router.post("/update-product", requireAdmin, async (req, res) => {
    try {
        const result = await productService.updateProduct(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 商品CSV一括登録
router.post("/upload-product-data", requireAdmin, async (req, res) => {
    try {
        const result = await productService.importProductCsv(req.body.fileData);
        res.json(result);
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: e.message });
    }
});

// 商品マスタ一括取込用テンプレート（ヘッダーのみ）Excel ダウンロード
router.get("/admin/product-master/template", requireAdmin, async (_req, res) => {
    try {
        const buffer = await productService.getProductTemplateBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="product_master_template.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error("Product master template error:", e);
        res.status(500).json({ success: false, message: "テンプレートの生成に失敗しました" });
    }
});

// 商品マスタ全件 Excel ダウンロード（一括取込と同じ形式）
router.get("/admin/product-master/export", requireAdmin, async (_req, res) => {
    try {
        const buffer = await productService.getProductMasterExportBuffer();
        const filename = `product_master_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error("Product master export error:", e);
        res.status(500).json({ success: false, message: "マスタの出力に失敗しました" });
    }
});


// =================================================================
// 👥 2. 顧客管理 (Customer Management)
// =================================================================

// ★修正: 顧客一覧取得 (検索・ページネーション対応)
router.get("/admin/customers", requireAdmin, async (req, res) => {
    try {
        const keyword = req.query.keyword || "";
        const page = parseInt(req.query.page) || 1;
        
        // サービス層の getAllCustomers (または searchCustomers) を呼ぶ
        const result = await customerService.getAllCustomers(keyword, page);
        res.json(result);
    } catch (e) { 
        console.error("Customer Fetch Error:", e);
        res.status(500).json({ message: "取得失敗" }); 
    }
});

// 顧客情報の更新・追加
router.post("/add-customer", requireAdmin, validateBody(addCustomerSchema), async (req, res) => {
    try {
        const result = await customerService.addCustomer(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post("/update-customer", requireAdmin, validateBody(updateCustomerSchema), async (req, res) => {
    try {
        const result = await customerService.updateCustomer(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 招待メール送信（リセット＋メール一括実行）
router.post("/admin/send-invite-email", requireAdmin, async (req, res) => {
    const { customerId, isPasswordReset } = req.body;
    if (!customerId) {
        return res.json({ success: false, message: "顧客IDが指定されていません" });
    }

    try {
        const customer = await customerService.getCustomerById(customerId);
        if (!customer) {
            return res.json({ success: false, message: "顧客が見つかりません" });
        }
        if (!customer.email || !customer.email.trim()) {
            return res.json({ success: false, message: "顧客のメールアドレスが登録されていません。顧客編集でメールアドレスを登録してください。" });
        }

        const tempPassword = crypto.randomBytes(4).toString("hex");
        const result = await customerService.updateCustomerPassword(customerId, tempPassword);
        if (!result.success) {
            return res.json({ success: false, message: result.message });
        }

        // 24時間有効な招待トークンを保存
        let tokens = {};
        try {
            const data = await fs.readFile(INVITE_TOKENS_PATH, "utf-8");
            tokens = JSON.parse(data);
        } catch (e) { tokens = {}; }
        tokens[customerId] = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
        await fs.writeFile(INVITE_TOKENS_PATH, JSON.stringify(tokens, null, 2));

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(customerId)}&key=${encodeURIComponent(tempPassword)}`;
        const mailResult = await mailService.sendInviteEmail(customer, inviteUrl, tempPassword, !!isPasswordReset);

        if (mailResult.success) {
            res.json({ success: true, message: `${customer.email} 宛に招待メールを送信しました` });
        } else {
            res.json({ success: false, message: mailResult.message || "メール送信に失敗しました" });
        }
    } catch (e) {
        console.error("Send invite email error:", e);
        res.status(500).json({ success: false, message: e.message || "処理中にエラーが発生しました" });
    }
});

// 管理者が代理ログイン「申請」を送信（顧客画面に許可/却下バナーが表示される）
router.post("/admin/proxy-request", requireAdmin, async (req, res) => {
    const { customerId } = req.body;
    if (!customerId) {
        return res.status(400).json({ success: false, message: "顧客IDを指定してください" });
    }
    try {
        const customer = await customerService.getCustomerById(customerId);
        if (!customer) {
            return res.json({ success: false, message: "顧客が見つかりません" });
        }
        const requests = await loadProxyRequests();
        requests[customerId] = {
            requestedAt: Date.now(),
            adminName: req.session.adminName || "Admin",
            approved: false
        };
        await saveProxyRequests(requests);
        console.log(`代理ログイン申請: ${req.session.adminName} → 顧客 ${customerId}`);
        res.json({
            success: true,
            message: "顧客に許可の依頼を送信しました。顧客が許可したら「代理ログインを実行」をクリックしてください。"
        });
    } catch (e) {
        console.error("Proxy request error:", e);
        res.status(500).json({ success: false, message: e.message || "処理に失敗しました" });
    }
});

// 代理ログイン申請の状態（管理者用・ポーリング）
router.get("/admin/proxy-request-status", requireAdmin, async (req, res) => {
    const customerId = req.query.customerId;
    if (!customerId) {
        return res.json({ status: "none" });
    }
    try {
        const requests = await loadProxyRequests();
        const r = requests[customerId];
        if (!r) return res.json({ status: "none" });
        if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
            delete requests[customerId];
            await saveProxyRequests(requests);
            return res.json({ status: "none" });
        }
        if (r.approved === true) {
            return res.json({ status: "approved" });
        }
        return res.json({ status: "pending" });
    } catch (e) {
        return res.json({ status: "none" });
    }
});

// 代理ログインの実行（顧客が「許可」した後にのみ成功する）
router.post("/admin/proxy-login", requireAdmin, async (req, res) => {
    const { customerId } = req.body;
    if (!customerId) {
        return res.status(400).json({ success: false, message: "顧客IDを指定してください" });
    }
    try {
        const requests = await loadProxyRequests();
        const r = requests[customerId];
        if (!r || r.approved !== true) {
            return res.json({
                success: false,
                message: "顧客の許可がまだありません。顧客画面で「許可」が押されるまでお待ちください。"
            });
        }
        if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
            delete requests[customerId];
            await saveProxyRequests(requests);
            return res.json({ success: false, message: "許可の有効期限（10分）が切れています。再度申請してください。" });
        }
        const customer = await customerService.getCustomerById(customerId);
        if (!customer) {
            delete requests[customerId];
            await saveProxyRequests(requests);
            return res.json({ success: false, message: "顧客が見つかりません" });
        }
        delete requests[customerId];
        await saveProxyRequests(requests);
        const previousCustomer = req.session.customerId
            ? {
                customerId: req.session.customerId,
                customerName: req.session.customerName || req.session.customerId,
                priceRank: req.session.priceRank || ""
            }
            : null;
        const adminState = {
            isAdmin: !!req.session.isAdmin,
            adminName: req.session.adminName || "Admin"
        };
        // セッション固定化対策: 代理ログイン開始時にセッションIDをローテーション
        await regenerateSession(req);

        req.session.isAdmin = adminState.isAdmin;
        req.session.adminName = adminState.adminName;
        // 同一ブラウザで元々顧客ログインしていた場合、代理終了時に復元するため退避
        if (previousCustomer) {
            req.session.proxySavedCustomerId = previousCustomer.customerId;
            req.session.proxySavedCustomerName = previousCustomer.customerName;
            req.session.proxySavedPriceRank = previousCustomer.priceRank;
        } else {
            req.session.proxySavedCustomerId = null;
            req.session.proxySavedCustomerName = null;
            req.session.proxySavedPriceRank = null;
        }
        req.session.proxyByAdmin = { adminName: adminState.adminName || "Admin" };
        req.session.customerId = customer.customerId;
        req.session.customerName = customer.customerName || customer.customerId;
        req.session.priceRank = customer.priceRank || "";
        req.session.lastActivity = Date.now();
        try {
            await saveSession(req);
            console.log(`代理ログイン: ${req.session.adminName} → 顧客 ${customer.customerId}`);
            res.json({ success: true, redirectUrl: "/products.html" });
        } catch (err) {
            console.error("Session Save Error (proxy-login):", err);
            return res.status(500).json({ success: false, message: "セッション保存に失敗しました" });
        }
    } catch (e) {
        console.error("Proxy login error:", e);
        res.status(500).json({ success: false, message: e.message || "処理に失敗しました" });
    }
});

// 代理ログインの終了（代理のみ解除。元々顧客ログインしていた場合はそのまま継続）
router.post("/admin/proxy-logout", (req, res) => {
    if (!req.session.proxyByAdmin) {
        return res.status(400).json({ success: false, message: "代理ログイン中ではありません" });
    }
    // 代理開始前に顧客でログインしていた場合は復元（ユーザーはログイン継続）
    if (req.session.proxySavedCustomerId) {
        req.session.customerId = req.session.proxySavedCustomerId;
        req.session.customerName = req.session.proxySavedCustomerName || req.session.proxySavedCustomerId;
        req.session.priceRank = req.session.proxySavedPriceRank || "";
        req.session.proxySavedCustomerId = null;
        req.session.proxySavedCustomerName = null;
        req.session.proxySavedPriceRank = null;
    } else {
        req.session.customerId = null;
        req.session.customerName = null;
        req.session.priceRank = null;
    }
    req.session.proxyByAdmin = null;
    req.session.proxyPending = null;
    req.session.lastActivity = Date.now();
    req.session.save((err) => {
        if (err) {
            console.error("Session Save Error (proxy-logout):", err);
            return res.status(500).json({ success: false, message: "セッション保存に失敗しました" });
        }
        res.json({ success: true, redirectUrl: "/admin/admin-dashboard.html" });
    });
});

// 招待メール送信（既にリセット済みの一時パスワードを使う・二重リセット防止）
router.post("/admin/send-invite-email-with-token", requireAdmin, async (req, res) => {
    const { customerId, tempPassword, isPasswordReset } = req.body;
    if (!customerId || !tempPassword) {
        return res.json({ success: false, message: "顧客IDと一時パスワードが必要です" });
    }

    try {
        const customer = await customerService.getCustomerById(customerId);
        if (!customer) {
            return res.json({ success: false, message: "顧客が見つかりません" });
        }
        if (!customer.email || !customer.email.trim()) {
            return res.json({ success: false, message: "顧客のメールアドレスが登録されていません" });
        }

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(customerId)}&key=${encodeURIComponent(tempPassword)}`;
        const mailResult = await mailService.sendInviteEmail(customer, inviteUrl, tempPassword, !!isPasswordReset);

        if (mailResult.success) {
            res.json({ success: true, message: `${customer.email} 宛に招待メールを送信しました` });
        } else {
            res.json({ success: false, message: mailResult.message || "メール送信に失敗しました" });
        }
    } catch (e) {
        console.error("Send invite email with token error:", e);
        res.status(500).json({ success: false, message: e.message || "処理中にエラーが発生しました" });
    }
});


// =================================================================
// 💰 3. 価格・ランク管理 (Price Strategy)
// =================================================================

// ランク価格の保存
router.post("/admin/save-rank-prices", requireAdmin, async (req, res) => {
    try {
        await priceService.saveRankPrices(req.body);
        res.json({ success: true, message: "ランク価格を保存しました" });
    } catch (e) { res.status(500).json({ message: "保存失敗" }); }
});

// ランク価格一覧取得
router.get("/admin/rank-prices-list", requireAdmin, async (req, res) => {
    try {
        const result = await priceService.getRankPrices();
        res.json(result);
    } catch (e) { res.status(500).json({ message: "取得失敗" }); }
});

// ランク一覧取得（表示名付き・価格設定・顧客管理のドロップダウン用）
router.get("/admin/rank-list", requireAdmin, async (req, res) => {
    try {
        const list = await settingsService.getRankList();
        res.json(list);
    } catch (e) { res.status(500).json({ message: "取得失敗" }); }
});

// 特定顧客の特価リスト
router.get("/admin/customer-price-list", requireAdmin, async (req, res) => {
    try {
        const result = await priceService.getCustomerPriceList(req.query.customerId);
        res.json(result);
    } catch (e) { res.json([]); }
});

// 全特価リスト取得
router.get("/admin/special-prices-list", requireAdmin, async (req, res) => {
    try {
        const result = await priceService.getAllSpecialPrices();
        res.json(result);
    } catch (e) { res.status(500).json({ message: "取得失敗" }); }
});

// ランク別価格表ダウンロード（CSV・メール添付・顧客配布用）
router.get("/admin/download-pricelist-by-rank/:rank", requireAdmin, async (req, res) => {
    try {
        const rank = String(req.params.rank || "").toUpperCase().replace(/[^A-Z]/g, "") || "A";
        const { csv, filename } = await priceService.getPricelistCsvForRank(rank);
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
        res.send(csv);
    } catch (e) {
        console.error("Rank pricelist download error:", e);
        res.status(500).send("価格表の生成に失敗しました");
    }
});

// ランク別価格表ダウンロード（Excel・メーカー別シート・各シート先頭に送料規定）
router.get("/admin/download-pricelist-excel-by-rank/:rank", requireAdmin, async (req, res) => {
    try {
        const rank = String(req.params.rank || "").toUpperCase().replace(/[^A-Z]/g, "") || "A";
        const { buffer, filename } = await priceService.getPricelistExcelForRank(rank);
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
        res.send(buffer);
    } catch (e) {
        console.error("Rank pricelist Excel download error:", e);
        res.status(500).send("価格表の生成に失敗しました");
    }
});

// ランク別価格をExcelで一括取込（シート名「Upload」・1行目ヘッダーで「商品コード」列と「ランク1」「ランク2」…列を自動判定）
router.post("/admin/import-rank-prices-excel", requireAdmin, async (req, res) => {
    const uploaded = req.files && (req.files.rankExcelFile || req.files.file);
    if (!uploaded) {
        return res.status(400).json({ success: false, message: "Excelファイルを選択してください" });
    }
    try {
        const file = uploaded.data ? uploaded : (req.files.rankExcelFile || req.files.file);
        const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
        const result = await priceService.updateRankPricesFromExcel(fileBuffer);
        if (result.success) {
            return res.json({ success: true, message: result.message });
        }
        return res.status(400).json({ success: false, message: result.message });
    } catch (e) {
        console.error("Rank prices Excel import error:", e);
        return res.status(500).json({ success: false, message: e.message || "取込に失敗しました" });
    }
});

// =================================================================
// 🚚 4. 物流・FLAM連携 (Logistics & FLAM)
// =================================================================

// ステータス・配送情報・納期目安更新 API（/api 配下で確実にマッチさせる）
router.post("/update-order-status", (req, res, next) => {
    if (!req.session.isAdmin && !req.session.customerId) return res.status(401).json({ message: "権限なし" });
    orderService.updateOrderStatus(req.body.orderId, req.body)
        .then(() => res.json({ success: true }))
        .catch(err => res.status(500).json({ success: false, message: "保存失敗" }));
});

// 注文一覧取得API
router.get("/admin/orders", requireAdmin, async (req, res) => {
    try {
        const orders = await orderService.getAllOrders();
        res.json({ success: true, orders: orders });
    } catch (e) {
        console.error("Order Fetch Error:", e);
        res.status(500).json({ success: false, message: "注文データの取得に失敗しました" });
    }
});

// FLAM CSVインポート
router.post('/import-flam', requireAdmin, async (req, res) => {
    if (!req.files || !req.files.csvFile) {
        return res.status(400).json({ success: false, message: 'CSVファイルがありません' });
    }
    try {
        const result = await orderService.importFlamData(req.files.csvFile.data);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: 'インポート失敗: ' + error.message });
    }
});

// =================================================================
// 📄 5. 見積・特価管理 (Estimates & Special Prices)
// =================================================================

// 見積CSV/Excelのアップロード
router.post('/admin/import-estimates', requireAdmin, async (req, res) => {
    if (!req.files || !req.files.estimateFile) {
        return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません' });
    }
    try {
        const fileBuffer = req.files.estimateFile.data;
        const fileName = req.files.estimateFile.name || "";  // ファイル名を取得
        const settings = await settingsService.getSettings();
        const aliasOverride =
            settings.dataFormats && settings.dataFormats.estimateImportAliases
                ? settings.dataFormats.estimateImportAliases
                : {};
        const parsedData = await csvService.parseEstimatesData(fileBuffer, fileName, aliasOverride);
        if (parsedData.length === 0) {
            return res.status(400).json({ success: false, message: '有効なデータが見つかりませんでした（顧客コード0000の行は除外されます）' });
        }
        const saveResult = await specialPriceService.saveEstimates(parsedData);
        res.json({ 
            success: true, 
            message: `${saveResult.count} 件の見積データを登録しました`,
            count: saveResult.count 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'インポート処理中にエラーが発生しました: ' + error.message });
    }
});

// =================================================================
// 📄 6. 見積データ削除 (Estimate Deletion)
// =================================================================

// メーカー指定で見積データを削除（商品名に含まれるメーカー名で部分一致）
router.post('/admin/delete-estimates-by-manufacturer', requireAdmin, async (req, res) => {
    try {
        const { manufacturer } = req.body;
        if (!manufacturer || typeof manufacturer !== 'string') {
            return res.status(400).json({ success: false, message: "メーカー名を指定してください" });
        }
        const result = await specialPriceService.deleteEstimatesByManufacturer(manufacturer);
        res.json({ 
            success: true, 
            message: `商品名に「${manufacturer}」を含む見積を削除しました`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        console.error("Delete by Manufacturer Error:", error);
        res.status(500).json({ success: false, message: "削除処理に失敗しました: " + error.message });
    }
});

// 商品コード指定で見積データを削除
router.post('/admin/delete-estimates-by-products', requireAdmin, async (req, res) => {
    try {
        const { productCodes } = req.body;
        if (!Array.isArray(productCodes) || productCodes.length === 0) {
            return res.status(400).json({ success: false, message: "商品コードを指定してください" });
        }
        const result = await specialPriceService.deleteEstimatesByProductCodes(productCodes);
        res.json({ 
            success: true, 
            message: `${result.deletedCount}件の見積データを削除しました`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        console.error("Delete by Product Codes Error:", error);
        res.status(500).json({ success: false, message: "削除処理に失敗しました: " + error.message });
    }
});

// =================================================================
// 📦 7. 在庫管理 (Stock Management)
// =================================================================

router.get("/admin/stocks/settings", requireAdmin, async (req, res) => {
    try {
        const [config, display] = await Promise.all([
            stockService.getAdapterConfig(),
            stockService.getDisplaySettings()
        ]);
        res.json({
            success: true,
            display,
            adapters: config.adapters || []
        });
    } catch (error) {
        console.error("Stock settings fetch error:", error);
        res.status(500).json({ success: false, message: "設定の取得に失敗しました" });
    }
});

router.put("/admin/stocks/settings", requireAdmin, async (req, res) => {
    try {
        const current = await stockService.getAdapterConfig();
        const nextConfig = {
            ...current,
            display: {
                ...current.display,
                ...(req.body.display || {})
            },
            adapters: Array.isArray(req.body.adapters) ? req.body.adapters : (current.adapters || [])
        };
        const saved = await stockService.saveAdapterConfig(nextConfig);
        res.json({ success: true, config: saved });
    } catch (error) {
        console.error("Stock settings update error:", error);
        res.status(500).json({ success: false, message: "設定の保存に失敗しました" });
    }
});

router.get("/admin/stocks", requireAdmin, async (_req, res) => {
    try {
        const stocks = await stockService.getAllStocks();
        res.json({ success: true, stocks });
    } catch (error) {
        console.error("Stock list error:", error);
        res.status(500).json({ success: false, message: "在庫データの取得に失敗しました" });
    }
});

router.post("/admin/stocks/import", requireAdmin, async (req, res) => {
    if (!req.files || !req.files.stockFile) {
        return res.status(400).json({ success: false, message: "在庫CSVファイルを添付してください" });
    }
    try {
        const file = req.files.stockFile;
        const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
        const adapter = createAdapter({
            id: `csv-upload-${Date.now()}`,
            type: "csv",
            options: {}
        });
        const result = await adapter.run({
            fileBuffer,
            filename: file.name || "",
            userId: req.session.adminName || req.session.adminId || "admin"
        });
        res.json({ success: true, summary: result.summary });
    } catch (error) {
        console.error("Stock import error:", error);
        res.status(500).json({ success: false, message: "在庫取込に失敗しました: " + error.message });
    }
});

// 在庫テンプレート Excel ダウンロード（exceljs で生成・xlsx 脆弱性回避）
router.get("/admin/stocks/template", requireAdmin, async (_req, res) => {
    try {
        const workbook = new excelReader.ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("在庫テンプレート");
        const headers = ["product_code", "total_qty", "warehouse_code", "warehouse_qty", "timestamp", "publish", "hidden_message"];
        const ts = "2025-02-01T09:00:00+09:00";
        sheet.addRow(headers);
        sheet.addRow(["PRD-001", 50, "本社", 30, ts, 1, ""]);
        sheet.addRow(["PRD-001", "", "倉庫", 20, ts, 1, ""]);
        sheet.addRow(["PRD-002", 0, "", 0, ts, 0, "仕入先直送"]);
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="stock_template.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error("Stock template error:", err);
        res.status(500).json({ success: false, message: "テンプレートの生成に失敗しました" });
    }
});

// 買取マスタ用 Excel 解析（社外アップロード対応・サーバー側で exceljs 使用）
router.post("/admin/kaitori/parse-excel", requireAdmin, async (req, res) => {
    if (!req.files || !req.files.excelFile) {
        return res.status(400).json({ success: false, message: "Excelファイルを選択してください" });
    }
    try {
        const buf = Buffer.isBuffer(req.files.excelFile.data) ? req.files.excelFile.data : Buffer.from(req.files.excelFile.data || []);
        const data = await excelReader.readToObjects(buf, { defval: "" });
        res.json({ success: true, data });
    } catch (err) {
        console.error("Kaitori parse-excel error:", err);
        res.status(500).json({ success: false, message: "Excelの読み込みに失敗しました: " + (err.message || "") });
    }
});

router.get("/admin/stocks/history", requireAdmin, async (_req, res) => {
    try {
        const history = await stockService.getHistory(100);
        res.json({ success: true, history });
    } catch (error) {
        console.error("Stock history error:", error);
        res.status(500).json({ success: false, message: "履歴の取得に失敗しました" });
    }
});

router.post("/admin/stocks/manual-adjust", requireAdmin, async (req, res) => {
    const payload = req.body || {};
    if (!payload.productCode) {
        return res.status(400).json({ success: false, message: "商品コードは必須です" });
    }
    try {
        await stockService.saveStock({
            productCode: payload.productCode,
            totalQty: Number(payload.totalQty) || 0,
            reservedQty: Number(payload.reservedQty) || 0,
            warehouses: Array.isArray(payload.warehouses) ? payload.warehouses : [],
            publish: payload.publish !== undefined ? !!payload.publish : true,
            hiddenMessage: payload.hiddenMessage || "",
            manualLock: !!payload.manualLock,
            source: "manual-adjust",
            note: payload.note || ""
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Manual adjust error:", error);
        res.status(500).json({ success: false, message: "在庫の更新に失敗しました" });
    }
});

router.post("/admin/stocks/manual-reserve", requireAdmin, async (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "対象データがありません" });
    }
    try {
        await stockService.reserve(items, {
            userId: req.session.adminName || req.session.adminId || "admin",
            silent: true
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Manual reserve error:", error);
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post("/admin/stocks/manual-release", requireAdmin, async (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "対象データがありません" });
    }
    try {
        await stockService.release(items, {
            userId: req.session.adminName || req.session.adminId || "admin"
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Manual release error:", error);
        res.status(500).json({ success: false, message: "在庫の戻し処理に失敗しました" });
    }
});

router.get("/admin/stocks/:productCode", requireAdmin, async (req, res) => {
    try {
        const stock = await stockService.getStock(req.params.productCode);
        if (!stock) {
            return res.status(404).json({ success: false, message: "在庫データが見つかりません" });
        }
        res.json({ success: true, stock });
    } catch (error) {
        console.error("Single stock fetch error:", error);
        res.status(500).json({ success: false, message: "取得に失敗しました" });
    }
});

module.exports = router;