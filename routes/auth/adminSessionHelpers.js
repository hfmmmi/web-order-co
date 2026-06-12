"use strict";

const { regenerateSession, saveSession } = require("../../utils/sessionAsync");
const { appendAdminAuthLog } = require("../../services/authAuditLogService");
const adminUserService = require("../../services/adminUserService");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
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
const { sanitizeAdminName } = require("./sanitizeAdminName");

function applyAdminUserSession(req, user, preservedCustomerState) {
    req.session.customerId = preservedCustomerState.customerId || null;
    req.session.customerName = preservedCustomerState.customerName || null;
    req.session.priceRank = preservedCustomerState.priceRank || "";
    req.session.userId = preservedCustomerState.userId || null;
    req.session.userEmail = preservedCustomerState.userEmail || null;
    req.session.userDisplayName = preservedCustomerState.userDisplayName || null;
    req.session.isCustomerUserAdmin = !!preservedCustomerState.isCustomerUserAdmin;
    req.session.isAdmin = true;
    req.session.adminUserId = user.userId;
    req.session.adminEmail = user.email;
    req.session.adminDisplayName = user.displayName || user.email;
    req.session.adminName = sanitizeAdminName(user.displayName) || "Admin";
    req.session.adminRole = user.role === "user" ? "user" : "admin";
    req.session.proxyByAdmin = null;
    req.session.proxySavedCustomerId = null;
    req.session.proxySavedCustomerName = null;
    req.session.proxySavedPriceRank = null;
    req.session.lastActivity = Date.now();
}

function clearAdminUserSession(req) {
    req.session.isAdmin = false;
    req.session.adminUserId = null;
    req.session.adminEmail = null;
    req.session.adminDisplayName = null;
    req.session.adminName = null;
    req.session.adminRole = null;
}

async function performAdminLogin(req, res, email, pass) {
    const accountKey = "admin:" + email;

    if (await isLoginLocked(accountKey)) {
        return res.json({ success: false, message: LOGIN_LOCK_MESSAGE });
    }

    const failureCount = await getLoginFailureCount(accountKey);
    const settings = await settingsService.getSettings();
    const recaptchaSecret = (settings.recaptcha && settings.recaptcha.secretKey) ? String(settings.recaptcha.secretKey).trim() : "";
    if (failureCount >= LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES && recaptchaSecret) {
        const captchaToken = req.body.captchaToken;
        if (!captchaToken || typeof captchaToken !== "string" || !captchaToken.trim()) {
            return res.json({ success: false, message: LOGIN_CAPTCHA_REQUIRED_MESSAGE, captchaRequired: true });
        }
        const valid = await require("./recaptcha").verifyRecaptcha(captchaToken.trim(), recaptchaSecret);
        if (!valid) {
            return res.json({ success: false, message: LOGIN_CAPTCHA_FAILED_MESSAGE, captchaRequired: true });
        }
    }

    const auth = await adminUserService.authenticate(email, pass);
    if (!auth.success) {
        const r = await recordLoginFailure(accountKey);
        if (auth.user && r.justHitFive) {
            mailService.sendLoginFailureAlert({
                type: "admin",
                adminId: auth.user.userId,
                adminName: auth.user.displayName || auth.user.email,
                count: 5
            }).catch(() => {});
        }
        appendAdminAuthLog({
            action: "failed_login",
            adminUserId: auth.user ? auth.user.userId : null,
            adminEmail: email,
            ip: req.ip
        }).catch(() => {});
        return res.json({ success: false, message: auth.message });
    }

    const { user } = auth;
    await clearLoginFailures(accountKey);
    const preservedCustomerState = {
        customerId: req.session.customerId || null,
        customerName: req.session.customerName || null,
        priceRank: req.session.priceRank || "",
        userId: req.session.userId || null,
        userEmail: req.session.userEmail || null,
        userDisplayName: req.session.userDisplayName || null,
        isCustomerUserAdmin: !!req.session.isCustomerUserAdmin
    };
    await regenerateSession(req);
    applyAdminUserSession(req, user, preservedCustomerState);

    appendAdminAuthLog({
        action: "login",
        adminUserId: user.userId,
        adminEmail: user.email,
        adminName: user.displayName || user.email,
        ip: req.ip
    }).catch(() => {});
    adminUserService.touchLastLogin(user.userId).catch(() => {});

    console.log(`★管理者ログイン成功: ${user.email} (${user.displayName || user.email})`);

    try {
        await saveSession(req);
        return res.json({ success: true, redirectUrl: "admin/admin-dashboard.html" });
    } catch (err) {
        console.error("Session Save Error:", err);
        return res.json({ success: false, message: "セッション保存失敗" });
    }
}

module.exports = { applyAdminUserSession, clearAdminUserSession, performAdminLogin };
