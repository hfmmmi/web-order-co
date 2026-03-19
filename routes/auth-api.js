// routes/auth-api.js
// 認証（ログイン）に関連する機能の隔離エリア
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../dbPaths");
const bcrypt = require("bcryptjs");
// ★追加: ランダムパスワード生成用
const crypto = require("crypto");

// パスワード更新用サービス
const customerService = require("../services/customerService");
const mailService = require("../services/mailService");
const settingsService = require("../services/settingsService");
const https = require("https");
const { validateBody } = require("../middlewares/validate");
const { loginSchema } = require("../validators/requestSchemas");

// DBパス設定（業務データ用 JSON は dbPaths 経由で一元管理）
const CUSTOMERS_DB_PATH = dbPath("customers.json");
const ADMINS_DB_PATH = dbPath("admins.json");
const INVITE_TOKENS_PATH = dbPath("invite_tokens.json");
const RESET_TOKENS_PATH = dbPath("reset_tokens.json");
const ADMIN_RESET_TOKENS_PATH = dbPath("admin_reset_tokens.json");
const RESET_RATE_LIMIT_PATH = dbPath("reset_rate_limit.json");
const LOGIN_RATE_LIMIT_PATH = dbPath("login_rate_limit.json");
const PROXY_REQUESTS_PATH = dbPath("proxy_requests.json");
const ADMIN_AUTH_LOG_PATH = dbPath("logs/admin-auth.json");
const CUSTOMER_AUTH_LOG_PATH = dbPath("logs/customer-auth.json");
const PROXY_REQUEST_EXPIRY_MS = 10 * 60 * 1000; // 10分
const INVITE_EXPIRY_HOURS = 24;
const RESET_EXPIRY_HOURS = 24;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;  // 15分
const RATE_LIMIT_MAX_REQUESTS = 5;
// ログイン失敗レート制限: 同一アカウント 5回/15分 → 15分ロック
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MESSAGE = "ログインの試行が多すぎます。15分後に再度お試しください。パスワードをお忘れの場合は「パスワードをお忘れの方」から再設定できます。";
const LOGIN_CAPTCHA_REQUIRED_MESSAGE = "確認のため、下の「私はロボットではありません」にチェックを入れて再度送信してください。";
const LOGIN_CAPTCHA_FAILED_MESSAGE = "確認に失敗しました。チェックボックスを再度お試しください。";
const LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES = 2; // この回数以上失敗したらCAPTCHA必須

