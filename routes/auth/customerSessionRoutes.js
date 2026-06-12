// routes/auth/customerSessionRoutes.js
// 顧客ログイン・セッション・代理申請・アカウント設定・セットアップ・パスワード再設定依頼
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { PROXY_REQUEST_EXPIRY_MS } = require("../../utils/proxyRequestsStore");
const { regenerateSession } = require("../../utils/sessionAsync");
const { appendCustomerAuthLog } = require("../../services/authAuditLogService");
const bcrypt = require("bcryptjs");

const customerService = require("../../services/customerService");
const customerUserService = require("../../services/customerUserService");
const adminUserService = require("../../services/adminUserService");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const { requestPasswordReset } = require("../../services/passwordResetRequestService");
const {
    INVITE_TOKENS_PATH,
    RESET_TOKENS_PATH,
    ADMIN_RESET_TOKENS_PATH,
    ADMINS_DB_PATH
} = require("../../services/authTokenStore");
const { validateBody } = require("../../middlewares/validate");
const { mailLogMetaFromSession } = require("../../utils/mailLogMeta");
const { customerLoginSchema, updateAccountDeliverySchema, updateAccountProfileSchema } = require("../../validators/requestSchemas");
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
const { applyAdminUserSession, performAdminLogin } = require("./adminSessionHelpers");

const CUSTOMERS_DB_PATH = dbPath("customers.json");
const CUSTOMER_USER_RESET_TOKENS_PATH = dbPath("customer_user_reset_tokens.json");
const INVITE_EXPIRY_HOURS = 24;

function applyCustomerUserSession(req, user, customer, preservedAdminState) {
    req.session.isAdmin = preservedAdminState.isAdmin;
    req.session.adminName = preservedAdminState.adminName;
    req.session.customerId = customer.customerId;
    req.session.customerName = customer.customerName;
    req.session.priceRank = customer.priceRank || "";
    req.session.userId = user.userId;
    req.session.userEmail = user.email;
    req.session.userDisplayName = user.displayName || user.email;
    req.session.customerUserId = user.userId;
    req.session.contactName = user.displayName || user.email;
    req.session.isCustomerUserAdmin = user.role === "admin";
    req.session.proxyByAdmin = null;
    req.session.proxySavedCustomerId = null;
    req.session.proxySavedCustomerName = null;
    req.session.proxySavedPriceRank = null;
    req.session.lastActivity = Date.now();
}

function clearCustomerUserSession(req) {
    req.session.customerId = null;
    req.session.customerName = null;
    req.session.priceRank = null;
    req.session.customerUserId = null;
    req.session.contactName = null;
    req.session.userId = null;
    req.session.userEmail = null;
    req.session.userDisplayName = null;
    req.session.isCustomerUserAdmin = false;
}

