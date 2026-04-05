// routes/support-api.js
// サポートチケット・不具合管理API (CRM機能強化版 + メール通知搭載)

const express = require("express");
const router = express.Router();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs").promises;
const mailService = require("../services/mailService");
const { dbPath, DATA_ROOT } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const SUPPORT_DB_PATH = dbPath("support_tickets.json");
const ATTACH_DIR_NAME = "support_attachments";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACH_EXT = new Set([
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".txt", ".csv",
    ".doc", ".docx", ".xls", ".xlsx",
    ".zip"
]);

function normalizeUploadFiles(field) {
    if (!field) return [];
    return Array.isArray(field) ? field : [field];
}

function ticketIdParamOk(id) {
    return typeof id === "string" && /^T-[0-9A-Z]+$/i.test(id);
}

function storedNameOk(name) {
    return typeof name === "string" && /^\d+_\d+_[a-f0-9]{8}\.[a-z0-9]+$/i.test(name);
}

/**
 * @param {string} ticketId
 * @param {import("express-fileupload").UploadedFile | import("express-fileupload").UploadedFile[]} filesField
 * @returns {Promise<Array<{ storedName: string, originalName: string, size: number, mimeType: string }>>}
 */
async function saveTicketAttachments(ticketId, filesField) {
    const arr = normalizeUploadFiles(filesField).filter((f) => f && f.name && f.size > 0);
    if (arr.length === 0) return [];

    const dir = path.join(DATA_ROOT, ATTACH_DIR_NAME, ticketId);
    await fs.mkdir(dir, { recursive: true });
    const out = [];

    for (let i = 0; i < arr.length && out.length < MAX_ATTACHMENTS; i++) {
        const file = arr[i];
        const ext = path.extname(file.name || "").toLowerCase();
        if (!ALLOWED_ATTACH_EXT.has(ext)) {
            continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
            const err = new Error("FILE_TOO_LARGE");
            err.code = "FILE_TOO_LARGE";
            throw err;
        }
        const suffix = crypto.randomBytes(4).toString("hex");
        const storedName = `${out.length}_${Date.now()}_${suffix}${ext}`;
        const dest = path.join(dir, storedName);
        if (typeof file.mv === "function") {
            await file.mv(dest);
        } else if (file.data) {
            await fs.writeFile(dest, file.data);
        } else {
            continue;
        }
        out.push({
            storedName,
            originalName: String(file.name || "file").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180),
            size: file.size,
            mimeType: file.mimetype || ""
        });
    }
    return out;
}

// 添付ダウンロード（ログイン顧客＝本人チケットのみ、管理者は全件）
router.get("/support/attachment/:ticketId/:storedName", async (req, res) => {
    const { ticketId, storedName } = req.params;
    if (!ticketIdParamOk(ticketId) || !storedNameOk(storedName)) {
        return res.status(400).send("不正なパラメータです");
    }
    const isCustomer = !!req.session.customerId;
    const isAdmin = !!req.session.isAdmin;
    if (!isCustomer && !isAdmin) {
        return res.status(401).send("ログインが必要です");
    }

    try {
        const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
        const tickets = JSON.parse(data);
        if (!Array.isArray(tickets)) {
            return res.status(404).send("見つかりません");
        }
        const ticket = tickets.find((t) => t && t.ticketId === ticketId);
        if (!ticket) {
            return res.status(404).send("見つかりません");
        }
        if (isCustomer && ticket.customerId !== req.session.customerId) {
            return res.status(403).send("権限がありません");
        }
        const att = (ticket.attachments || []).find((a) => a && a.storedName === storedName);
        if (!att) {
            return res.status(404).send("見つかりません");
        }

        const fullPath = path.join(DATA_ROOT, ATTACH_DIR_NAME, ticketId, storedName);
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(path.join(DATA_ROOT, ATTACH_DIR_NAME, ticketId));
        if (!resolved.startsWith(baseResolved + path.sep)) {
            return res.status(400).send("不正なパスです");
        }

        return res.download(resolved, att.originalName || storedName);
    } catch (e) {
        console.error("添付ダウンロードエラー", e);
        return res.status(500).send("サーバーエラー");
    }
});

