"use strict";

const fs = require("fs").promises;
const bcrypt = require("bcryptjs");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const ADMINS_DB_PATH = dbPath("admins.json");

function toPublicAdmin(admin) {
    if (!admin) return null;
    return {
        adminId: admin.adminId || "",
        name: admin.name || "",
        email: (admin.email && String(admin.email).trim()) || "",
        passwordSet: !!(admin.password && String(admin.password).trim())
    };
}

async function readAdminList() {
    try {
        const data = await fs.readFile(ADMINS_DB_PATH, "utf-8");
        const list = JSON.parse(data);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
    }
}

async function getAdminAccountsPublic() {
    const list = await readAdminList();
    return list.map(toPublicAdmin).filter(Boolean);
}

async function saveAdminAccounts(incoming) {
    if (!Array.isArray(incoming)) {
        throw new Error("アカウント一覧の形式が不正です");
    }

    return runWithJsonFileWriteLock(ADMINS_DB_PATH, async () => {
        const existing = await readAdminList();
        const byId = new Map(existing.map((a) => [String(a.adminId || ""), a]));

        const next = [];
        const seen = new Set();

        for (const row of incoming) {
            const adminId = String(row.adminId || "").trim();
            if (!adminId) continue;
            if (seen.has(adminId)) {
                throw new Error(`管理者IDが重複しています: ${adminId}`);
            }
            seen.add(adminId);

            const prev = byId.get(adminId);
            const name = row.name != null ? String(row.name).trim() : "";
            const emailRaw = row.email != null ? String(row.email).trim() : "";
            const email = emailRaw === "" ? undefined : emailRaw;
            const passwordRaw = row.password != null ? String(row.password) : "";

            let password = prev ? prev.password : "";
            if (passwordRaw.trim().length >= 4) {
                password = await bcrypt.hash(passwordRaw.trim(), 10);
            } else if (!prev && passwordRaw.trim().length === 0) {
                throw new Error(`管理者「${adminId}」の初回登録にはパスワード（4文字以上）が必要です`);
            } else if (!prev) {
                throw new Error(`管理者「${adminId}」のパスワードは4文字以上で指定してください`);
            }

            next.push({
                adminId,
                password,
                name,
                ...(email ? { email } : {})
            });
        }

        if (next.length === 0) {
            throw new Error("管理者アカウントを1件以上登録してください");
        }

        await fs.writeFile(ADMINS_DB_PATH, JSON.stringify(next, null, 2), "utf-8");
        return next.map(toPublicAdmin);
    });
}

module.exports = {
    ADMINS_DB_PATH,
    toPublicAdmin,
    readAdminList,
    getAdminAccountsPublic,
    saveAdminAccounts
};