router.post("/login", validateBody(customerLoginSchema), async (req, res) => {
    const { id, pass, captchaToken } = req.body;
    const email = String(id ?? "").trim().toLowerCase();
    const accountKey = "customer:" + email;

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
            const valid = await require("./recaptcha").verifyRecaptcha(captchaToken.trim(), recaptchaSecret);
            if (!valid) {
                return res.json({ success: false, message: LOGIN_CAPTCHA_FAILED_MESSAGE, captchaRequired: true });
            }
        }

        const customerFound = await customerUserService.findByEmail(email);
        const adminFound = await adminUserService.findByEmail(email);

        if (customerFound) {
            const auth = await customerUserService.authenticate(email, pass);
            if (!auth.success) {
                const r = await recordLoginFailure(accountKey);
                if (auth.user && auth.customer && r.justHitFive) {
                    mailService.sendLoginFailureAlert({
                        type: "customer",
                        customer: { ...auth.customer, email: auth.user.email },
                        count: 5
                    }).catch(() => {});
                }
                if (auth.user && auth.customer) {
                    appendCustomerAuthLog({
                        action: "failed_login",
                        customerId: auth.customer.customerId,
                        customerName: auth.customer.customerName || null,
                        userId: auth.user.userId,
                        userEmail: auth.user.email,
                        ip: req.ip
                    }).catch(() => {});
                } else {
                    appendCustomerAuthLog({
                        action: "failed_login",
                        userEmail: email,
                        ip: req.ip
                    }).catch(() => {});
                }
                return res.json({ success: false, message: auth.message });
            }

            const { user, customer } = auth;
            await clearLoginFailures(accountKey);
            const preservedAdminState = {
                isAdmin: !!req.session.isAdmin,
                adminName: req.session.adminName || null
            };
            await regenerateSession(req);
            applyCustomerUserSession(req, user, customer, preservedAdminState);
            req.session.customerUserId = user.userId;
            req.session.contactName = user.displayName || user.email || "";

            appendCustomerAuthLog({
                action: "login",
                customerId: customer.customerId,
                customerName: customer.customerName || null,
                userId: user.userId,
                userEmail: user.email,
                ip: req.ip
            }).catch(() => {});
            customerUserService.touchLastLogin(user.userId).catch(() => {});

            console.log(`顧客ログイン成功: ${user.email} @ ${customer.customerId} (AdminStatus: ${req.session.isAdmin})`);

            try {
                await require("../../utils/sessionAsync").saveSession(req);
                return res.json({ success: true, redirectUrl: "home.html" });
            } catch (err) {
                console.error("Session Save Error:", err);
                return res.json({ success: false, message: "セッション保存失敗" });
            }
        }

        if (adminFound) {
            return performAdminLogin(req, res, email, pass);
        }

        await recordLoginFailure(accountKey);
        appendCustomerAuthLog({
            action: "failed_login",
            userEmail: email,
            ip: req.ip
        }).catch(() => {});
        return res.json({ success: false, message: "メールアドレスまたはパスワードが間違っています" });
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
        customerUserId: req.session.userId || req.session.customerUserId || null,
        contactName: req.session.userDisplayName || req.session.contactName || null,
        userId: req.session.userId || null,
        userEmail: req.session.userEmail || null,
        userDisplayName: req.session.userDisplayName || null,
        isCustomerUserAdmin: !!req.session.isCustomerUserAdmin,
        proxyByAdmin: req.session.proxyByAdmin || null
    });
});

router.get("/account/proxy-request", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    try {
        let body = { pending: false };
        await require("../../utils/proxyRequestsStore").mutateProxyRequests(async (requests) => {
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
        await require("../../utils/proxyRequestsStore").mutateProxyRequests(async (requests) => {
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
        await require("../../utils/proxyRequestsStore").mutateProxyRequests(async (requests) => {
            delete requests[req.session.customerId];
        });
        res.json({ success: true, message: "却下しました。" });
    } catch (e) {
        console.error("Proxy reject error:", e);
        res.status(500).json({ message: "処理に失敗しました" });
    }
});

router.get("/account/profile", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ success: false, message: "ログインが必要です" });
    }
    try {
        const customer = await customerService.getCustomerById(req.session.customerId);
        if (!customer) {
            return res.status(404).json({ success: false, message: "顧客が見つかりません" });
        }

        if (req.session.customerUserId || req.session.userId) {
            const sessionUserId = req.session.userId || req.session.customerUserId;
            const user = await customerUserService.getUserRecordById(sessionUserId);
            if (!user || user.customerId !== req.session.customerId) {
                return res.status(404).json({ success: false, message: "担当者アカウントが見つかりません" });
            }
            const publicUser = customerUserService.toPublicCustomerUser(user);
            return res.json({
                success: true,
                accountType: "staff",
                userId: publicUser.userId,
                contactName: publicUser.displayName || publicUser.contactName || "",
                customerId: customer.customerId,
                customerName: customer.customerName || customer.customerId,
                email: publicUser.email || "",
                passwordSet: !!publicUser.passwordSet,
                isCustomerUserAdmin: user.role === "admin",
                proxyByAdmin: req.session.proxyByAdmin || null,
                isAdmin: !!req.session.isAdmin
            });
        }

        res.json({
            success: true,
            accountType: "company",
            customerId: customer.customerId,
            customerName: customer.customerName || customer.customerId,
            email: (customer.email && String(customer.email).trim()) || "",
            passwordSet: true,
            isCustomerUserAdmin: false,
            proxyByAdmin: req.session.proxyByAdmin || null,
            isAdmin: !!req.session.isAdmin
        });
    } catch (err) {
        console.error("Account profile get error:", err);
        res.status(500).json({ success: false, message: "アカウント情報の取得に失敗しました" });
    }
});