/** 管理者表示名のサニタイズ（長さ・文字種制限で XSS 等を防止） */
function sanitizeAdminName(name) {
    if (name == null || typeof name !== "string") return "";
    let s = name.trim().slice(0, 100);
    return s.replace(/[<>"\'&]/g, "");
}

// 管理者ログイン・ログアウト履歴（監査用）
async function appendAdminAuthLog(entry) {
    const row = {
        at: new Date().toISOString(),
        ...entry,
        ip: entry.ip || null
    };
    try {
        let list = [];
        try {
            const data = await fs.readFile(ADMIN_AUTH_LOG_PATH, "utf-8");
            list = JSON.parse(data);
        } catch (e) {
            if (e.code !== "ENOENT") console.error("[admin-auth-log] read error:", e.message);
        }
        if (!Array.isArray(list)) list = [];
        list.push(row);
        const dir = path.dirname(ADMIN_AUTH_LOG_PATH);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(ADMIN_AUTH_LOG_PATH, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error("[admin-auth-log] write error:", e.message);
    }
}

// 顧客ログイン・ログアウト履歴（監査用）
async function appendCustomerAuthLog(entry) {
    const row = {
        at: new Date().toISOString(),
        ...entry,
        ip: entry.ip || null
    };
    try {
        let list = [];
        try {
            const data = await fs.readFile(CUSTOMER_AUTH_LOG_PATH, "utf-8");
            list = JSON.parse(data);
        } catch (e) {
            if (e.code !== "ENOENT") console.error("[customer-auth-log] read error:", e.message);
        }
        if (!Array.isArray(list)) list = [];
        list.push(row);
        const dir = path.dirname(CUSTOMER_AUTH_LOG_PATH);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(CUSTOMER_AUTH_LOG_PATH, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error("[customer-auth-log] write error:", e.message);
    }
}

// ==========================================
// ログイン失敗レート制限（同一アカウント 5回/15分 → 15分ロック）
// ==========================================
async function loadLoginRateLimit() {
    try {
        const data = await fs.readFile(LOGIN_RATE_LIMIT_PATH, "utf-8");
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

async function saveLoginRateLimit(obj) {
    await fs.writeFile(LOGIN_RATE_LIMIT_PATH, JSON.stringify(obj, null, 2));
}

/** アカウントキー（customer:ID または admin:ID）がロック中か */
async function isLoginLocked(accountKey) {
    if (!accountKey) return false;
    const data = await loadLoginRateLimit();
    const entry = data[accountKey];
    if (!entry || !entry.lockedUntil) return false;
    if (Date.now() < entry.lockedUntil) return true;
    delete data[accountKey];
    await saveLoginRateLimit(data);
    return false;
}

/**
 * ログイン失敗を記録。5回でロックし、ちょうど5回目になったら justHitFive: true
 * @returns {Promise<{ locked: boolean, justHitFive: boolean, lockedUntil?: number }>}
 */
async function recordLoginFailure(accountKey) {
    const data = await loadLoginRateLimit();
    const now = Date.now();
    const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
    if (!data[accountKey]) data[accountKey] = { attempts: [], lockedUntil: null };
    const entry = data[accountKey];
    entry.attempts = (entry.attempts || []).filter(ts => ts > windowStart);
    entry.attempts.push(now);
    const count = entry.attempts.length;
    let justHitFive = false;
    if (count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        entry.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
        if (count === LOGIN_RATE_LIMIT_MAX_ATTEMPTS) justHitFive = true;
    }
    await saveLoginRateLimit(data);
    return {
        locked: count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        justHitFive,
        lockedUntil: entry.lockedUntil || undefined
    };
}

/** ログイン成功時に失敗履歴をクリア */
async function clearLoginFailures(accountKey) {
    if (!accountKey) return;
    const data = await loadLoginRateLimit();
    if (data[accountKey]) {
        delete data[accountKey];
        await saveLoginRateLimit(data);
    }
}

/** 現在の失敗回数（15分窓内）を返す。記録はしない。 */
async function getLoginFailureCount(accountKey) {
    if (!accountKey) return 0;
    const data = await loadLoginRateLimit();
    const entry = data[accountKey];
    if (!entry || !Array.isArray(entry.attempts)) return 0;
    const now = Date.now();
    const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
    return entry.attempts.filter(ts => ts > windowStart).length;
}

/**
 * reCAPTCHA v2 トークンを検証する
 * @param {string} token - フロントから送られた response トークン
 * @param {string} secretKey - サイトのシークレットキー
 * @returns {Promise<boolean>}
 */
function verifyRecaptcha(token, secretKey) {
    if (!token || !secretKey) return Promise.resolve(false);
    return new Promise((resolve) => {
        const postData = new URLSearchParams({ secret: secretKey, response: token }).toString();
        const req = https.request(
            {
                hostname: "www.google.com",
                path: "/recaptcha/api/siteverify",
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(postData)
                }
            },
            (res) => {
                let body = "";
                res.on("data", (chunk) => { body += chunk; });
                res.on("end", () => {
                    try {
                        const json = JSON.parse(body);
                        resolve(json.success === true);
                    } catch (e) {
                        resolve(false);
                    }
                });
            }
        );
        req.on("error", () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        req.write(postData);
        req.end();
    });
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

// ==========================================
// 1. 顧客用ログイン (Customer Gate)
// ==========================================
router.post("/login", validateBody(loginSchema), async (req, res) => {
    const { id, pass, captchaToken } = req.body;
    const accountKey = "customer:" + (typeof id === "string" ? id.trim() : "");

    try {
        if (await isLoginLocked(accountKey)) {
            return res.json({ success: false, message: LOGIN_LOCK_MESSAGE });
        }

        const failureCount = await getLoginFailureCount(accountKey);
        const settings = await settingsService.getSettings();
        const recaptchaSecret = (settings.recaptcha && settings.recaptcha.secretKey) ? String(settings.recaptcha.secretKey).trim() : "";
        if (failureCount >= LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES && recaptchaSecret) {
            if (!captchaToken || typeof captchaToken !== "string" || !captchaToken.trim()) {
                return res.json({ success: false, message: LOGIN_CAPTCHA_REQUIRED_MESSAGE, captchaRequired: true });
            }
            const valid = await verifyRecaptcha(captchaToken.trim(), recaptchaSecret);
            if (!valid) {
                return res.json({ success: false, message: LOGIN_CAPTCHA_FAILED_MESSAGE, captchaRequired: true });
            }
        }

        const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
        const customerList = JSON.parse(data);
        const customer = customerList.find(c => c.customerId === id);

        if (!customer) {
            await recordLoginFailure(accountKey);
            appendCustomerAuthLog({ action: "failed_login", customerId: id, ip: req.ip }).catch(() => {});
            return res.json({ success: false, message: "IDまたはPASSが間違っています" });
        }

        const isMatch = await bcrypt.compare(pass, customer.password);

        if (isMatch) {
            await clearLoginFailures(accountKey);
            const preservedAdminState = {
                isAdmin: !!req.session.isAdmin,
                adminName: req.session.adminName || null
            };
            // セッション固定化対策: ログイン成功時にセッションIDをローテーション
            await regenerateSession(req);

            // 管理者セッション(isAdmin)を破壊せず、共存させる
            req.session.isAdmin = preservedAdminState.isAdmin;
            req.session.adminName = preservedAdminState.adminName;
            req.session.customerId = customer.customerId;
            req.session.customerName = customer.customerName;
            req.session.priceRank = customer.priceRank || "";
            req.session.proxyByAdmin = null;
            req.session.proxySavedCustomerId = null;
            req.session.proxySavedCustomerName = null;
            req.session.proxySavedPriceRank = null;

            // 自動ログアウト用タイマー初期化
            req.session.lastActivity = Date.now();
            appendCustomerAuthLog({
                action: "login",
                customerId: customer.customerId,
                customerName: customer.customerName || null,
                ip: req.ip
            }).catch(() => {});

            console.log(`顧客ログイン成功: ${req.session.customerId} (AdminStatus: ${req.session.isAdmin})`);
            
            try {
                await saveSession(req);
                // 顧客用リダイレクト先 (基本はフロントエンド制御だが明示も可能)
                res.json({ success: true, redirectUrl: "products.html" });
            } catch (err) {
                console.error("Session Save Error:", err);
                return res.json({ success: false, message: "セッション保存失敗" });
            }
        } else {
            const r = await recordLoginFailure(accountKey);
            if (r.justHitFive && (customer.email || "").trim()) {
                mailService.sendLoginFailureAlert({ type: "customer", customer, count: 5 }).catch(() => {});
            }
            appendCustomerAuthLog({
                action: "failed_login",
                customerId: customer.customerId,
                customerName: customer.customerName || null,
                ip: req.ip
            }).catch(() => {});
            console.log("ログイン失敗:", id);
            res.json({ success: false, message: "IDまたはPASSが間違っています" });
        }
    } catch (error) {
        console.error("顧客ログインエラー", error);
        res.json({ success: false, message: "システムエラー" });
    };
});

// ==========================================
// 2. 管理者用ログイン (Admin Gate: Level 2)
// ==========================================
router.post("/admin/login", validateBody(loginSchema), async (req, res) => {
    const { id, pass, captchaToken } = req.body;
    const accountKey = "admin:" + (typeof id === "string" ? id.trim() : "");

    try {
        if (await isLoginLocked(accountKey)) {
            return res.json({ success: false, message: LOGIN_LOCK_MESSAGE });
        }

        const failureCount = await getLoginFailureCount(accountKey);
        const settings = await settingsService.getSettings();
        const recaptchaSecret = (settings.recaptcha && settings.recaptcha.secretKey) ? String(settings.recaptcha.secretKey).trim() : "";
        if (failureCount >= LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES && recaptchaSecret) {
            if (!captchaToken || typeof captchaToken !== "string" || !captchaToken.trim()) {
                return res.json({ success: false, message: LOGIN_CAPTCHA_REQUIRED_MESSAGE, captchaRequired: true });
            }
            const valid = await verifyRecaptcha(captchaToken.trim(), recaptchaSecret);
            if (!valid) {
                return res.json({ success: false, message: LOGIN_CAPTCHA_FAILED_MESSAGE, captchaRequired: true });
            }
        }

        let adminList = [];
        try {
            const data = await fs.readFile(ADMINS_DB_PATH, "utf-8");
            adminList = JSON.parse(data);
        } catch (err) {
            console.error("admins.json 読み込み失敗:", err);
            return res.json({ success: false, message: "管理者DBエラー" });
        }

        const admin = adminList.find(a => a.adminId === id);
        if (!admin) {
            await recordLoginFailure(accountKey);
            appendAdminAuthLog({ action: "failed_login", adminId: id, ip: req.ip }).catch(() => {});
            return res.json({ success: false, message: "権限がありません" });
        }

        let isMatch = false;
        let needUpdate = false;

        if (admin.password.startsWith("$2")) {
            isMatch = await bcrypt.compare(pass, admin.password);
        } else {
            if (admin.password === pass) {
                isMatch = true;
                needUpdate = true;
            }
        }

        if (isMatch) {
            await clearLoginFailures(accountKey);
            const preservedCustomerState = {
                customerId: req.session.customerId || null,
                customerName: req.session.customerName || null,
                priceRank: req.session.priceRank || ""
            };
            // セッション固定化対策: ログイン成功時にセッションIDをローテーション
            await regenerateSession(req);

            // 顧客セッション(customerId)を破壊せず、共存させる
            req.session.customerId = preservedCustomerState.customerId;
            req.session.customerName = preservedCustomerState.customerName;
            req.session.priceRank = preservedCustomerState.priceRank;
            req.session.isAdmin = true;
            req.session.adminName = sanitizeAdminName(admin.name) || "Admin";
            req.session.proxyByAdmin = null;
            req.session.proxySavedCustomerId = null;
            req.session.proxySavedCustomerName = null;
            req.session.proxySavedPriceRank = null;

            // 自動ログアウト用タイマー初期化
            req.session.lastActivity = Date.now();

            appendAdminAuthLog({
                action: "login",
                adminId: admin.adminId,
                adminName: admin.name || "Admin",
                ip: req.ip
            }).catch(() => {});

            console.log(`★管理者ログイン成功: ${admin.name} (CustomerStatus: ${req.session.customerId})`);

            if (needUpdate) {
                console.log("⚠️ 平文パスワードを検知。ハッシュ化して保存します...");
                const hashedPassword = await bcrypt.hash(pass, 10);
                admin.password = hashedPassword;
                await fs.writeFile(ADMINS_DB_PATH, JSON.stringify(adminList, null, 2));
            }

            try {
                await saveSession(req);
                // ★修正: 管理者用リダイレクト先を確実に指定 (admin-dashboard.html)
                res.json({ success: true, redirectUrl: "admin/admin-dashboard.html" });
            } catch (err) {
                console.error("Session Save Error:", err);
                return res.json({ success: false, message: "セッション保存失敗" });
            }

        } else {
            const r = await recordLoginFailure(accountKey);
            if (r.justHitFive) {
                mailService.sendLoginFailureAlert({
                    type: "admin",
                    adminId: admin.adminId,
                    adminName: admin.name || "Admin",
                    count: 5
                }).catch(() => {});
            }
            appendAdminAuthLog({ action: "failed_login", adminId: id, ip: req.ip }).catch(() => {});
            console.log("管理者パスワード不一致:", id);
            res.json({ success: false, message: "パスワードが違います" });
        }

    } catch (error) {
        console.error("管理者ログイン処理エラー", error);
        res.json({ success: false, message: "システムエラー" });
    }
});

// 管理者セッション状態チェック
router.get("/admin/check", (req, res) => {
    res.json({ loggedIn: !!req.session.isAdmin });
});

// 顧客セッション状態（顧客画面用・代理ログイン表示のため）
router.get("/session", (req, res) => {
    const loggedIn = !!req.session.customerId;
    res.json({
        loggedIn,
        customerId: req.session.customerId || null,
        customerName: req.session.customerName || null,
        proxyByAdmin: req.session.proxyByAdmin || null
    });
});

// ==========================================
// 顧客向け：代理ログイン申請の表示・許可/却下
// ==========================================
async function loadProxyRequestsAuth() {
    try {
        const data = await fs.readFile(PROXY_REQUESTS_PATH, "utf-8");
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}
async function saveProxyRequestsAuth(obj) {
    await fs.writeFile(PROXY_REQUESTS_PATH, JSON.stringify(obj, null, 2));
}

router.get("/account/proxy-request", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    try {
        const requests = await loadProxyRequestsAuth();
        const r = requests[req.session.customerId];
        if (!r) return res.json({ pending: false });
        if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
            delete requests[req.session.customerId];
            await saveProxyRequestsAuth(requests);
            return res.json({ pending: false });
        }
        if (r.approved === true) return res.json({ pending: false });
        res.json({ pending: true, adminName: sanitizeAdminName(r.adminName) || "管理者" });
    } catch (e) {
        res.json({ pending: false });
    }
});

router.post("/account/proxy-request/approve", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    try {
        const requests = await loadProxyRequestsAuth();
        const r = requests[req.session.customerId];
        if (!r) return res.json({ success: true, message: "既に処理済みです" });
        if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
            delete requests[req.session.customerId];
            await saveProxyRequestsAuth(requests);
            return res.json({ success: false, message: "申請の有効期限が切れています" });
        }
        r.approved = true;
        r.approvedAt = Date.now();
        await saveProxyRequestsAuth(requests);
        res.json({ success: true, message: "許可しました。管理者が代理ログインを実行できます。" });
    } catch (e) {
        console.error("Proxy approve error:", e);
        res.status(500).json({ message: "処理に失敗しました" });
    }
});

router.post("/account/proxy-request/reject", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    try {
        const requests = await loadProxyRequestsAuth();
        delete requests[req.session.customerId];
        await saveProxyRequestsAuth(requests);
        res.json({ success: true, message: "却下しました。" });
    } catch (e) {
        console.error("Proxy reject error:", e);
        res.status(500).json({ message: "処理に失敗しました" });
    }
});

// ==========================================
// 顧客本人用アカウント設定（代理ログイン許可のON/OFF）
// ==========================================
router.get("/account/settings", (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    customerService.getCustomerById(req.session.customerId)
        .then(c => {
            if (!c) return res.status(404).json({ message: "顧客が見つかりません" });
            // ERR_CONTENT_LENGTH_MISMATCH 回避:  body を明示的に構築して Content-Length を一致させる
            const body = JSON.stringify({ allowProxyLogin: c.allowProxyLogin === true });
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Content-Length", Buffer.byteLength(body, "utf8"));
            res.status(200).end(body);
        })
        .catch(err => {
            console.error("Account settings get error:", err);
            res.status(500).json({ message: "設定の取得に失敗しました" });
        });
});

router.put("/account/settings", (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    const allowProxyLogin = req.body && req.body.allowProxyLogin === true;
    customerService.updateCustomerAllowProxy(req.session.customerId, allowProxyLogin)
        .then(result => {
            if (!result.success) return res.status(400).json(result);
            res.json({ success: true, message: result.message });
        })
        .catch(err => {
            console.error("Account settings update error:", err);
            res.status(500).json({ message: "設定の保存に失敗しました" });
        });
});

// ==========================================
// 3. 顧客用ログアウト (Customer Exit)
// ==========================================
router.post("/logout", (req, res) => {
    // セッション全体を破壊せず、顧客情報だけを消す
    if (req.session.customerId) {
        appendCustomerAuthLog({
            action: "logout",
            customerId: req.session.customerId,
            customerName: req.session.customerName || null,
            ip: req.ip
        }).catch(() => {});
        req.session.customerId = null;
        req.session.customerName = null;
        req.session.priceRank = null;
        
        // 管理者としてもログインしていなければ、セッションを完全破棄してクリーンにする
        if (!req.session.isAdmin) {
            return req.session.destroy((err) => {
                res.clearCookie("weborder.sid");
                res.json({ success: true });
            });
        }
    }
    
    req.session.save((err) => {
        res.json({ success: true });
    });
});

// ==========================================
// 4. 管理者用ログアウト (Admin Exit)
// ==========================================
router.post("/admin/logout", (req, res) => {
    // 管理者権限だけを返上する
    if (req.session.isAdmin) {
        appendAdminAuthLog({
            action: "logout",
            adminName: req.session.adminName || null,
            ip: req.ip
        }).catch(() => {});
        req.session.isAdmin = false;
        req.session.adminName = null;

        // 顧客としてもログインしていなければ、セッションを完全破棄
        if (!req.session.customerId) {
            return req.session.destroy((err) => {
                res.clearCookie("weborder.sid");
                res.json({ success: true });
            });
        }
    }

    req.session.save((err) => {
        res.json({ success: true });
    });
});

// ==========================================
// 5. 初回セットアップ / パスワード再設定 (Setup)
// ※ URLの key でリセットトークンが渡された場合は現パスワード不要
// ==========================================
router.post("/setup", async (req, res) => {
    const { id, currentPass, newPass, key } = req.body;
    const tokenOrPass = key !== undefined ? key : currentPass;

    if (!id || !newPass) {
        return res.json({ success: false, message: "入力内容が不足しています" });
    }
    if (!tokenOrPass && !currentPass) {
        return res.json({ success: false, message: "入力内容が不足しています" });
    }
    if (newPass.length < 4) {
        return res.json({ success: false, message: "新しいパスワードは4文字以上にしてください" });
    }

    try {
        // 0. パスワード再設定トークン確認（顧客申込の「パスワードを忘れた」経由）
        let resetTokens = {};
        try {
            const resetData = await fs.readFile(RESET_TOKENS_PATH, "utf-8");
            resetTokens = JSON.parse(resetData);
        } catch (e) { resetTokens = {}; }

        if (resetTokens[id] && resetTokens[id].token === tokenOrPass) {
            const expiresAt = resetTokens[id].expiresAt;
            if (Date.now() > expiresAt) {
                delete resetTokens[id];
                await fs.writeFile(RESET_TOKENS_PATH, JSON.stringify(resetTokens, null, 2));
                return res.json({
                    success: false,
                    message: "このリンクの有効期限（24時間）が切れています。再度「パスワードをお忘れの方」から申請してください。"
                });
            }
            const result = await customerService.updateCustomerPassword(id, newPass);
            if (!result.success) {
                return res.json(result);
            }
            delete resetTokens[id];
            await fs.writeFile(RESET_TOKENS_PATH, JSON.stringify(resetTokens, null, 2));
            console.log(`パスワード再設定完了（顧客申込）: ${id}`);
            // 再設定完了通知を顧客に送信（非同期・結果は待たない）
            const customer = await customerService.getCustomerById(id);
            if (customer && customer.email) {
                mailService.sendPasswordChangedNotification(customer).catch(err => console.error("[request-password-reset] 変更完了通知送信失敗:", err));
            }
            return res.json({ success: true, message: "パスワードを変更しました。ログインしてください。" });
        }

        // 0b. 管理者パスワード再設定トークン確認
        let adminResetTokens = {};
        try {
            const adminResetData = await fs.readFile(ADMIN_RESET_TOKENS_PATH, "utf-8");
            adminResetTokens = JSON.parse(adminResetData);
        } catch (e) { adminResetTokens = {}; }
        if (adminResetTokens[id] && adminResetTokens[id].token === tokenOrPass) {
            const expiresAt = adminResetTokens[id].expiresAt;
            if (Date.now() > expiresAt) {
                delete adminResetTokens[id];
                await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));
                return res.json({
                    success: false,
                    message: "このリンクの有効期限（24時間）が切れています。再度「パスワードをお忘れの方」から申請してください。"
                });
            }
            let adminList = [];
            try {
                const adminData = await fs.readFile(ADMINS_DB_PATH, "utf-8");
                adminList = JSON.parse(adminData);
            } catch (e) {
                return res.json({ success: false, message: "管理者DBエラー" });
            }
            const admin = adminList.find(a => a.adminId === id);
            if (!admin) {
                delete adminResetTokens[id];
                await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));
                return res.json({ success: false, message: "管理者が見つかりません" });
            }
            const hashedPassword = await bcrypt.hash(newPass, 10);
            admin.password = hashedPassword;
            await fs.writeFile(ADMINS_DB_PATH, JSON.stringify(adminList, null, 2));
            delete adminResetTokens[id];
            await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));
            console.log(`パスワード再設定完了（管理者）: ${id}`);
            return res.json({ success: true, message: "パスワードを変更しました。管理者ログイン画面からログインしてください。" });
        }

        // 1. 招待トークンの有効期限チェック（招待経由の場合）
        let tokens = {};
        try {
            const tokensData = await fs.readFile(INVITE_TOKENS_PATH, "utf-8");
            tokens = JSON.parse(tokensData);
        } catch (e) { tokens = {}; }

        if (tokens[id]) {
            const expiresAt = tokens[id];
            if (Date.now() > expiresAt) {
                return res.json({
                    success: false,
                    message: "この招待リンクの有効期限（24時間）が切れています。管理者に新しい招待リンクの発行をお願いしてください。"
                });
            }
        }

        // 2. 現在のパスワードが正しいか確認（本人確認 / 招待の一時パスワード）
        const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
        const customerList = JSON.parse(data);
        const customer = customerList.find(c => c.customerId === id);

        if (!customer) {
            return res.json({ success: false, message: "IDまたはパスワードが間違っています" });
        }

        const isMatch = await bcrypt.compare(tokenOrPass, customer.password);

        if (!isMatch) {
            return res.json({ success: false, message: "IDまたはパスワードが間違っています" });
        }

        // 3. パスワードを更新
        const result = await customerService.updateCustomerPassword(id, newPass);

        if (result.success) {
            if (tokens[id]) {
                delete tokens[id];
                await fs.writeFile(INVITE_TOKENS_PATH, JSON.stringify(tokens, null, 2));
            }
            console.log(`パスワード初期設定完了: ${id}`);
            res.json({ success: true, message: "設定が完了しました。ログインしてください。" });
        } else {
            res.json(result);
        }

    } catch (error) {
        console.error("Setup Error:", error);
        res.json({ success: false, message: "システムエラーが発生しました" });
    }
});

