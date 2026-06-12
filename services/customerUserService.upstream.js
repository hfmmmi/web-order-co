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
        throw new Error("諡・ｽ楢・い繧ｫ繧ｦ繝ｳ繝井ｸ隕ｧ縺ｮ蠖｢蠑上′荳肴ｭ｣縺ｧ縺・);
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
                throw new Error(`繝ｭ繧ｰ繧､繝ｳID縺碁㍾隍・＠縺ｦ縺・∪縺・ ${userId}`);
            }
            seen.add(userId);

            if (!customerId) {
                throw new Error(`諡・ｽ楢・・{userId}縲阪・鬘ｧ螳｢ID繧呈欠螳壹＠縺ｦ縺上□縺輔＞`);
            }

            const customer = await customerService.getCustomerById(customerId);
            if (!customer) {
                throw new Error(`鬘ｧ螳｢ID縲・{customerId}縲阪′隕九▽縺九ｊ縺ｾ縺帙ｓ・域球蠖楢・ ${userId}・荏);
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
                throw new Error(`諡・ｽ楢・・{userId}縲阪・蛻晏屓逋ｻ骭ｲ縺ｫ縺ｯ繝代せ繝ｯ繝ｼ繝会ｼ・譁・ｭ嶺ｻ･荳奇ｼ峨′蠢・ｦ√〒縺兪);
            } else if (!prev) {
                throw new Error(`諡・ｽ楢・・{userId}縲阪・繝代せ繝ｯ繝ｼ繝峨・4譁・ｭ嶺ｻ･荳翫〒謖・ｮ壹＠縺ｦ縺上□縺輔＞`);
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
    if (!id) return { success: false, message: "繝ｭ繧ｰ繧､繝ｳID縺梧欠螳壹＆繧後※縺・∪縺帙ｓ" };

    const currentPassword = payload.currentPassword != null ? String(payload.currentPassword) : "";
    if (!currentPassword) {
        return { success: false, message: "迴ｾ蝨ｨ縺ｮ繝代せ繝ｯ繝ｼ繝峨ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞" };
    }

    const contactName =
        payload.contactName !== undefined ? String(payload.contactName).trim() : undefined;
    const emailRaw = payload.email !== undefined ? String(payload.email).trim() : undefined;
    const newPassword = payload.password != null ? String(payload.password) : "";

    if (newPassword && newPassword.length > 0 && newPassword.length < 4) {
        return { success: false, message: "譁ｰ縺励＞繝代せ繝ｯ繝ｼ繝峨・4譁・ｭ嶺ｻ･荳翫↓縺励※縺上□縺輔＞" };
    }

    return runWithJsonFileWriteLock(CUSTOMER_USERS_DB_PATH, async () => {
        const list = await readCustomerUserList();
        const user = list.find((u) => String(u.userId || "") === id);
        if (!user) return { success: false, message: "諡・ｽ楢・い繧ｫ繧ｦ繝ｳ繝医′隕九▽縺九ｊ縺ｾ縺帙ｓ" };

        const passwordOk = await verifyCustomerUserPassword(user, currentPassword);
        if (!passwordOk) {
            return { success: false, message: "迴ｾ蝨ｨ縺ｮ繝代せ繝ｯ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ" };
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
            message: "繧｢繧ｫ繧ｦ繝ｳ繝郁ｨｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆",
            user: toPublicCustomerUser(user)
        };
    });
}

async function updateCustomerUserPassword(userId, newPassword) {
    const id = String(userId || "").trim();
    if (!id) return { success: false, message: "繝ｭ繧ｰ繧､繝ｳID縺梧欠螳壹＆繧後※縺・∪縺帙ｓ" };
    if (!newPassword || String(newPassword).length < 4) {
        return { success: false, message: "繝代せ繝ｯ繝ｼ繝峨・4譁・ｭ嶺ｻ･荳翫↓縺励※縺上□縺輔＞" };
    }

    return runWithJsonFileWriteLock(CUSTOMER_USERS_DB_PATH, async () => {
        const list = await readCustomerUserList();
        const user = list.find((u) => String(u.userId || "") === id);
        if (!user) return { success: false, message: "諡・ｽ楢・い繧ｫ繧ｦ繝ｳ繝医′隕九▽縺九ｊ縺ｾ縺帙ｓ" };
        user.password = await bcrypt.hash(String(newPassword), 10);
        await fs.writeFile(CUSTOMER_USERS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
        return { success: true, message: "繝代せ繝ｯ繝ｼ繝峨ｒ譖ｴ譁ｰ縺励∪縺励◆" };
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