router.put("/account/profile", validateBody(updateAccountProfileSchema), async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ success: false, message: "ログインが必要です" });
    }

    const body = req.body || {};
    const currentPassword = body.currentPassword;
    const newPassword = body.password && String(body.password).trim() ? body.password : "";

    try {
        if (req.session.customerUserId || req.session.userId) {
            const sessionUserId = req.session.userId || req.session.customerUserId;
            const result = await customerUserService.updateCustomerUserProfile(sessionUserId, {
                contactName: body.contactName,
                email: body.email,
                currentPassword,
                password: newPassword
            });
            if (!result.success) {
                return res.status(400).json(result);
            }
            if (result.user) {
                if (result.user.displayName !== undefined) {
                    req.session.userDisplayName = result.user.displayName;
                    req.session.contactName = result.user.displayName;
                }
                if (result.user.email !== undefined) {
                    req.session.userEmail = result.user.email;
                }
                await require("../../utils/sessionAsync").saveSession(req);
            }
            if (newPassword && result.user && result.user.email) {
                mailService
                    .sendPasswordChangedNotification(
                        {
                            customerId: result.user.userId,
                            customerName: result.user.displayName || result.user.userId,
                            email: result.user.email
                        },
                        mailLogMetaFromSession(req.session)
                    )
                    .catch((err) => console.error("[account/profile] 変更完了通知送信失敗:", err));
            }
            return res.json({
                success: true,
                message: result.message,
                contactName: result.user ? (result.user.displayName || result.user.contactName) : req.session.contactName
            });
        }

        const passwordOk = await customerService.verifyCustomerPassword(
            req.session.customerId,
            currentPassword
        );
        if (!passwordOk) {
            return res.status(400).json({ success: false, message: "現在のパスワードが正しくありません" });
        }
        if (!newPassword) {
            return res.status(400).json({
                success: false,
                message: "会社アカウントではパスワードの変更のみ可能です"
            });
        }

        const result = await customerService.updateCustomerPassword(req.session.customerId, newPassword);
        if (!result.success) {
            return res.status(400).json(result);
        }
        const customer = await customerService.getCustomerById(req.session.customerId);
        if (customer && customer.email) {
            mailService
                .sendPasswordChangedNotification(customer, mailLogMetaFromSession(req.session))
                .catch((err) => console.error("[account/profile] 変更完了通知送信失敗:", err));
        }
        return res.json({ success: true, message: "パスワードを変更しました" });
    } catch (err) {
        console.error("Account profile update error:", err);
        res.status(500).json({ success: false, message: "アカウント設定の保存に失敗しました" });
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

router.get("/account/delivery", (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    customerService.getCustomerDeliveryById(req.session.customerId)
        .then((data) => {
            if (!data) return res.status(404).json({ message: "顧客が見つかりません" });
            res.json({ success: true, delivery: data });
        })
        .catch((err) => {
            console.error("Account delivery get error:", err);
            res.status(500).json({ message: "納品先の取得に失敗しました" });
        });
});

router.put("/account/delivery", validateBody(updateAccountDeliverySchema), (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    const body = req.body || {};
    customerService.updateCustomerDelivery(req.session.customerId, {
        deliveryName: body.deliveryName ?? "",
        deliveryZip: body.deliveryZip ?? "",
        deliveryAddress: body.deliveryAddress ?? "",
        deliveryTel: body.deliveryTel ?? ""
    })
        .then((result) => {
            if (!result.success) return res.status(400).json(result);
            res.json({ success: true, message: result.message });
        })
        .catch((err) => {
            console.error("Account delivery update error:", err);
            res.status(500).json({ message: "納品先の保存に失敗しました" });
        });
});

router.post("/logout", (req, res) => {
    if (req.session.customerId || req.session.userId) {
        appendCustomerAuthLog({
            action: "logout",
            customerId: req.session.customerId || null,
            customerName: req.session.customerName || null,
            userId: req.session.userId || null,
            userEmail: req.session.userEmail || null,
            ip: req.ip
        }).catch(() => {});
        clearCustomerUserSession(req);

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
        const resetKind = await require("../../services/authTokenStore").mutateJsonFile(RESET_TOKENS_PATH, {}, async (resetTokens) => {
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
            const result = await customerUserService.updateUserPassword(id, newPass);
            if (!result.success) {
                return res.json(result);
            }
            await require("../../services/authTokenStore").mutateJsonFile(RESET_TOKENS_PATH, {}, (t) => { delete t[id]; });
            console.log(`パスワード再設定完了（顧客ユーザー）: ${id}`);
            const user = await customerUserService.getUserRecordById(id);
            if (user && user.email) {
                const customer = await customerService.getCustomerById(user.customerId);
                mailService
                    .sendPasswordChangedNotification(
                        {
                            customerId: user.customerId,
                            customerName: customer ? customer.customerName : user.customerId,
                            email: user.email
                        },
                        { actorLabel: "システム（自動）" }
                    )
                    .catch((err) => console.error("[setup] 変更完了通知送信失敗:", err));
            }
            return res.json({ success: true, message: "パスワードを変更しました。ログインしてください。" });
        }

        const adminResetKind = await require("../../services/authTokenStore").mutateJsonFile(ADMIN_RESET_TOKENS_PATH, {}, async (adminResetTokens) => {
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
            const result = await adminUserService.updateUserPassword(id, newPass);
            if (!result.success) {
                await require("../../services/authTokenStore").mutateJsonFile(ADMIN_RESET_TOKENS_PATH, {}, (t) => { delete t[id]; });
                return res.json(result);
            }
            await require("../../services/authTokenStore").mutateJsonFile(ADMIN_RESET_TOKENS_PATH, {}, (t) => { delete t[id]; });
            console.log(`パスワード再設定完了（管理者ユーザー）: ${id}`);
            return res.json({ success: true, message: "パスワードを変更しました。ログインしてください。" });
        }

        const inviteState = await require("../../services/authTokenStore").mutateJsonFile(INVITE_TOKENS_PATH, {}, async (tokens) => {
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

        const adminUser = await adminUserService.getUserRecordById(id);
        const user = await customerUserService.getUserRecordById(id);
        const accountUser = adminUser || user;
        if (!accountUser || accountUser.active === false) {
            return res.json({ success: false, message: "ユーザーが見つかりません" });
        }

        const isMatch = await bcrypt.compare(tokenOrPass, accountUser.password);

        if (!isMatch) {
            return res.json({ success: false, message: "リンクが無効か、パスワードが間違っています" });
        }

        const updatePassword = adminUser
            ? () => adminUserService.updateUserPassword(id, newPass)
            : () => customerUserService.updateUserPassword(id, newPass);
        const result = await updatePassword();

        if (result.success) {
            if (inviteState.hasInvite && !inviteState.expired) {
                await require("../../services/authTokenStore").mutateJsonFile(INVITE_TOKENS_PATH, {}, (tokens) => { delete tokens[id]; });
            }
            console.log(`パスワード初期設定完了: ${accountUser.email}`);
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