// ==========================================
// 5b. 顧客申込パスワード再設定 (Request Password Reset)
// ※ セキュリティのため、成否に関わらず同じメッセージを返す
// ※ レート制限: 同一IPで15分あたり5回まで
// ==========================================
router.post("/request-password-reset", async (req, res) => {
    const { id } = req.body;
    const safeMessage = "ご登録のメールアドレスに送信しました。届かない場合は管理者にお問い合わせください。";

    if (!id || typeof id !== "string") {
        return res.json({ success: true, message: safeMessage });
    }

    const trimId = id.trim();
    if (!trimId) {
        return res.json({ success: true, message: safeMessage });
    }

    try {
        // レート制限チェック（同一IP: 15分あたり5回まで）
        const clientIp = (req.ip || req.connection?.remoteAddress || "unknown").toString();
        let rateData = {};
        try {
            const rateRaw = await fs.readFile(RESET_RATE_LIMIT_PATH, "utf-8");
            rateData = JSON.parse(rateRaw);
        } catch (e) { rateData = {}; }

        const now = Date.now();
        const windowStart = now - RATE_LIMIT_WINDOW_MS;
        if (!Array.isArray(rateData[clientIp])) rateData[clientIp] = [];
        rateData[clientIp] = rateData[clientIp].filter(ts => ts > windowStart);

        if (rateData[clientIp].length >= RATE_LIMIT_MAX_REQUESTS) {
            return res.json({ success: true, message: safeMessage });
        }

        rateData[clientIp].push(now);
        // 他IPの古いデータも削除してファイル肥大化を防ぐ
        const cleaned = {};
        for (const [ip, timestamps] of Object.entries(rateData)) {
            const recent = timestamps.filter(ts => ts > windowStart);
            if (recent.length > 0) cleaned[ip] = recent;
        }
        await fs.writeFile(RESET_RATE_LIMIT_PATH, JSON.stringify(cleaned, null, 2));

        const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
        const customerList = JSON.parse(data);
        const isEmailInput = trimId.includes("@");
        const customer = isEmailInput
            ? customerList.find(c => (c.email || "").trim().toLowerCase() === trimId.toLowerCase())
            : customerList.find(c => c.customerId === trimId);

        if (customer && (customer.email || "").trim()) {
            const customerId = customer.customerId;
            const token = crypto.randomBytes(24).toString("hex");
            const expiresAt = Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000;

            let resetTokens = {};
            try {
                const resetData = await fs.readFile(RESET_TOKENS_PATH, "utf-8");
                resetTokens = JSON.parse(resetData);
            } catch (e) { resetTokens = {}; }
            resetTokens[customerId] = { token, expiresAt };
            await fs.writeFile(RESET_TOKENS_PATH, JSON.stringify(resetTokens, null, 2));

            const baseUrl = (req.protocol || "http") + "://" + (req.get("host") || "localhost");
            const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(customerId)}&key=${token}`;

            const mailPayload = {
                customerId: customer.customerId,
                customerName: customer.customerName || customerId,
                email: customer.email.trim()
            };
            const sent = await mailService.sendInviteEmail(mailPayload, inviteUrl, "", true);

            if (!sent.success) {
                delete resetTokens[customerId];
                await fs.writeFile(RESET_TOKENS_PATH, JSON.stringify(resetTokens, null, 2));
                console.error("[request-password-reset] Mail send failed:", sent.message);
            } else {
                console.log(`[request-password-reset] Sent reset link to ${customerId}`);
            }
            return res.json({ success: true, message: safeMessage });
        }

        // 管理者のパスワード再設定（顧客で見つからなかった場合）
        let adminList = [];
        try {
            const adminData = await fs.readFile(ADMINS_DB_PATH, "utf-8");
            adminList = JSON.parse(adminData);
        } catch (e) { adminList = []; }
        if (!Array.isArray(adminList)) adminList = [];
        const admin = isEmailInput
            ? adminList.find(a => (a.email || "").trim().toLowerCase() === trimId.toLowerCase())
            : adminList.find(a => a.adminId === trimId);

        if (admin) {
            const settings = await settingsService.getSettings();
            const mail = settings.mail || {};
            const toEmail = (admin.email && String(admin.email).trim())
                ? String(admin.email).trim()
                : (mail.supportNotifyTo && String(mail.supportNotifyTo).trim())
                    ? String(mail.supportNotifyTo).trim()
                    : "";
            if (toEmail) {
                const token = crypto.randomBytes(24).toString("hex");
                const expiresAt = Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000;
                let adminResetTokens = {};
                try {
                    const adminResetData = await fs.readFile(ADMIN_RESET_TOKENS_PATH, "utf-8");
                    adminResetTokens = JSON.parse(adminResetData);
                } catch (e) { adminResetTokens = {}; }
                adminResetTokens[admin.adminId] = { token, expiresAt };
                await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));

                const baseUrl = (req.protocol || "http") + "://" + (req.get("host") || "localhost");
                const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(admin.adminId)}&key=${token}`;
                const mailPayload = {
                    customerId: admin.adminId,
                    customerName: admin.name || admin.adminId,
                    email: toEmail
                };
                const sent = await mailService.sendInviteEmail(mailPayload, inviteUrl, "", true);
                if (!sent.success) {
                    delete adminResetTokens[admin.adminId];
                    await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));
                    console.error("[request-password-reset] Admin mail send failed:", sent.message);
                } else {
                    console.log(`[request-password-reset] Sent admin reset link to ${admin.adminId}`);
                }
            }
        }

        return res.json({ success: true, message: safeMessage });
    } catch (error) {
        console.error("Request Password Reset Error:", error);
        return res.json({ success: true, message: safeMessage });
    }
});

// ==========================================
// 6. 招待用リセット (Admin Invite Reset)
// ==========================================
router.post("/admin/invite-reset", async (req, res) => {
    // 管理者権限チェック
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: "権限がありません" });
    }

    const { customerId } = req.body;
    if (!customerId) {
        return res.json({ success: false, message: "顧客IDが指定されていません" });
    }

    try {
        // 招待用トークン生成（URLのkeyとして使用、顧客には見せない）
        const token = crypto.randomBytes(4).toString('hex');

        const result = await customerService.updateCustomerPassword(customerId, token);
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

        console.log(`招待用リセット実行: ${customerId} (${INVITE_EXPIRY_HOURS}時間有効)`);
        res.json({ success: true, tempPassword: token });

    } catch (error) {
        console.error("Invite Reset Error:", error);
        res.json({ success: false, message: "招待用リセット処理中にエラーが発生しました" });
    }
});

module.exports = router;