// 1. サポート申請受付 (顧客用) — JSON または multipart/form-data
router.post("/request-support", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const newRequest = req.body && typeof req.body === "object" ? req.body : {};
    try {
        const ticketId = "T-" + Date.now().toString(36).toUpperCase();

        let attachmentRecords = [];
        try {
            if (req.files && req.files.attachments) {
                attachmentRecords = await saveTicketAttachments(ticketId, req.files.attachments);
            }
        } catch (e) {
            if (e && e.code === "FILE_TOO_LARGE") {
                return res.status(400).json({
                    success: false,
                    message: "添付ファイルが大きすぎます（1ファイルあたり最大10MB、拡張子はPDF・画像・Office・zip等に限ります）"
                });
            }
            throw e;
        }

        const ticketData = {
            ticketId: ticketId,
            status: "open",
            category: newRequest.category || "support",
            orderId: newRequest.orderId || "",
            ...newRequest,
            internalOrderNo: "",
            internalCustomerPoNumber: "",
            customerPoNumber: newRequest.customerPoNumber || "",
            desiredAction: "",
            collectionDate: "",
            history: [],
            customerId: req.session.customerId,
            customerName: req.session.customerName,
            timestamp: new Date().toISOString(),
            attachments: attachmentRecords
        };

        await runWithJsonFileWriteLock(SUPPORT_DB_PATH, async () => {
            let tickets = [];
            try {
                const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
                tickets = JSON.parse(data);
                if (!Array.isArray(tickets)) tickets = [];
            } catch (e) {
                tickets = [];
            }
            tickets.push(ticketData);
            await fs.writeFile(SUPPORT_DB_PATH, JSON.stringify(tickets, null, 2));
        });

        mailService.sendSupportNotification(ticketData).catch((e) => {
            console.error("メール送信失敗:", e);
        });

        res.json({ success: true, message: "申請を受け付けました" });
    } catch (error) {
        console.error("サポート申請エラー", error);
        res.status(500).json({ success: false, message: "サーバーエラー" });
    }
});

// 1.5 顧客自身のサポート履歴取得 (顧客用)
router.get("/support/my-tickets", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    try {
        let tickets = [];
        try {
            const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
            tickets = JSON.parse(data);
        } catch (e) { tickets = []; }

        if (!Array.isArray(tickets)) tickets = [];

        const mine = tickets
            .filter((t) => t && t.customerId === req.session.customerId)
            .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
            .map((t) => ({
                ticketId: t.ticketId || "",
                status: t.status || "open",
                category: t.category || "support",
                type: t.type || "",
                detail: t.detail || "",
                orderId: t.orderId || "",
                customerPoNumber: t.customerPoNumber || "",
                desiredAction: t.desiredAction || "",
                collectionDate: t.collectionDate || "",
                timestamp: t.timestamp || null,
                attachments: Array.isArray(t.attachments)
                    ? t.attachments.map((a) => ({
                        storedName: a.storedName || "",
                        originalName: a.originalName || "",
                        size: typeof a.size === "number" ? a.size : 0
                    }))
                    : [],
                history: Array.isArray(t.history)
                    ? t.history.map((h) => ({
                        date: h && h.date ? h.date : null,
                        action: h && h.action ? h.action : "",
                        by: h && h.by ? h.by : "管理者"
                    }))
                    : []
            }));

        res.json({ success: true, tickets: mine });
    } catch (error) {
        console.error("サポート履歴取得エラー", error);
        res.status(500).json({ success: false, message: "サーバーエラー" });
    }
});

// 2. 一覧取得 (管理者用)
router.get("/admin/support-tickets", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限がありません" });

    try {
        const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
        const tickets = JSON.parse(data);
        res.json(tickets.reverse());
    } catch (error) {
        res.json([]);
    }
});

// 3. チケット詳細更新 (管理者用)
router.post("/admin/update-ticket", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限がありません" });

    const {
        ticketId,
        status,
        internalOrderNo,
        internalCustomerPoNumber,
        desiredAction,
        collectionDate,
        newHistoryLog
    } = req.body;

    try {
        let updated = false;
        await runWithJsonFileWriteLock(SUPPORT_DB_PATH, async () => {
            const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
            let tickets = JSON.parse(data);
            if (!Array.isArray(tickets)) tickets = [];

            tickets = tickets.map((t) => {
                if (t.ticketId === ticketId) {
                    t.status = status;

                    if (internalOrderNo !== undefined) t.internalOrderNo = internalOrderNo;
                    if (internalCustomerPoNumber !== undefined) t.internalCustomerPoNumber = internalCustomerPoNumber;

                    if (desiredAction !== undefined) t.desiredAction = desiredAction;
                    if (collectionDate !== undefined) t.collectionDate = collectionDate;

                    if (newHistoryLog) {
                        if (!t.history) t.history = [];
                        t.history.push({
                            date: new Date().toISOString(),
                            action: newHistoryLog,
                            by: req.session.adminName || "Admin"
                        });
                    }
                    updated = true;
                }
                return t;
            });

            if (updated) {
                await fs.writeFile(SUPPORT_DB_PATH, JSON.stringify(tickets, null, 2));
            }
        });

        if (updated) {
            res.json({ success: true, message: "チケット情報を更新しました" });
        } else {
            res.status(404).json({ success: false, message: "チケットが見つかりません" });
        }
    } catch (error) {
        console.error("更新エラー", error);
        res.status(500).json({ success: false, message: "更新失敗" });
    }
});

Object.defineProperty(router, "normalizeUploadFiles", {
    enumerable: false,
    configurable: true,
    value: normalizeUploadFiles
});
Object.defineProperty(router, "saveTicketAttachments", {
    enumerable: false,
    configurable: true,
    value: saveTicketAttachments
});
module.exports = router;
