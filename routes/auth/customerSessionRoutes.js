// routes/auth/customerSessionRoutes.js
// 顧客ログイン・セッション・代理申請・アカウント設定・セットアップ・パスワード再設定依頼
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { mutateProxyRequests, PROXY_REQUEST_EXPIRY_MS } = require("../../utils/proxyRequestsStore");
const { regenerateSession, saveSession } = require("../../utils/sessionAsync");
const { appendCustomerAuthLog } = require("../../services/authAuditLogService");
const bcrypt = require("bcryptjs");

const customerService = require("../../services/customerService");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const { requestPasswordReset } = require("../../services/passwordResetRequestService");
const {
    INVITE_TOKENS_PATH,
    RESET_TOKENS_PATH,
    ADMIN_RESET_TOKENS_PATH,
    ADMINS_DB_PATH,
    mutateJsonFile
} = require("../../services/authTokenStore");
const { validateBody } = require("../../middlewares/validate");
const { loginSchema } = require("../../validators/requestSchemas");
const {
    LOGIN_LOCK_MESSAGE,
    LOGIN_CAPTCHA_REQUIRED_MESSAGE,
    LOGIN_CAPTCHA_FAILED_MESSAGE,
    LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES,
    isLoginLocked,
    recordLoginFailure,
    clearLoginFailures,
    getLoginFailureCount
} = require("./loginRateLimit");
const { verifyRecaptcha } = require("./recaptcha");
const { sanitizeAdminName } = require("./sanitizeAdminName");

const CUSTOMERS_DB_PATH = dbPath("customers.json");
const INVITE_EXPIRY_HOURS = 24;

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
            await regenerateSession(req);

            req.session.isAdmin = preservedAdminState.isAdmin;
            req.session.adminName = preservedAdminState.adminName;
            req.session.customerId = customer.customerId;
            req.session.customerName = customer.customerName;
            req.session.priceRank = customer.priceRank || "";
            req.session.proxyByAdmin = null;
            req.session.proxySavedCustomerId = null;
            req.session.proxySavedCustomerName = null;
            req.session.proxySavedPriceRank = null;

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
    }
});

router.get("/session", (req, res) => {
    const loggedIn = !!req.session.customerId;
    res.json({
        loggedIn,
        customerId: req.session.customerId || null,
        customerName: req.session.customerName || null,
        proxyByAdmin: req.session.proxyByAdmin || null
    });
});

router.get("/account/proxy-request", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    try {
        let body = { pending: false };
        await mutateProxyRequests(async (requests) => {
            const r = requests[req.session.customerId];
            if (!r) return;
            if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
                delete requests[req.session.customerId];
                return;
            }
            if (r.approved === true) return;
            body = { pending: true, adminName: sanitizeAdminName(r.adminName) || "管理者" };
        });
        res.json(body);
    } catch (e) {
        res.json({ pending: false });
    }
});

router.post("/account/proxy-request/approve", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    try {
        let out = { success: true, message: "既に処理済みです" };
        await mutateProxyRequests(async (requests) => {
            const r = requests[req.session.customerId];
            if (!r) return;
            if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
                delete requests[req.session.customerId];
                out = { success: false, message: "申請の有効期限が切れています" };
                return;
            }
            r.approved = true;
            r.approvedAt = Date.now();
            out = { success: true, message: "許可しました。管理者が代理ログインを実行できます。" };
        });
        res.json(out);
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
        await mutateProxyRequests(async (requests) => {
            delete requests[req.session.customerId];
        });
        res.json({ success: true, message: "却下しました。" });
    } catch (e) {
        console.error("Proxy reject error:", e);
        res.status(500).json({ message: "処理に失敗しました" });
    }
});

