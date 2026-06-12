"use strict";

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const adminUserService = require("../../services/adminUserService");
const mailService = require("../../services/mailService");
const { validateBody } = require("../../middlewares/validate");
const {
    addAdminUserSchema,
    updateAdminUserSchema,
    adminUserInviteSchema
} = require("../../validators/requestSchemas");
const { requireAdmin } = require("./requireAdmin");
const { mutateJsonFile, INVITE_TOKENS_PATH } = require("../../services/authTokenStore");

const INVITE_EXPIRY_HOURS = 24;

router.get("/admin/admin-users", requireAdmin, async (req, res) => {
    try {
        const users = await adminUserService.getAllUsers();
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ success: false, message: "取得に失敗しました" });
    }
});

router.post("/admin/admin-users", requireAdmin, validateBody(addAdminUserSchema), async (req, res) => {
    try {
        const result = await adminUserService.addUser(req.body);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put("/admin/admin-users/:userId", requireAdmin, validateBody(updateAdminUserSchema), async (req, res) => {
    try {
        if (req.params.userId === req.session.adminUserId && req.body.active === false) {
            return res.status(400).json({ success: false, message: "ログイン中の自分自身は無効化できません" });
        }
        if (req.params.userId === req.session.adminUserId && req.body.role !== undefined) {
            return res.status(400).json({ success: false, message: "ログイン中の自分自身の権限は変更できません" });
        }
        const result = await adminUserService.updateUser({
            userId: req.params.userId,
            ...req.body
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post("/admin/admin-users/invite", requireAdmin, validateBody(adminUserInviteSchema), async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await adminUserService.getUserRecordById(userId);
        if (!user || user.active === false) {
            return res.json({ success: false, message: "ユーザーが見つかりません" });
        }
        if (!user.email) {
            return res.json({ success: false, message: "メールアドレスが登録されていません" });
        }

        const tempPassword = crypto.randomBytes(4).toString("hex");
        const pwResult = await adminUserService.updateUserPassword(userId, tempPassword);
        if (!pwResult.success) {
            return res.json(pwResult);
        }

        const expiryMs = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
        await mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => {
            tokens[userId] = expiryMs;
        });

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(userId)}&key=${encodeURIComponent(tempPassword)}`;
        const mailPayload = {
            customerId: user.userId,
            customerName: user.displayName || user.email,
            email: user.email
        };
        const mailResult = await mailService.sendInviteEmail(mailPayload, inviteUrl, tempPassword, false);

        if (mailResult.success) {
            return res.json({ success: true, message: `${user.email} 宛に招待メールを送信しました` });
        }
        return res.json({ success: true, message: "招待リンクを発行しました", inviteUrl, tempPassword });
    } catch (e) {
        console.error("Admin user invite error:", e);
        res.status(500).json({ success: false, message: e.message || "処理中にエラーが発生しました" });
    }
});

router.post("/upload-admin-user-data", requireAdmin, async (req, res) => {
    try {
        const result = await adminUserService.importUserUpload(req.body.fileData);
        res.json(result);
    } catch (e) {
        res.json({ success: false, message: e.message || "取込に失敗しました" });
    }
});

router.get("/admin/admin-users/template", requireAdmin, async (req, res) => {
    try {
        const buf = await adminUserService.getImportTemplateBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="admin-users-template.xlsx"');
        res.send(buf);
    } catch (e) {
        res.status(500).json({ message: "テンプレート生成に失敗しました" });
    }
});

module.exports = router;
