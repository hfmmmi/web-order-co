"use strict";

const fs = require("fs").promises;
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");
const { readToRowArrays } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const USERS_DB_PATH = dbPath("admin_users.json");
const LEGACY_ADMINS_PATH = dbPath("admins.json");

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isExcelBuffer(buf) {
    if (!buf || (buf.length !== undefined && buf.length < 2)) return false;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return b[0] === 0x50 && b[1] === 0x4b;
}

function parseCsvToRowArrays(buffer) {
    const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (raw.length === 0) return [];
    let content = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
        ? iconv.decode(raw, "utf-8")
        : iconv.decode(raw, "Shift_JIS");
    if (content.includes("\ufffd")) content = iconv.decode(raw, "utf-8");
    const rows = parse(content, {
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true
    });
    return rows.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : c)) : []));
}

function generateUserId() {
    return `AU-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function resolveImportColumns(headerRow) {
    const headers = (headerRow || []).map((h) => String(h || "").trim());
    const find = (...names) => {
        for (const name of names) {
            const idx = headers.findIndex((h) => h === name || h.includes(name));
            if (idx >= 0) return idx;
        }
        return -1;
    };
    return {
        email: find("メール", "email", "メールアドレス"),
        displayName: find("表示名", "displayName", "担当者名", "氏名", "名前"),
        role: find("ロール", "role", "権限"),
        password: find("初期パスワード", "password", "パスワード")
    };
}

function normalizeRole(role) {
    if (role === "user") return "user";
    return "admin";
}

function toSafePublicUser(u) {
    return {
        userId: u.userId,
        email: u.email,
        displayName: u.displayName || "",
        role: normalizeRole(u.role),
        active: u.active !== false,
        createdAt: u.createdAt || null,
        lastLoginAt: u.lastLoginAt || null
    };
}

class AdminUserService {
    async _readUsersRaw() {
        try {
            const data = await fs.readFile(USERS_DB_PATH, "utf-8");
            const list = JSON.parse(data);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            if (e.code === "ENOENT" || e instanceof SyntaxError) return [];
            throw e;
        }
    }

    async _loadAll() {
        await this.ensureLegacyMigration();
        return this._readUsersRaw();
    }

    async ensureLegacyMigration() {
        try {
            await fs.access(USERS_DB_PATH);
            const data = await fs.readFile(USERS_DB_PATH, "utf-8");
            const list = JSON.parse(data);
            if (Array.isArray(list) && list.length > 0) return;
        } catch (e) {
            if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
        }

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            try {
                const existing = await fs.readFile(USERS_DB_PATH, "utf-8");
                const parsed = JSON.parse(existing);
                if (Array.isArray(parsed) && parsed.length > 0) return;
            } catch (e) {
                if (e.code !== "ENOENT") throw e;
            }

            let legacy = [];
            try {
                const raw = await fs.readFile(LEGACY_ADMINS_PATH, "utf-8");
                legacy = JSON.parse(raw);
            } catch (e) {
                if (e.code !== "ENOENT") console.error("[AdminUserService] Legacy read:", e.message);
                return;
            }
            if (!Array.isArray(legacy) || legacy.length === 0) return;

            const migrated = legacy.map((a, idx) => {
                const email = normalizeEmail(a.email);
                const fallbackEmail = email || `legacy-admin-${String(a.adminId || idx + 1).replace(/[^a-z0-9._-]/gi, "")}@migrate.local`;
                return {
                    userId: a.userId || `AU-MIG-${String(a.adminId || idx + 1)}`,
                    email: fallbackEmail,
                    displayName: String(a.name || a.adminId || "管理者").trim(),
                    password: a.password || "",
                    role: "admin",
                    active: true,
                    createdAt: new Date().toISOString(),
                    lastLoginAt: null,
                    legacyAdminId: a.adminId || null
                };
            }).filter((u) => u.password);

            if (migrated.length) {
                await fs.writeFile(USERS_DB_PATH, JSON.stringify(migrated, null, 2));
                console.log(`[AdminUserService] admins.json から ${migrated.length} 件を admin_users.json へ移行しました`);
            }
        });
    }

    async getAllUsers() {
        const list = await this._loadAll();
        return list
            .map(toSafePublicUser)
            .sort((a, b) => String(a.email).localeCompare(String(b.email), "ja"));
    }

    async getUserById(userId) {
        const list = await this._loadAll();
        const u = list.find((x) => x.userId === userId);
        return u ? toSafePublicUser(u) : null;
    }

    async getUserRecordById(userId) {
        const list = await this._loadAll();
        return list.find((u) => u.userId === userId) || null;
    }

    async findByEmail(email) {
        const norm = normalizeEmail(email);
        if (!norm) return null;
        const list = await this._loadAll();
        const u = list.find((x) => normalizeEmail(x.email) === norm && x.active !== false);
        return u || null;
    }

    async authenticate(email, password) {
        const user = await this.findByEmail(email);
        if (!user) {
            return { success: false, message: "メールアドレスまたはパスワードが間違っています" };
        }
        if (!user.password) {
            return { success: false, message: "メールアドレスまたはパスワードが間違っています", user };
        }

        let isMatch = false;
        let needHashUpdate = false;
        if (String(user.password).startsWith("$2")) {
            isMatch = await bcrypt.compare(String(password), user.password);
        } else if (user.password === password) {
            isMatch = true;
            needHashUpdate = true;
        }

        if (!isMatch) {
            return { success: false, message: "メールアドレスまたはパスワードが間違っています", user };
        }

        if (needHashUpdate) {
            await this.updateUserPassword(user.userId, String(password));
        }

        return { success: true, user };
    }

    async touchLastLogin(userId) {
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._readUsersRaw();
            const idx = list.findIndex((u) => u.userId === userId);
            if (idx === -1) return;
            list[idx].lastLoginAt = new Date().toISOString();
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
        });
    }

    async addUser({ email, displayName, password, role, active }) {
        const normEmail = normalizeEmail(email);
        if (!normEmail) return { success: false, message: "メールアドレスが必要です" };
        if (!password || String(password).trim().length < 4) {
            return { success: false, message: "パスワードは4文字以上で指定してください" };
        }

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._readUsersRaw();
            if (list.some((u) => normalizeEmail(u.email) === normEmail)) {
                return { success: false, message: "このメールアドレスは既に登録されています" };
            }
            const hashed = await bcrypt.hash(String(password).trim(), 10);
            const row = {
                userId: generateUserId(),
                email: normEmail,
                displayName: displayName ? String(displayName).trim() : normEmail.split("@")[0],
                password: hashed,
                role: normalizeRole(role),
                active: active !== false,
                createdAt: new Date().toISOString(),
                lastLoginAt: null
            };
            list.push(row);
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "管理者ユーザーを登録しました", user: toSafePublicUser(row) };
        });
    }

    async updateUser({ userId, email, displayName, password, role, active }) {
        const uid = String(userId || "").trim();
        if (!uid) return { success: false, message: "ユーザーIDが必要です" };

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._readUsersRaw();
            const idx = list.findIndex((u) => u.userId === uid);
            if (idx === -1) return { success: false, message: "ユーザーが見つかりません" };

            if (email !== undefined) {
                const normEmail = normalizeEmail(email);
                if (!normEmail) return { success: false, message: "メールアドレスが不正です" };
                if (list.some((u, i) => i !== idx && normalizeEmail(u.email) === normEmail)) {
                    return { success: false, message: "このメールアドレスは既に登録されています" };
                }
                list[idx].email = normEmail;
            }
            if (displayName !== undefined) {
                list[idx].displayName = String(displayName || "").trim();
            }
            if (role !== undefined) {
                list[idx].role = normalizeRole(role);
            }
            if (password !== undefined && String(password).trim()) {
                if (String(password).trim().length < 4) {
                    return { success: false, message: "パスワードは4文字以上で指定してください" };
                }
                list[idx].password = await bcrypt.hash(String(password).trim(), 10);
            }
            if (active !== undefined) list[idx].active = !!active;

            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "管理者ユーザーを更新しました", user: toSafePublicUser(list[idx]) };
        });
    }

    async deactivateUser(userId) {
        return this.updateUser({ userId, active: false });
    }

    async updateUserPassword(userId, newPassword) {
        if (!newPassword || String(newPassword).trim().length < 4) {
            return { success: false, message: "パスワードは4文字以上にしてください" };
        }
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._readUsersRaw();
            const idx = list.findIndex((u) => u.userId === userId);
            if (idx === -1) return { success: false, message: "ユーザーが見つかりません" };
            list[idx].password = await bcrypt.hash(String(newPassword).trim(), 10);
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "パスワードを更新しました" };
        });
    }

    async _applyImportRows(jsonData) {
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            if (!jsonData.length) {
                return { success: false, message: "データ行がありません" };
            }
            const cols = resolveImportColumns(jsonData[0]);
            if (cols.email < 0) {
                return { success: false, message: "ヘッダーに「メール」列が必要です" };
            }

            let list = await this._readUsersRaw();
            const emailSet = new Set(list.map((u) => normalizeEmail(u.email)));
            let addCount = 0;
            let updateCount = 0;
            let skipCount = 0;
            const errors = [];

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row.length) continue;

                const email = normalizeEmail(row[cols.email]);
                if (!email) {
                    skipCount++;
                    continue;
                }

                const displayName = cols.displayName >= 0 && row[cols.displayName]
                    ? String(row[cols.displayName]).trim()
                    : email.split("@")[0];
                const passRaw = cols.password >= 0 ? String(row[cols.password] || "").trim() : "";
                const password = passRaw || crypto.randomBytes(4).toString("hex");
                const roleRaw = cols.role >= 0 ? String(row[cols.role] || "").trim().toLowerCase() : "";
                const role = roleRaw === "admin" || roleRaw === "管理者" ? "admin" : "user";

                const existingIdx = list.findIndex((u) => normalizeEmail(u.email) === email);
                if (existingIdx >= 0) {
                    list[existingIdx].displayName = displayName;
                    list[existingIdx].active = true;
                    if (cols.role >= 0 && row[cols.role]) {
                        list[existingIdx].role = role;
                    } else if (!list[existingIdx].role) {
                        list[existingIdx].role = "admin";
                    }
                    if (passRaw) {
                        list[existingIdx].password = await bcrypt.hash(password, 10);
                    }
                    updateCount++;
                } else {
                    if (emailSet.has(email)) {
                        errors.push(`行${i + 1}: メール ${email} が重複しています`);
                        continue;
                    }
                    list.push({
                        userId: generateUserId(),
                        email,
                        displayName,
                        password: await bcrypt.hash(password, 10),
                        role,
                        active: true,
                        createdAt: new Date().toISOString(),
                        lastLoginAt: null
                    });
                    emailSet.add(email);
                    addCount++;
                }
            }

            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            const errNote = errors.length ? `（警告 ${errors.length} 件: ${errors.slice(0, 3).join(" / ")}${errors.length > 3 ? " …" : ""}）` : "";
            return {
                success: true,
                message: `取込成功: 新規${addCount}件 / 更新${updateCount}件 / スキップ${skipCount}件${errNote}`,
                errors
            };
        });
    }

    async importUserUpload(fileData) {
        const buffer = typeof fileData === "string"
            ? Buffer.from(fileData, "base64")
            : (Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData));
        let jsonData;
        try {
            jsonData = isExcelBuffer(buffer)
                ? await readToRowArrays(buffer)
                : parseCsvToRowArrays(buffer);
        } catch (e) {
            throw new Error("ファイルの読み込みに失敗しました: " + e.message);
        }
        if (!jsonData.length) {
            throw new Error("ファイルにデータがありません");
        }
        return this._applyImportRows(jsonData);
    }

    async getImportTemplateBuffer() {
        const ExcelJS = require("exceljs");
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Upload");
        ws.addRow(["メール", "表示名", "権限", "初期パスワード"]);
        ws.addRow(["admin@example.com", "管理者", "admin", ""]);
        const buf = await wb.xlsx.writeBuffer();
        return Buffer.from(buf);
    }
}

module.exports = new AdminUserService();
module.exports.normalizeEmail = normalizeEmail;
module.exports.normalizeRole = normalizeRole;
module.exports.toSafePublicUser = toSafePublicUser;
