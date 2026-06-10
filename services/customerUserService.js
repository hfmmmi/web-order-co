"use strict";

const fs = require("fs").promises;
const bcrypt = require("bcryptjs");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");
const customerService = require("./customerService");

const CUSTOMER_USERS_DB_PATH = dbPath("customer_users.json");

function toPublicCustomerUser(user) {
    if (!user) return null;
    return {
        userId: user.userId || "",
        contactName: user.contactName || "",
        customerId: user.customerId || "",
        email: (user.email && String(user.email).trim()) || "",
        passwordSet: !!(user.password && String(user.password).trim())
    };
}

async function readCustomerUserList() {
    try {
        const data = await fs.readFile(CUSTOMER_USERS_DB_PATH, "utf-8");
        const list = JSON.parse(data);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
    }
}

async function getCustomerUsersPublic() {
    const list = await readCustomerUserList();
    return list.map(toPublicCustomerUser).filter(Boolean);
}

async function saveCustomerUsers(incoming) {
    if (!Array.isArray(incoming)) {
        throw new Error("担当者アカウント一覧の形式が不正です");
    }

    return runWithJsonFileWriteLock(CUSTOMER_USERS_DB_PATH, async () => {
        const existing = await readCustomerUserList();
        const byId = new Map(existing.map((u) => [String(u.userId || ""), u]));

        const next = [];
        const seen = new Set();

        for (const row of incoming) {
            const userId = String(row.userId || "").trim();
            const customerId = String(row.customerId || "").trim();
            if (!userId) continue;
            if (seen.has(userId)) {
                throw new Error(`ログインIDが重複しています: ${userId}`);
            }
            seen.add(userId);

            if (!customerId) {
                throw new Error(`担当者「${userId}」の顧客IDを指定してください`);
            }

            const customer = await customerService.getCustomerById(customerId);
            if (!customer) {
                throw new Error(`顧客ID「${customerId}」が見つかりません（担当者: ${userId}）`);
            }

            const prev = byId.get(userId);
            const contactName = row.contactName != null ? String(row.contactName).trim() : "";
            const emailRaw = row.email != null ? String(row.email).trim() : "";
            const email = emailRaw === "" ? undefined : emailRaw;
            const passwordRaw = row.password != null ? String(row.password) : "";

            let password = prev ? prev.password : "";
            if (passwordRaw.trim().length >= 4) {
                password = await bcrypt.hash(passwordRaw.trim(), 10);
            } else if (!prev && passwordRaw.trim().length === 0) {
                throw new Error(`担当者「${userId}」の初回登録にはパスワード（4文字以上）が必要です`);
            } else if (!prev) {
                throw new Error(`担当者「${userId}」のパスワードは4文字以上で指定してください`);
            }

            next.push({
                userId,
                customerId,
                contactName,
                password,
                ...(email ? { email } : {})
            });
        }

        await fs.writeFile(CUSTOMER_USERS_DB_PATH, JSON.stringify(next, null, 2), "utf-8");
        return next.map(toPublicCustomerUser);
    });
}

async function findCustomerUserByLoginId(loginId) {
    const id = String(loginId || "").trim();
    if (!id) return null;
    const list = await readCustomerUserList();
    return list.find((u) => String(u.userId || "") === id) || null;
}

async function findCustomerUserByEmail(email) {
    const needle = String(email || "").trim().toLowerCase();
    if (!needle) return null;
    const list = await readCustomerUserList();
    return (
        list.find((u) => (u.email || "").trim().toLowerCase() === needle) || null
    );
}

async function verifyCustomerUserPassword(user, pass) {
    if (!user || !user.password) return false;
    if (String(user.password).startsWith("$2")) {
        return bcrypt.compare(String(pass || ""), user.password);
    }
    return user.password === pass;
}

async function authenticateCustomerUser(loginId, pass) {
    const user = await findCustomerUserByLoginId(loginId);
    if (!user) return null;
    const ok = await verifyCustomerUserPassword(user, pass);
    if (!ok) return { user, ok: false };
    const customer = await customerService.getCustomerById(user.customerId);
    if (!customer) return { user, ok: false, customerMissing: true };
    return { user, customer, ok: true };
}

async function updateCustomerUserProfile(userId, payload = {}) {
    const id = String(userId || "").trim();
    if (!id) return { success: false, message: "ログインIDが指定されていません" };

    const currentPassword = payload.currentPassword != null ? String(payload.currentPassword) : "";
    if (!currentPassword) {
        return { success: false, message: "現在のパスワードを入力してください" };
    }

    const contactName =
        payload.contactName !== undefined ? String(payload.contactName).trim() : undefined;
    const emailRaw = payload.email !== undefined ? String(payload.email).trim() : undefined;
    const newPassword = payload.password != null ? String(payload.password) : "";

    if (newPassword && newPassword.length > 0 && newPassword.length < 4) {
        return { success: false, message: "新しいパスワードは4文字以上にしてください" };
    }

    return runWithJsonFileWriteLock(CUSTOMER_USERS_DB_PATH, async () => {
        const list = await readCustomerUserList();
        const user = list.find((u) => String(u.userId || "") === id);
        if (!user) return { success: false, message: "担当者アカウントが見つかりません" };

        const passwordOk = await verifyCustomerUserPassword(user, currentPassword);
        if (!passwordOk) {
            return { success: false, message: "現在のパスワードが正しくありません" };
        }

        if (contactName !== undefined) user.contactName = contactName;
        if (emailRaw !== undefined) {
            if (emailRaw === "") {
                delete user.email;
            } else {
                user.email = emailRaw;
            }
        }
        if (newPassword.trim().length >= 4) {
            user.password = await bcrypt.hash(newPassword.trim(), 10);
        }

        await fs.writeFile(CUSTOMER_USERS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
        return {
            success: true,
            message: "アカウント設定を保存しました",
            user: toPublicCustomerUser(user)
        };
    });
}

async function updateCustomerUserPassword(userId, newPassword) {
    const id = String(userId || "").trim();
    if (!id) return { success: false, message: "ログインIDが指定されていません" };
    if (!newPassword || String(newPassword).length < 4) {
        return { success: false, message: "パスワードは4文字以上にしてください" };
    }

    return runWithJsonFileWriteLock(CUSTOMER_USERS_DB_PATH, async () => {
        const list = await readCustomerUserList();
        const user = list.find((u) => String(u.userId || "") === id);
        if (!user) return { success: false, message: "担当者アカウントが見つかりません" };
        user.password = await bcrypt.hash(String(newPassword), 10);
        await fs.writeFile(CUSTOMER_USERS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
        return { success: true, message: "パスワードを更新しました" };
    });
}

module.exports = {
    CUSTOMER_USERS_DB_PATH,
    toPublicCustomerUser,
    readCustomerUserList,
    getCustomerUsersPublic,
    saveCustomerUsers,
    findCustomerUserByLoginId,
    findCustomerUserByEmail,
    verifyCustomerUserPassword,
    authenticateCustomerUser,
    updateCustomerUserProfile,
    updateCustomerUserPassword
};
