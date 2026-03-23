"use strict";

const fs = require("fs").promises;
const crypto = require("crypto");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");
const mailService = require("./mailService");
const settingsService = require("./settingsService");

const CUSTOMERS_DB_PATH = dbPath("customers.json");
const ADMINS_DB_PATH = dbPath("admins.json");
const RESET_TOKENS_PATH = dbPath("reset_tokens.json");
const ADMIN_RESET_TOKENS_PATH = dbPath("admin_reset_tokens.json");
const RESET_RATE_LIMIT_PATH = dbPath("reset_rate_limit.json");
const RESET_EXPIRY_HOURS = 24;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const safeMessage = "ご登録のメールアドレスに送信しました。届かない場合は管理者にお問い合わせください。";

/**
 * 顧客・管理者のパスワード再設定依頼（レート制限・トークン・メール）。
 * セキュリティのため常に同じメッセージで成功レスポンス相当を返す。
 * @param {{ rawId: unknown, clientIp: string, protocol: string, host: string }} opts
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function requestPasswordReset(opts) {
    const { rawId, clientIp, protocol, host } = opts;

    if (!rawId || typeof rawId !== "string") {
        return { success: true, message: safeMessage };
    }

    const trimId = rawId.trim();
    if (!trimId) {
        return { success: true, message: safeMessage };
    }

    try {
        const rateLimited = await runWithJsonFileWriteLock(RESET_RATE_LIMIT_PATH, async () => {
            let rateData = {};
            try {
                const rateRaw = await fs.readFile(RESET_RATE_LIMIT_PATH, "utf-8");
                rateData = JSON.parse(rateRaw);
            } catch (e) { rateData = {}; }

            const now = Date.now();
            const windowStart = now - RATE_LIMIT_WINDOW_MS;
            if (!Array.isArray(rateData[clientIp])) rateData[clientIp] = [];
            rateData[clientIp] = rateData[clientIp].filter(ts => ts > windowStart);

            if (rateData[clientIp].length >= RATE_LIMIT_MAX_REQUESTS) {
                return { blocked: true };
            }

            rateData[clientIp].push(now);
            const cleaned = {};
            for (const [ip, timestamps] of Object.entries(rateData)) {
                const recent = timestamps.filter(ts => ts > windowStart);
                if (recent.length > 0) cleaned[ip] = recent;
            }
            await fs.writeFile(RESET_RATE_LIMIT_PATH, JSON.stringify(cleaned, null, 2));
            return { blocked: false };
        });
        if (rateLimited.blocked) {
            return { success: true, message: safeMessage };
        }

        const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
        const customerList = JSON.parse(data);
        const isEmailInput = trimId.includes("@");
        const customer = isEmailInput
            ? customerList.find(c => (c.email || "").trim().toLowerCase() === trimId.toLowerCase())
            : customerList.find(c => c.customerId === trimId);

        if (customer && (customer.email || "").trim()) {
            const customerId = customer.customerId;
            const token = crypto.randomBytes(24).toString("hex");
            const expiresAt = Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000;

            await runWithJsonFileWriteLock(RESET_TOKENS_PATH, async () => {
                let resetTokens = {};
                try {
                    const resetData = await fs.readFile(RESET_TOKENS_PATH, "utf-8");
                    resetTokens = JSON.parse(resetData);
                } catch (e) { resetTokens = {}; }
                resetTokens[customerId] = { token, expiresAt };
                await fs.writeFile(RESET_TOKENS_PATH, JSON.stringify(resetTokens, null, 2));
            });

            const baseUrl = (protocol || "http") + "://" + (host || "localhost");
            const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(customerId)}&key=${token}`;

            const mailPayload = {
                customerId: customer.customerId,
                customerName: customer.customerName || customerId,
                email: customer.email.trim()
            };
            const sent = await mailService.sendInviteEmail(mailPayload, inviteUrl, "", true);

            if (!sent.success) {
                await runWithJsonFileWriteLock(RESET_TOKENS_PATH, async () => {
                    let resetTokens = {};
                    try {
                        const resetData = await fs.readFile(RESET_TOKENS_PATH, "utf-8");
                        resetTokens = JSON.parse(resetData);
                    } catch (e) { resetTokens = {}; }
                    delete resetTokens[customerId];
                    await fs.writeFile(RESET_TOKENS_PATH, JSON.stringify(resetTokens, null, 2));
                });
                console.error("[request-password-reset] Mail send failed:", sent.message);
            } else {
                console.log(`[request-password-reset] Sent reset link to ${customerId}`);
            }
            return { success: true, message: safeMessage };
        }

        let adminList = [];
        try {
            const adminData = await fs.readFile(ADMINS_DB_PATH, "utf-8");
            adminList = JSON.parse(adminData);
        } catch (e) { adminList = []; }
        if (!Array.isArray(adminList)) adminList = [];
        const admin = isEmailInput
            ? adminList.find(a => (a.email || "").trim().toLowerCase() === trimId.toLowerCase())
            : adminList.find(a => a.adminId === trimId);

        if (admin) {
            const settings = await settingsService.getSettings();
            const mail = settings.mail || {};
            const toEmail = (admin.email && String(admin.email).trim())
                ? String(admin.email).trim()
                : (mail.supportNotifyTo && String(mail.supportNotifyTo).trim())
                    ? String(mail.supportNotifyTo).trim()
                    : "";
            if (toEmail) {
                const token = crypto.randomBytes(24).toString("hex");
                const expiresAt = Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000;
                await runWithJsonFileWriteLock(ADMIN_RESET_TOKENS_PATH, async () => {
                    let adminResetTokens = {};
                    try {
                        const adminResetData = await fs.readFile(ADMIN_RESET_TOKENS_PATH, "utf-8");
                        adminResetTokens = JSON.parse(adminResetData);
                    } catch (e) { adminResetTokens = {}; }
                    adminResetTokens[admin.adminId] = { token, expiresAt };
                    await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));
                });

                const baseUrl = (protocol || "http") + "://" + (host || "localhost");
                const inviteUrl = `${baseUrl}/setup.html?id=${encodeURIComponent(admin.adminId)}&key=${token}`;
                const mailPayload = {
                    customerId: admin.adminId,
                    customerName: admin.name || admin.adminId,
                    email: toEmail
                };
                const sent = await mailService.sendInviteEmail(mailPayload, inviteUrl, "", true);
                if (!sent.success) {
                    await runWithJsonFileWriteLock(ADMIN_RESET_TOKENS_PATH, async () => {
                        let adminResetTokens = {};
                        try {
                            const adminResetData = await fs.readFile(ADMIN_RESET_TOKENS_PATH, "utf-8");
                            adminResetTokens = JSON.parse(adminResetData);
                        } catch (e) { adminResetTokens = {}; }
                        delete adminResetTokens[admin.adminId];
                        await fs.writeFile(ADMIN_RESET_TOKENS_PATH, JSON.stringify(adminResetTokens, null, 2));
                    });
                    console.error("[request-password-reset] Admin mail send failed:", sent.message);
                } else {
                    console.log(`[request-password-reset] Sent admin reset link to ${admin.adminId}`);
                }
            }
        }

        return { success: true, message: safeMessage };
    } catch (error) {
        console.error("Request Password Reset Error:", error);
        return { success: true, message: safeMessage };
    }
}

module.exports = { requestPasswordReset, safeMessage };
