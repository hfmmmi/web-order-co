"use strict";

const express = require("express");
const router = express.Router();
const settingsService = require("../../services/settingsService");
const mailService = require("../../services/mailService");
const adminAccountService = require("../../services/adminAccountService");
const customerUserService = require("../../services/customerUserService");
const mailHistoryService = require("../../services/mailHistoryService");
const { validateBody } = require("../../middlewares/validate");
const {
    adminSettingsUpdateSchema,
    adminAccountUpdateSchema,
    adminAccountsSaveSchema,
    customerUsersSaveSchema
} = require("../../validators/requestSchemas");
const { requireAdmin } = require("./requireAdmin");

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

router.put("/admin/settings", requireAdmin, validateBody(adminSettingsUpdateSchema), async (req, res) => {
    try {
        const partial = req.body;
        await settingsService.updateSettings(partial);
        if (mailService.clearTransporterCache) mailService.clearTransporterCache();
        res.json({ success: true, message: "設定を保存しました" });
    } catch (e) {
        res.status(500).json({ message: e.message || "設定の保存に失敗しました" });
    }
});

router.get("/admin/accounts", requireAdmin, async (req, res) => {
    try {
        const accounts = await adminAccountService.getAdminAccountsPublic();
        res.json({ success: true, accounts });
    } catch (e) {
        res.status(500).json({ success: false, message: "管理者アカウントの取得に失敗しました" });
    }
});

router.put("/admin/accounts", requireAdmin, validateBody(adminAccountsSaveSchema), async (req, res) => {
    try {
        const accounts = await adminAccountService.saveAdminAccounts(req.body.accounts || []);
        res.json({ success: true, message: "管理者アカウントを保存しました", accounts });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message || "管理者アカウントの保存に失敗しました" });
    }
});

router.get("/admin/customer-users", requireAdmin, async (req, res) => {
    try {
        const users = await customerUserService.getCustomerUsersPublic();
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ success: false, message: "担当者アカウントの取得に失敗しました" });
    }
});

router.put("/admin/customer-users", requireAdmin, validateBody(customerUsersSaveSchema), async (req, res) => {
    try {
        const users = await customerUserService.saveCustomerUsers(req.body.users || []);
        res.json({ success: true, message: "担当者アカウントを保存しました", users });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message || "担当者アカウントの保存に失敗しました" });
    }
});

router.get("/admin/mail-history", requireAdmin, async (req, res) => {
    try {
        const page = req.query.page;
        const limit = req.query.limit;
        const keyword = req.query.keyword;
        const result = await mailHistoryService.getMailHistory({ page, limit, keyword });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("mail-history get error:", e);
        res.status(500).json({ success: false, message: "メール送信履歴の取得に失敗しました" });
    }
});

/** @deprecated 先頭1件のみ（後方互換） */
router.get("/admin/account", requireAdmin, async (req, res) => {
    try {
        const accounts = await adminAccountService.getAdminAccountsPublic();
        if (!accounts.length) {
            return res.json({ adminId: "", name: "", passwordSet: false, email: "" });
        }
        const admin = accounts[0];
        res.json({
            adminId: admin.adminId || "",
            name: admin.name || "",
            passwordSet: !!admin.passwordSet,
            email: admin.email || ""
        });
    } catch (e) {
        res.status(500).json({ message: "管理者アカウントの取得に失敗しました" });
    }
});

/** @deprecated 先頭1件のみ更新（後方互換・テスト用） */
router.put("/admin/account", requireAdmin, validateBody(adminAccountUpdateSchema), async (req, res) => {
    try {
        const { adminId, name, password, email } = req.body;
        const existing = await adminAccountService.getAdminAccountsPublic();
        const rest = existing.slice(1).map((a) => ({
            adminId: a.adminId,
            name: a.name,
            email: a.email
        }));
        const accounts = [
            {
                adminId,
                name: name !== undefined ? name : "",
                email: email !== undefined ? email : "",
                ...(password && String(password).trim() ? { password: String(password).trim() } : {})
            },
            ...rest
        ];
        await adminAccountService.saveAdminAccounts(accounts);
        res.json({ success: true, message: "管理者アカウントを保存しました" });
    } catch (e) {
        const status = /初回|4文字|1件以上|重複/.test(String(e.message || "")) ? 400 : 500;
        res.status(status).json({ message: e.message || "管理者アカウントの保存に失敗しました" });
    }
});

module.exports = router;
