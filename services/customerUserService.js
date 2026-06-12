"use strict";

const fs = require("fs").promises;
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");
const { readToRowArrays } = require("../utils/excelReader");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const USERS_DB_PATH = dbPath("customer_users.json");
const CUSTOMERS_DB_PATH = dbPath("customers.json");

const VALID_ROLES = new Set(["admin", "user"]);

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
    return `CU-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
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
        customerId: find("顧客ID", "customerId", "customer_id"),
        email: find("メール", "email", "メールアドレス"),
        displayName: find("表示名", "displayName", "担当者名", "氏名"),
        role: find("ロール", "role", "権限"),
        password: find("初期パスワード", "password", "パスワード")
    };
}

function toSafePublicUser(u) {
    return {
        userId: u.userId,
        customerId: u.customerId,
        email: u.email,
        displayName: u.displayName || "",
        role: u.role === "admin" ? "admin" : "user",
        active: u.active !== false,
        createdAt: u.createdAt || null,
        lastLoginAt: u.lastLoginAt || null
    };
}

class CustomerUserService {
    async _loadAll() {
        try {
            const data = await fs.readFile(USERS_DB_PATH, "utf-8");
            const list = JSON.parse(data);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            if (e.code === "ENOENT") return [];
            console.error("[CustomerUserService] Load Error:", e);
            return [];
        }
    }

    async _loadCustomerMap() {
        try {
            const data = await fs.readFile(CUSTOMERS_DB_PATH, "utf-8");
            const list = JSON.parse(data);
            const map = new Map();
            if (Array.isArray(list)) {
                list.forEach((c) => map.set(c.customerId, c));
            }
            return map;
        } catch (e) {
            return new Map();
        }
    }

    async getUsersByCustomerId(customerId) {
        const list = await this._loadAll();
        return list
            .filter((u) => u.customerId === customerId)
            .map(toSafePublicUser)
            .sort((a, b) => String(a.email).localeCompare(String(b.email), "ja"));
    }

    async getUserById(userId) {
        const list = await this._loadAll();
        const u = list.find((x) => x.userId === userId);
        return u ? toSafePublicUser(u) : null;
    }

    async findByEmail(email) {
        const norm = normalizeEmail(email);
        if (!norm) return null;
        const list = await this._loadAll();
        const u = list.find((x) => normalizeEmail(x.email) === norm && x.active !== false);
        if (!u) return null;
        const customers = await this._loadCustomerMap();
        const customer = customers.get(u.customerId);
        if (!customer) return null;
        return { user: u, customer };
    }

    async authenticate(email, password) {
        const found = await this.findByEmail(email);
        if (!found) return { success: false, message: "メールアドレスまたはパスワードが間違っています" };
        const { user, customer } = found;
        if (!user.password) {
            return { success: false, message: "メールアドレスまたはパスワードが間違っています" };
        }
        const ok = await bcrypt.compare(String(password), user.password);
        if (!ok) {
            return { success: false, message: "メールアドレスまたはパスワードが間違っています", user, customer };
        }
        return { success: true, user, customer };
    }

    async touchLastLogin(userId) {
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const idx = list.findIndex((u) => u.userId === userId);
            if (idx === -1) return;
            list[idx].lastLoginAt = new Date().toISOString();
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
        });
    }

    async addUser({ customerId, email, displayName, role, password, active }) {
        const cid = String(customerId || "").trim();
        const normEmail = normalizeEmail(email);
        if (!cid) return { success: false, message: "顧客IDが必要です" };
        if (!normEmail) return { success: false, message: "メールアドレスが必要です" };
        const roleVal = VALID_ROLES.has(role) ? role : "user";
        if (!password || String(password).trim().length < 4) {
            return { success: false, message: "パスワードは4文字以上で指定してください" };
        }

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const customers = await this._loadCustomerMap();
            if (!customers.has(cid)) {
                return { success: false, message: "顧客が見つかりません" };
            }
            const list = await this._loadAll();
            if (list.some((u) => normalizeEmail(u.email) === normEmail)) {
                return { success: false, message: "このメールアドレスは既に登録されています" };
            }
            const hashed = await bcrypt.hash(String(password).trim(), 10);
            const row = {
                userId: generateUserId(),
                customerId: cid,
                email: normEmail,
                displayName: displayName ? String(displayName).trim() : normEmail.split("@")[0],
                role: roleVal,
                password: hashed,
                active: active !== false,
                createdAt: new Date().toISOString(),
                lastLoginAt: null
            };
            list.push(row);
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "ユーザーを登録しました", user: toSafePublicUser(row) };
        });
    }

    async updateUser({ userId, email, displayName, role, password, active }) {
        const uid = String(userId || "").trim();
        if (!uid) return { success: false, message: "ユーザーIDが必要です" };

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._loadAll();
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
            if (role !== undefined && VALID_ROLES.has(role)) {
                list[idx].role = role;
            }
            if (active !== undefined) {
                list[idx].active = active !== false;
            }
            if (password && String(password).trim().length >= 4) {
                list[idx].password = await bcrypt.hash(String(password).trim(), 10);
            }

            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "ユーザー情報を更新しました", user: toSafePublicUser(list[idx]) };
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
            const list = await this._loadAll();
            const idx = list.findIndex((u) => u.userId === userId);
            if (idx === -1) return { success: false, message: "ユーザーが見つかりません" };
            list[idx].password = await bcrypt.hash(String(newPassword).trim(), 10);
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "パスワードを更新しました" };
        });
    }

    async getUserRecordById(userId) {
        const list = await this._loadAll();
        return list.find((u) => u.userId === userId) || null;
    }

    async _applyImportRows(jsonData) {
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            if (!jsonData.length) {
                return { success: false, message: "データ行がありません" };
            }
            const cols = resolveImportColumns(jsonData[0]);
            if (cols.customerId < 0 || cols.email < 0) {
                return { success: false, message: "ヘッダーに「顧客ID」「メール」列が必要です" };
            }

            const customers = await this._loadCustomerMap();
            let list = await this._loadAll();
            const emailSet = new Set(list.map((u) => normalizeEmail(u.email)));
            let addCount = 0;
            let updateCount = 0;
            let skipCount = 0;
            const errors = [];

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row.length) continue;

                const customerId = String(row[cols.customerId] || "").trim();
                const email = normalizeEmail(row[cols.email]);
                if (!customerId || !email) {
                    skipCount++;
                    continue;
                }
                if (!customers.has(customerId)) {
                    errors.push(`行${i + 1}: 顧客ID ${customerId} が存在しません`);
                    continue;
                }

                const displayName = cols.displayName >= 0 && row[cols.displayName]
                    ? String(row[cols.displayName]).trim()
                    : email.split("@")[0];
                const roleRaw = cols.role >= 0 ? String(row[cols.role] || "").trim().toLowerCase() : "";
                const role = roleRaw === "admin" ? "admin" : "user";
                const passRaw = cols.password >= 0 ? String(row[cols.password] || "").trim() : "";
                const password = passRaw || crypto.randomBytes(4).toString("hex");

                const existingIdx = list.findIndex((u) => normalizeEmail(u.email) === email);
                if (existingIdx >= 0) {
                    if (list[existingIdx].customerId !== customerId) {
                        errors.push(`行${i + 1}: メール ${email} は別企業に登録済みです`);
                        continue;
                    }
                    list[existingIdx].displayName = displayName;
                    list[existingIdx].role = role;
                    list[existingIdx].active = true;
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
                        customerId,
                        email,
                        displayName,
                        role,
                        password: await bcrypt.hash(password, 10),
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
        ws.addRow(["顧客ID", "メール", "表示名", "ロール", "初期パスワード"]);
        ws.addRow(["H015", "user@example.com", "担当者名", "admin", ""]);
        const buf = await wb.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    async getCustomerUsersPublic() {
        const list = await this._loadAll();
        return list.map(toSafePublicUser);
    }

    async saveCustomerUsers(incoming) {
        if (!Array.isArray(incoming)) {
            throw new Error("担当者アカウント一覧の形式が不正です");
        }

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const existing = await this._loadAll();
            const byId = new Map(existing.map((u) => [String(u.userId || ""), u]));
            const customers = await this._loadCustomerMap();
            const next = [];
            const seen = new Set();
            const seenEmails = new Set();

            for (const row of incoming) {
                let userId = String(row.userId || "").trim();
                const customerId = String(row.customerId || "").trim();
                const email = normalizeEmail(row.email);
                const displayName = row.contactName != null
                    ? String(row.contactName).trim()
                    : (row.displayName != null ? String(row.displayName).trim() : "");
                const passwordRaw = row.password != null ? String(row.password) : "";

                if (!userId && email) {
                    userId = generateUserId();
                }
                if (!userId) continue;
                if (seen.has(userId)) {
                    throw new Error(`ログインIDが重複しています: ${userId}`);
                }
                if (!customerId) {
                    throw new Error(`担当者「${userId}」の顧客IDを指定してください`);
                }
                if (!customers.has(customerId)) {
                    throw new Error(`顧客ID「${customerId}」が見つかりません（担当者: ${userId}）`);
                }
                if (!email) {
                    throw new Error(`担当者「${userId}」のメールアドレスを指定してください`);
                }
                if (seenEmails.has(email)) {
                    throw new Error(`メールアドレスが重複しています: ${email}`);
                }

                seen.add(userId);
                seenEmails.add(email);

                const prev = byId.get(userId);
                let password = prev ? prev.password : "";
                if (passwordRaw.trim().length >= 4) {
                    password = await bcrypt.hash(passwordRaw.trim(), 10);
                } else if (!prev) {
                    throw new Error(`担当者「${userId}」の初回登録にはパスワード（4文字以上）が必要です`);
                }

                next.push({
                    userId,
                    customerId,
                    email,
                    displayName: displayName || email.split("@")[0],
                    role: VALID_ROLES.has(row.role) ? row.role : (prev && prev.role) || "user",
                    password,
                    active: row.active !== false,
                    createdAt: (prev && prev.createdAt) || new Date().toISOString(),
                    lastLoginAt: prev ? prev.lastLoginAt || null : null
                });
            }

            await fs.writeFile(USERS_DB_PATH, JSON.stringify(next, null, 2));
            return next.map(toSafePublicUser);
        });
    }

    async findCustomerUserByLoginId(loginId) {
        const id = String(loginId || "").trim();
        if (!id) return null;
        const list = await this._loadAll();
        return list.find((u) => String(u.userId || "") === id) || null;
    }

    async findCustomerUserByEmail(email) {
        const norm = normalizeEmail(email);
        if (!norm) return null;
        const list = await this._loadAll();
        return list.find((u) => normalizeEmail(u.email) === norm) || null;
    }

    async verifyCustomerUserPassword(user, pass) {
        if (!user || !user.password) return false;
        if (String(user.password).startsWith("$2")) {
            return bcrypt.compare(String(pass || ""), user.password);
        }
        return user.password === pass;
    }

    async authenticateCustomerUser(loginId, pass) {
        const id = String(loginId || "").trim();
        if (!id) return null;

        let user = await this.findCustomerUserByLoginId(id);
        if (!user && id.includes("@")) {
            user = await this.findCustomerUserByEmail(id);
        }
        if (!user) return null;

        const ok = await this.verifyCustomerUserPassword(user, pass);
        if (!ok) return { user, ok: false };

        const customers = await this._loadCustomerMap();
        const customer = customers.get(user.customerId);
        if (!customer) return { user, ok: false, customerMissing: true };
        return { user, customer, ok: true };
    }

    async updateCustomerUserProfile(userId, payload = {}) {
        const id = String(userId || "").trim();
        if (!id) return { success: false, message: "ログインIDが指定されていません" };

        const currentPassword = payload.currentPassword != null ? String(payload.currentPassword) : "";
        if (!currentPassword) {
            return { success: false, message: "現在のパスワードを入力してください" };
        }

        const displayName = payload.contactName !== undefined
            ? String(payload.contactName).trim()
            : (payload.displayName !== undefined ? String(payload.displayName).trim() : undefined);
        const emailRaw = payload.email !== undefined ? String(payload.email).trim() : undefined;
        const newPassword = payload.password != null ? String(payload.password) : "";

        if (newPassword && newPassword.length > 0 && newPassword.length < 4) {
            return { success: false, message: "新しいパスワードは4文字以上にしてください" };
        }

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const idx = list.findIndex((u) => String(u.userId || "") === id);
            if (idx === -1) return { success: false, message: "担当者アカウントが見つかりません" };

            const user = list[idx];
            const passwordOk = await this.verifyCustomerUserPassword(user, currentPassword);
            if (!passwordOk) {
                return { success: false, message: "現在のパスワードが正しくありません" };
            }

            if (displayName !== undefined) user.displayName = displayName;
            if (emailRaw !== undefined) {
                const normEmail = normalizeEmail(emailRaw);
                if (!normEmail) return { success: false, message: "メールアドレスが不正です" };
                if (list.some((u, i) => i !== idx && normalizeEmail(u.email) === normEmail)) {
                    return { success: false, message: "このメールアドレスは既に登録されています" };
                }
                user.email = normEmail;
            }
            if (newPassword.trim().length >= 4) {
                user.password = await bcrypt.hash(newPassword.trim(), 10);
            }

            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return {
                success: true,
                message: "アカウント設定を保存しました",
                user: toSafePublicUser(user)
            };
        });
    }

    async updateCustomerUserPassword(userId, newPassword) {
        return this.updateUserPassword(userId, newPassword);
    }
}

module.exports = new CustomerUserService();
module.exports.normalizeEmail = normalizeEmail;
module.exports.toSafePublicUser = toSafePublicUser;
module.exports.toPublicCustomerUser = toSafePublicUser;
