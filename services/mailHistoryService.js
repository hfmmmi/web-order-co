"use strict";

const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const MAIL_HISTORY_PATH = dbPath("logs/mail-history.json");
const MAX_ENTRIES = 5000;

const MAIL_TYPE_LABELS = {
    order_confirmation: "注文確定通知",
    support_notification: "サポート通知",
    invite: "招待メール",
    password_reset: "パスワード再設定",
    password_changed: "パスワード変更通知",
    login_failure_alert: "ログイン失敗通知"
};

async function readMailHistoryList() {
    try {
        const data = await fs.readFile(MAIL_HISTORY_PATH, "utf-8");
        const list = JSON.parse(data);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
    }
}

function resolveActorLabel(meta = {}) {
    if (meta.sentByAdminName) return String(meta.sentByAdminName);
    if (meta.sentByAdminId) return String(meta.sentByAdminId);
    if (meta.sentByContactName) return String(meta.sentByContactName);
    if (meta.sentByCustomerUserId) return String(meta.sentByCustomerUserId);
    if (meta.sentByCustomerName) return String(meta.sentByCustomerName);
    if (meta.actorLabel) return String(meta.actorLabel);
    return "システム";
}

function toPublicEntry(row) {
    if (!row) return null;
    return {
        id: row.id,
        at: row.at,
        mailType: row.mailType,
        mailTypeLabel: row.mailTypeLabel || MAIL_TYPE_LABELS[row.mailType] || row.mailType || "",
        subject: row.subject || "",
        to: row.to || "",
        actorLabel: row.actorLabel || resolveActorLabel(row),
        success: row.success !== false,
        errorMessage: row.errorMessage || ""
    };
}

async function appendMailHistory(entry) {
    const row = {
        id: entry.id || `MH-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        at: entry.at || new Date().toISOString(),
        mailType: entry.mailType || "unknown",
        mailTypeLabel: entry.mailTypeLabel || MAIL_TYPE_LABELS[entry.mailType] || entry.mailType || "",
        subject: entry.subject || "",
        to: entry.to || "",
        from: entry.from || "",
        success: entry.success !== false,
        errorMessage: entry.errorMessage ? String(entry.errorMessage).slice(0, 500) : "",
        sentByAdminId: entry.sentByAdminId || null,
        sentByAdminName: entry.sentByAdminName || null,
        sentByCustomerUserId: entry.sentByCustomerUserId || null,
        sentByContactName: entry.sentByContactName || null,
        sentByCustomerName: entry.sentByCustomerName || null,
        actorLabel: resolveActorLabel(entry)
    };

    return runWithJsonFileWriteLock(MAIL_HISTORY_PATH, async () => {
        let list = await readMailHistoryList();
        list.push(row);
        if (list.length > MAX_ENTRIES) {
            list = list.slice(list.length - MAX_ENTRIES);
        }
        const dir = path.dirname(MAIL_HISTORY_PATH);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(MAIL_HISTORY_PATH, JSON.stringify(list, null, 2), "utf-8");
        return row;
    });
}

async function getMailHistory(options = {}) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(options.limit, 10) || 50));
    const keyword = String(options.keyword || "").trim().toLowerCase();

    let list = await readMailHistoryList();
    list.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

    if (keyword) {
        list = list.filter((row) => {
            const hay = [
                row.subject,
                row.to,
                row.actorLabel,
                row.mailTypeLabel,
                MAIL_TYPE_LABELS[row.mailType],
                row.sentByAdminName,
                row.sentByContactName,
                row.sentByCustomerName
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(keyword);
        });
    }

    const total = list.length;
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit).map(toPublicEntry).filter(Boolean);

    return { items, total, page, limit };
}

module.exports = {
    MAIL_TYPE_LABELS,
    appendMailHistory,
    getMailHistory,
    resolveActorLabel
};
