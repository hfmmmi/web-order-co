// routes/auth/adminSessionRoutes.js
// 管理者ログイン・セッション確認・ログアウト・顧客招待リセット
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { appendAdminAuthLog } = require("../../services/authAuditLogService");
const customerUserService = require("../../services/customerUserService");
const { INVITE_TOKENS_PATH } = require("../../services/authTokenStore");
const { validateBody } = require("../../middlewares/validate");
const { adminLoginSchema } = require("../../validators/requestSchemas");
const { clearAdminUserSession, performAdminLogin } = require("./adminSessionHelpers");

const INVITE_EXPIRY_HOURS = 24;

router.post("/admin/login", validateBody(adminLoginSchema), async (req, res) => {
    const email = String(req.body.id ?? "").trim().toLowerCase();
    try {
        return await performAdminLogin(req, res, email, req.body.pass);
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
            adminUserId: req.session.adminUserId || null,
            adminEmail: req.session.adminEmail || null,
            adminName: req.session.adminName || null,
            ip: req.ip
        }).catch(() => {});
        clearAdminUserSession(req);

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

    const { customerId, userId } = req.body;
    if (!userId && !customerId) {
        return res.json({ success: false, message: "ユーザーIDまたは顧客IDが指定されていません" });
    }

    try {
        let user;
        if (userId) {
            user = await customerUserService.getUserRecordById(userId);
        } else {
            const users = await customerUserService.getUsersByCustomerId(customerId);
            const first = users.find((u) => u.active !== false);
            if (first) user = await customerUserService.getUserRecordById(first.userId);
        }
        if (!user) {
            return res.json({ success: false, message: "招待対象のユーザーが見つかりません" });
        }

        const token = crypto.randomBytes(4).toString("hex");
        const result = await customerUserService.updateUserPassword(user.userId, token);
        if (!result.success) {
            return res.json({ success: false, message: result.message });
        }

        const expiryMs = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
        await require("../../services/authTokenStore").mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => {
            tokens[user.userId] = expiryMs;
        });

        console.log(`招待用リセット実行: ${user.email} (${INVITE_EXPIRY_HOURS}時間有効)`);
        res.json({ success: true, tempPassword: token, userId: user.userId });

    } catch (error) {
        console.error("Invite Reset Error:", error);
        res.json({ success: false, message: "招待用リセット処理中にエラーが発生しました" });
    }
});

module.exports = router;
