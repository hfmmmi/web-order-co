"use strict";

const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const bcrypt = require("bcryptjs");
const { dbPath } = require("../../dbPaths");
const settingsService = require("../../services/settingsService");
const mailService = require("../../services/mailService");
const { validateBody } = require("../../middlewares/validate");
const {
    adminSettingsUpdateSchema,
    adminAccountUpdateSchema
} = require("../../validators/requestSchemas");
const { requireAdmin } = require("./requireAdmin");

const ADMINS_DB_PATH = dbPath("admins.json");

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

module.exports = router;
