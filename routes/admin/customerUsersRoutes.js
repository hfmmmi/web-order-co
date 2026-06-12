"use strict";

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const customerUserService = require("../../services/customerUserService");
const mailService = require("../../services/mailService");
const { validateBody } = require("../../middlewares/validate");
const {
    addCustomerUserSchema,
    updateCustomerUserSchema,
    customerUserInviteSchema
} = require("../../validators/requestSchemas");
const { requireAdmin } = require("./requireAdmin");
const { mutateJsonFile, INVITE_TOKENS_PATH } = require("../../services/authTokenStore");

const INVITE_EXPIRY_HOURS = 24;

router.get("/admin/customers/:customerId/users", requireAdmin, async (req, res) => {
    try {
        const customerId = String(req.params.customerId || "").trim();
        const users = await customerUserService.getUsersByCustomerId(customerId);
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ success: false, message: "取得に失敗しました" });
    }
});

router.post("/admin/customer-users", requireAdmin, validateBody(addCustomerUserSchema), async (req, res) => {
    try {
        const result = await customerUserService.addUser(req.body);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put("/admin/customer-users/:userId", requireAdmin, validateBody(updateCustomerUserSchema), async (req, res) => {
    try {
        const result = await customerUserService.updateUser({
            userId: req.params.userId,
            ...req.body
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post("/admin/customer-users/:userId/deactivate", requireAdmin, async (req, res) => {
    try {
        const result = await customerUserService.deactivateUser(req.params.userId);
        res.json(result.success
            ? { success: true, message: "ユーザーを無効化しました" }
            : result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post("/upload-customer-user-data", requireAdmin, async (req, res) => {
    try {
        const result = await customerUserService.importUserUpload(req.body.fileData);
        res.json(result);
    } catch (e) {
        res.json({ success: false, message: e.message || "取込に失敗しました" });
    }
});

router.get("/admin/customer-users/template", requireAdmin, async (req, res) => {
    try {
        const buf = await customerUserService.getImportTemplateBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="customer-users-template.xlsx"');
        res.send(buf);
    } catch (e) {
        res.status(500).json({ message: "テンプレート生成に失敗しました" });
    }
});

router.post("/admin/customer-users/invite", requireAdmin, validateBody(customerUserInviteSchema), async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await customerUserService.getUserRecordById(userId);
        if (!user || user.active === false) {
            return res.json({ success: false, message: "ユーザーが見つかりません" });
        }
        if (!user.email) {
            return res.json({ success: false, message: "メールアドレスが登録されていません" });
        }

        const tempPassword = crypto.randomBytes(4).toString("hex");
        const pwResult = await customerUserService.updateUserPassword(userId, tempPassword);
        if (!pwResult.success) {
            return res.json(pwResult);
        }

        const expiryMs = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
        await mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => {
            tokens[userId] = expiryMs;
        });

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(userId)}&key=${encodeURIComponent(tempPassword)}`;
        const customerService = require("../../services/customerService");
        const customer = await customerService.getCustomerById(user.customerId);
        const mailPayload = {
            customerId: user.customerId,
            customerName: customer ? customer.customerName : user.customerId,
            email: user.email
        };
        const mailResult = await mailService.sendInviteEmail(mailPayload, inviteUrl, tempPassword, false);

        if (mailResult.success) {
            return res.json({ success: true, message: `${user.email} 宛に招待メールを送信しました` });
        }
        return res.json({ success: true, message: "招待リンクを発行しました", inviteUrl, tempPassword });
    } catch (e) {
        console.error("Customer user invite error:", e);
        res.status(500).json({ success: false, message: e.message || "処理中にエラーが発生しました" });
    }
});

router.post("/admin/customer-users/invite-reset", requireAdmin, validateBody(customerUserInviteSchema), async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await customerUserService.getUserRecordById(userId);
        if (!user || user.active === false) {
            return res.json({ success: false, message: "ユーザーが見つかりません" });
        }

        const tempPassword = crypto.randomBytes(4).toString("hex");
        const pwResult = await customerUserService.updateUserPassword(userId, tempPassword);
        if (!pwResult.success) {
            return res.json(pwResult);
        }

        const expiryMs = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
        await mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => {
            tokens[userId] = expiryMs;
        });

        res.json({ success: true, tempPassword });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message || "処理中にエラーが発生しました" });
    }
});

module.exports = router;
