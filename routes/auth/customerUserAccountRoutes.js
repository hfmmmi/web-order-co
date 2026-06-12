"use strict";

const express = require("express");
const router = express.Router();
const customerUserService = require("../../services/customerUserService");
const { validateBody } = require("../../middlewares/validate");
const {
    addCustomerUserSchema,
    updateCustomerUserSchema
} = require("../../validators/requestSchemas");

function requireCustomerLogin(req, res, next) {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    next();
}

function requireCustomerUserAdmin(req, res, next) {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    const canManage = !!req.session.isCustomerUserAdmin
        || (!!req.session.isAdmin && !!req.session.proxyByAdmin);
    if (!canManage) {
        return res.status(403).json({ message: "この操作には企業管理者権限が必要です" });
    }
    next();
}

router.get("/account/users", requireCustomerUserAdmin, async (req, res) => {
    try {
        const users = await customerUserService.getUsersByCustomerId(req.session.customerId);
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ success: false, message: "取得に失敗しました" });
    }
});

router.post("/account/users", requireCustomerUserAdmin, validateBody(addCustomerUserSchema), async (req, res) => {
    try {
        if (req.body.customerId && req.body.customerId !== req.session.customerId) {
            return res.status(403).json({ success: false, message: "自社以外のユーザーは登録できません" });
        }
        const result = await customerUserService.addUser({
            ...req.body,
            customerId: req.session.customerId
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put("/account/users/:userId", requireCustomerUserAdmin, validateBody(updateCustomerUserSchema), async (req, res) => {
    try {
        const user = await customerUserService.getUserRecordById(req.params.userId);
        if (!user || user.customerId !== req.session.customerId) {
            return res.status(404).json({ success: false, message: "ユーザーが見つかりません" });
        }
        if (req.params.userId === req.session.userId && req.body.active === false) {
            return res.status(400).json({ success: false, message: "ログイン中の自分自身は無効化できません" });
        }
        const result = await customerUserService.updateUser({
            userId: req.params.userId,
            ...req.body
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post("/account/users/:userId/deactivate", requireCustomerUserAdmin, async (req, res) => {
    try {
        if (req.params.userId === req.session.userId) {
            return res.status(400).json({ success: false, message: "ログイン中の自分自身は無効化できません" });
        }
        const user = await customerUserService.getUserRecordById(req.params.userId);
        if (!user || user.customerId !== req.session.customerId) {
            return res.status(404).json({ success: false, message: "ユーザーが見つかりません" });
        }
        const result = await customerUserService.deactivateUser(req.params.userId);
        res.json(result.success
            ? { success: true, message: "ユーザーを無効化しました" }
            : result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get("/account/profile", requireCustomerLogin, (req, res) => {
    res.json({
        success: true,
        customerId: req.session.customerId,
        customerName: req.session.customerName,
        userId: req.session.userId || req.session.customerUserId || null,
        userEmail: req.session.userEmail || null,
        userDisplayName: req.session.userDisplayName || null,
        isCustomerUserAdmin: !!req.session.isCustomerUserAdmin,
        proxyByAdmin: req.session.proxyByAdmin || null,
        isAdmin: !!req.session.isAdmin
    });
});

module.exports = router;
