"use strict";

const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const crypto = require("crypto");
const { dbPath } = require("../../dbPaths");
const customerService = require("../../services/customerService");
const mailService = require("../../services/mailService");
const { PROXY_REQUEST_EXPIRY_MS } = require("../../utils/proxyRequestsStore");
const { regenerateSession } = require("../../utils/sessionAsync");
const { validateBody } = require("../../middlewares/validate");
const {
    addCustomerSchema,
    updateCustomerSchema
} = require("../../validators/requestSchemas");
const { requireAdmin } = require("./requireAdmin");

const INVITE_TOKENS_PATH = dbPath("invite_tokens.json");
const INVITE_EXPIRY_HOURS = 24;

router.get("/admin/customers", requireAdmin, async (req, res) => {
    try {
        const keyword = req.query.keyword || "";
        const page = parseInt(req.query.page) || 1;
        const result = await customerService.getAllCustomers(keyword, page);
        res.json(result);
    } catch (e) {
        console.error("Customer Fetch Error:", e);
        res.status(500).json({ message: "取得失敗" });
    }
});

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
        await require("../../utils/proxyRequestsStore").mutateProxyRequests(async (requests) => {
            requests[customerId] = {
                requestedAt: Date.now(),
                adminName: req.session.adminName || "Admin",
                approved: false
            };
        });
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

router.get("/admin/proxy-request-status", requireAdmin, async (req, res) => {
    const customerId = req.query.customerId;
    if (!customerId) {
        return res.json({ status: "none" });
    }
    try {
        let status = "none";
        await require("../../utils/proxyRequestsStore").mutateProxyRequests(async (requests) => {
            const r = requests[customerId];
            if (!r) return;
            if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
                delete requests[customerId];
                return;
            }
            if (r.approved === true) {
                status = "approved";
            } else {
                status = "pending";
            }
        });
        return res.json({ status });
    } catch (e) {
        return res.json({ status: "none" });
    }
});

router.post("/admin/proxy-login", requireAdmin, async (req, res) => {
    const { customerId } = req.body;
    if (!customerId) {
        return res.status(400).json({ success: false, message: "顧客IDを指定してください" });
    }
    try {
        const customer = await customerService.getCustomerById(customerId);
        const gate = await require("../../utils/proxyRequestsStore").mutateProxyRequests(async (requests) => {
            const r = requests[customerId];
            if (!r || r.approved !== true) {
                return "not_approved";
            }
            if (Date.now() - r.requestedAt > PROXY_REQUEST_EXPIRY_MS) {
                delete requests[customerId];
                return "expired";
            }
            if (!customer) {
                delete requests[customerId];
                return "no_customer";
            }
            delete requests[customerId];
            return "ok";
        });
        if (gate === "not_approved") {
            return res.json({
                success: false,
                message: "顧客の許可がまだありません。顧客画面で「許可」が押されるまでお待ちください。"
            });
        }
        if (gate === "expired") {
            return res.json({ success: false, message: "許可の有効期限（10分）が切れています。再度申請してください。" });
        }
        if (gate === "no_customer") {
            return res.json({ success: false, message: "顧客が見つかりません" });
        }
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
        await regenerateSession(req);

        req.session.isAdmin = adminState.isAdmin;
        req.session.adminName = adminState.adminName;
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
            await require("../../utils/sessionAsync").saveSession(req);
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

router.post("/admin/proxy-logout", (req, res) => {
    if (!req.session.proxyByAdmin) {
        return res.status(400).json({ success: false, message: "代理ログイン中ではありません" });
    }
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

module.exports = router;
