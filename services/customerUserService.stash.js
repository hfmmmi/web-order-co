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
        customerId: find("鬘ｧ螳｢ID", "customerId", "customer_id"),
        email: find("繝｡繝ｼ繝ｫ", "email", "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ"),
        displayName: find("陦ｨ遉ｺ蜷・, "displayName", "諡・ｽ楢・錐", "豌丞錐"),
        role: find("繝ｭ繝ｼ繝ｫ", "role", "讓ｩ髯・),
        password: find("蛻晄悄繝代せ繝ｯ繝ｼ繝・, "password", "繝代せ繝ｯ繝ｼ繝・)
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
        if (!found) return { success: false, message: "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｾ縺溘・繝代せ繝ｯ繝ｼ繝峨′髢馴＆縺｣縺ｦ縺・∪縺・ };
        const { user, customer } = found;
        if (!user.password) {
            return { success: false, message: "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｾ縺溘・繝代せ繝ｯ繝ｼ繝峨′髢馴＆縺｣縺ｦ縺・∪縺・ };
        }
        const ok = await bcrypt.compare(String(password), user.password);
        if (!ok) {
            return { success: false, message: "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｾ縺溘・繝代せ繝ｯ繝ｼ繝峨′髢馴＆縺｣縺ｦ縺・∪縺・, user, customer };
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
        if (!cid) return { success: false, message: "鬘ｧ螳｢ID縺悟ｿ・ｦ√〒縺・ };
        if (!normEmail) return { success: false, message: "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺悟ｿ・ｦ√〒縺・ };
        const roleVal = VALID_ROLES.has(role) ? role : "user";
        if (!password || String(password).trim().length < 4) {
            return { success: false, message: "繝代せ繝ｯ繝ｼ繝峨・4譁・ｭ嶺ｻ･荳翫〒謖・ｮ壹＠縺ｦ縺上□縺輔＞" };
        }

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const customers = await this._loadCustomerMap();
            if (!customers.has(cid)) {
                return { success: false, message: "鬘ｧ螳｢縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ" };
            }
            const list = await this._loadAll();
            if (list.some((u) => normalizeEmail(u.email) === normEmail)) {
                return { success: false, message: "縺薙・繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｯ譌｢縺ｫ逋ｻ骭ｲ縺輔ｌ縺ｦ縺・∪縺・ };
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
            return { success: true, message: "繝ｦ繝ｼ繧ｶ繝ｼ繧堤匳骭ｲ縺励∪縺励◆", user: toSafePublicUser(row) };
        });
    }

    async updateUser({ userId, email, displayName, role, password, active }) {
        const uid = String(userId || "").trim();
        if (!uid) return { success: false, message: "繝ｦ繝ｼ繧ｶ繝ｼID縺悟ｿ・ｦ√〒縺・ };

        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const idx = list.findIndex((u) => u.userId === uid);
            if (idx === -1) return { success: false, message: "繝ｦ繝ｼ繧ｶ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ" };

            if (email !== undefined) {
                const normEmail = normalizeEmail(email);
                if (!normEmail) return { success: false, message: "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺御ｸ肴ｭ｣縺ｧ縺・ };
                if (list.some((u, i) => i !== idx && normalizeEmail(u.email) === normEmail)) {
                    return { success: false, message: "縺薙・繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｯ譌｢縺ｫ逋ｻ骭ｲ縺輔ｌ縺ｦ縺・∪縺・ };
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
            return { success: true, message: "繝ｦ繝ｼ繧ｶ繝ｼ諠・ｱ繧呈峩譁ｰ縺励∪縺励◆", user: toSafePublicUser(list[idx]) };
        });
    }

    async deactivateUser(userId) {
        return this.updateUser({ userId, active: false });
    }

    async updateUserPassword(userId, newPassword) {
        if (!newPassword || String(newPassword).trim().length < 4) {
            return { success: false, message: "繝代せ繝ｯ繝ｼ繝峨・4譁・ｭ嶺ｻ･荳翫↓縺励※縺上□縺輔＞" };
        }
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            const list = await this._loadAll();
            const idx = list.findIndex((u) => u.userId === userId);
            if (idx === -1) return { success: false, message: "繝ｦ繝ｼ繧ｶ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ" };
            list[idx].password = await bcrypt.hash(String(newPassword).trim(), 10);
            await fs.writeFile(USERS_DB_PATH, JSON.stringify(list, null, 2));
            return { success: true, message: "繝代せ繝ｯ繝ｼ繝峨ｒ譖ｴ譁ｰ縺励∪縺励◆" };
        });
    }

    async getUserRecordById(userId) {
        const list = await this._loadAll();
        return list.find((u) => u.userId === userId) || null;
    }

    async _applyImportRows(jsonData) {
        return runWithJsonFileWriteLock(USERS_DB_PATH, async () => {
            if (!jsonData.length) {
                return { success: false, message: "繝・・繧ｿ陦後′縺ゅｊ縺ｾ縺帙ｓ" };
            }
            const cols = resolveImportColumns(jsonData[0]);
            if (cols.customerId < 0 || cols.email < 0) {
                return { success: false, message: "繝倥ャ繝繝ｼ縺ｫ縲碁｡ｧ螳｢ID縲阪後Γ繝ｼ繝ｫ縲榊・縺悟ｿ・ｦ√〒縺・ };
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
                    errors.push(`陦・{i + 1}: 鬘ｧ螳｢ID ${customerId} 縺悟ｭ伜惠縺励∪縺帙ｓ`);
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
                        errors.push(`陦・{i + 1}: 繝｡繝ｼ繝ｫ ${email} 縺ｯ蛻･莨∵･ｭ縺ｫ逋ｻ骭ｲ貂医∩縺ｧ縺兪);
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
                        errors.push(`陦・{i + 1}: 繝｡繝ｼ繝ｫ ${email} 縺碁㍾隍・＠縺ｦ縺・∪縺兪);
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
            const errNote = errors.length ? `・郁ｭｦ蜻・${errors.length} 莉ｶ: ${errors.slice(0, 3).join(" / ")}${errors.length > 3 ? " 窶ｦ" : ""}・荏 : "";
            return {
                success: true,
                message: `蜿冶ｾｼ謌仙粥: 譁ｰ隕・{addCount}莉ｶ / 譖ｴ譁ｰ${updateCount}莉ｶ / 繧ｹ繧ｭ繝・・${skipCount}莉ｶ${errNote}`,
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
            throw new Error("繝輔ぃ繧､繝ｫ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: " + e.message);
        }
        if (!jsonData.length) {
            throw new Error("繝輔ぃ繧､繝ｫ縺ｫ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ");
        }
        return this._applyImportRows(jsonData);
    }

    async getImportTemplateBuffer() {
        const ExcelJS = require("exceljs");
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Upload");
        ws.addRow(["鬘ｧ螳｢ID", "繝｡繝ｼ繝ｫ", "陦ｨ遉ｺ蜷・, "繝ｭ繝ｼ繝ｫ", "蛻晄悄繝代せ繝ｯ繝ｼ繝・]);
        ws.addRow(["H015", "user@example.com", "諡・ｽ楢・錐", "admin", ""]);
        const buf = await wb.xlsx.writeBuffer();
        return Buffer.from(buf);
    }
}

module.exports = new CustomerUserService();
module.exports.normalizeEmail = normalizeEmail;
module.exports.toSafePublicUser = toSafePublicUser;
