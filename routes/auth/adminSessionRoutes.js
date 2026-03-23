// routes/auth/adminSessionRoutes.js
// 管理者ログイン・セッション確認・ログアウト・顧客招待リセット
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const { regenerateSession, saveSession } = require("../../utils/sessionAsync");
const { appendAdminAuthLog } = require("../../services/authAuditLogService");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const customerService = require("../../services/customerService");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const { ADMINS_DB_PATH, INVITE_TOKENS_PATH, mutateJsonFile } = require("../../services/authTokenStore");
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

const INVITE_EXPIRY_HOURS = 24;

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
            await regenerateSession(req);

            req.session.customerId = preservedCustomerState.customerId;
            req.session.customerName = preservedCustomerState.customerName;
            req.session.priceRank = preservedCustomerState.priceRank;
            req.session.isAdmin = true;
            req.session.adminName = sanitizeAdminName(admin.name) || "Admin";
            req.session.proxyByAdmin = null;
            req.session.proxySavedCustomerId = null;
            req.session.proxySavedCustomerName = null;
            req.session.proxySavedPriceRank = null;

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
                await mutateJsonFile(ADMINS_DB_PATH, [], (list) => {
                    const adm = list.find(a => a.adminId === id);
                    if (adm) adm.password = hashedPassword;
                });
            }

            try {
                await saveSession(req);
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

router.get("/admin/check", (req, res) => {
    res.json({ loggedIn: !!req.session.isAdmin });
});

router.post("/admin/logout", (req, res) => {
    if (req.session.isAdmin) {
        appendAdminAuthLog({
            action: "logout",
            adminName: req.session.adminName || null,
            ip: req.ip
        }).catch(() => {});
        req.session.isAdmin = false;
        req.session.adminName = null;

        if (!req.session.customerId) {
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

router.post("/admin/invite-reset", async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: "権限がありません" });
    }

    const { customerId } = req.body;
    if (!customerId) {
        return res.json({ success: false, message: "顧客IDが指定されていません" });
    }

    try {
        const token = crypto.randomBytes(4).toString("hex");

        const result = await customerService.updateCustomerPassword(customerId, token);
        if (!result.success) {
            return res.json({ success: false, message: result.message });
        }

        const expiryMs = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
        await mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => {
            tokens[customerId] = expiryMs;
        });

        console.log(`招待用リセット実行: ${customerId} (${INVITE_EXPIRY_HOURS}時間有効)`);
        res.json({ success: true, tempPassword: token });

    } catch (error) {
        console.error("Invite Reset Error:", error);
        res.json({ success: false, message: "招待用リセット処理中にエラーが発生しました" });
    }
});

module.exports = router;