router.get("/account/settings", (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    customerService.getCustomerById(req.session.customerId)
        .then(c => {
            if (!c) return res.status(404).json({ message: "顧客が見つかりません" });
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

router.post("/logout", (req, res) => {
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

        if (!req.session.isAdmin) {
            return req.session.destroy(() => {
                res.clearCookie("weborder.sid");
                res.json({ success: true });
            });
        }
    }

    req.session.save(() => {
        res.json({ success: true });
    });
});

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
        const resetKind = await mutateJsonFile(RESET_TOKENS_PATH, {}, async (resetTokens) => {
            if (!resetTokens[id] || resetTokens[id].token !== tokenOrPass) return "none";
            if (Date.now() > resetTokens[id].expiresAt) {
                delete resetTokens[id];
                return "expired_customer_reset";
            }
            return "valid_customer_reset";
        });

        if (resetKind === "expired_customer_reset") {
            return res.json({
                success: false,
                message: "このリンクの有効期限（24時間）が切れています。再度「パスワードをお忘れの方」から申請してください。"
            });
        }

        if (resetKind === "valid_customer_reset") {
            const result = await customerService.updateCustomerPassword(id, newPass);
            if (!result.success) {
                return res.json(result);
            }
            await mutateJsonFile(RESET_TOKENS_PATH, {}, (t) => { delete t[id]; });
            console.log(`パスワード再設定完了（顧客申込）: ${id}`);
            const customer = await customerService.getCustomerById(id);
            if (customer && customer.email) {
                mailService.sendPasswordChangedNotification(customer).catch(err => console.error("[request-password-reset] 変更完了通知送信失敗:", err));
            }
            return res.json({ success: true, message: "パスワードを変更しました。ログインしてください。" });
        }

        const adminResetKind = await mutateJsonFile(ADMIN_RESET_TOKENS_PATH, {}, async (adminResetTokens) => {
            if (!adminResetTokens[id] || adminResetTokens[id].token !== tokenOrPass) return "none";
            if (Date.now() > adminResetTokens[id].expiresAt) {
                delete adminResetTokens[id];
                return "expired_admin_reset";
            }
            return "valid_admin_reset";
        });

        if (adminResetKind === "expired_admin_reset") {
            return res.json({
                success: false,
                message: "このリンクの有効期限（24時間）が切れています。再度「パスワードをお忘れの方」から申請してください。"
            });
        }

        if (adminResetKind === "valid_admin_reset") {
            const hashedPassword = await bcrypt.hash(newPass, 10);
            const adminUpdate = await mutateJsonFile(ADMINS_DB_PATH, [], async (adminList) => {
                const admin = adminList.find(a => a.adminId === id);
                if (!admin) return { ok: false };
                admin.password = hashedPassword;
                return { ok: true };
            });
            if (!adminUpdate.ok) {
                await mutateJsonFile(ADMIN_RESET_TOKENS_PATH, {}, (t) => { delete t[id]; });
                return res.json({ success: false, message: "管理者が見つかりません" });
            }
            await mutateJsonFile(ADMIN_RESET_TOKENS_PATH, {}, (t) => { delete t[id]; });
            console.log(`パスワード再設定完了（管理者）: ${id}`);
            return res.json({ success: true, message: "パスワードを変更しました。管理者ログイン画面からログインしてください。" });
        }

        const inviteState = await mutateJsonFile(INVITE_TOKENS_PATH, {}, async (tokens) => {
            if (!tokens[id]) return { hasInvite: false };
            const expiresAt = tokens[id];
            if (Date.now() > expiresAt) {
                return { hasInvite: true, expired: true };
            }
            return { hasInvite: true, expired: false };
        });

        if (inviteState.hasInvite && inviteState.expired) {
            return res.json({
                success: false,
                message: "この招待リンクの有効期限（24時間）が切れています。管理者に新しい招待リンクの発行をお願いしてください。"
            });
        }

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

        const result = await customerService.updateCustomerPassword(id, newPass);

        if (result.success) {
            if (inviteState.hasInvite && !inviteState.expired) {
                await mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => { delete tokens[id]; });
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

router.post("/request-password-reset", async (req, res) => {
    const clientIp = (req.ip || req.connection?.remoteAddress || "unknown").toString();
    const out = await requestPasswordReset({
        rawId: req.body?.id,
        clientIp,
        protocol: req.protocol || "http",
        host: req.get("host") || "localhost"
    });
    return res.json(out);
});

module.exports = router;
