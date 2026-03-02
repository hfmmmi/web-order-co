// routes/support-api.js
// サポートチケット・不具合管理API (CRM機能強化版 + メール通知搭載)

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs").promises;
const mailService = require("../services/mailService");
const { dbPath } = require("../dbPaths");

const SUPPORT_DB_PATH = dbPath("support_tickets.json");

// 1. サポート申請受付 (顧客用)
router.post("/request-support", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const newRequest = req.body;
    try {
        let tickets = [];
        try {
            const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
            tickets = JSON.parse(data);
        } catch (e) { tickets = []; }

        const ticketId = "T-" + Date.now().toString(36).toUpperCase();

        const ticketData = {
            ticketId: ticketId,
            status: "open",
            category: newRequest.category || "support",
            
            // ★重要: データ構造の明確化
            // 顧客が申請時に入力/選択したWEB注文ID (存在しない場合は空)
            orderId: newRequest.orderId || "",
            
            // 顧客からの入力をすべて展開
            ...newRequest,

            // ★セキュリティ: 顧客からの入力にinternal系が含まれていても強制上書き
            internalOrderNo: "", 
            internalCustomerPoNumber: "", // ★追加: 社内発注NO

            // 顧客が入力した発注NO (参照用)
            customerPoNumber: newRequest.customerPoNumber || "",
            
            desiredAction: "",
            collectionDate: "",
            history: [],

            customerId: req.session.customerId, 
            customerName: req.session.customerName,
            timestamp: new Date().toISOString()
        };

        tickets.push(ticketData);
        await fs.writeFile(SUPPORT_DB_PATH, JSON.stringify(tickets, null, 2));

        // 管理者へのメール通知（設定ベース・非同期）
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
        internalCustomerPoNumber, // ★追加
        desiredAction, 
        collectionDate,
        newHistoryLog 
    } = req.body;

    try {
        const data = await fs.readFile(SUPPORT_DB_PATH, "utf-8");
        let tickets = JSON.parse(data);
        let updated = false;

        tickets = tickets.map(t => {
            if (t.ticketId === ticketId) {
                t.status = status;
                
                // ★社内管理用フィールドの更新
                if(internalOrderNo !== undefined) t.internalOrderNo = internalOrderNo;
                if(internalCustomerPoNumber !== undefined) t.internalCustomerPoNumber = internalCustomerPoNumber;
                
                if(desiredAction !== undefined) t.desiredAction = desiredAction;
                if(collectionDate !== undefined) t.collectionDate = collectionDate;

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
            res.json({ success: true, message: "チケット情報を更新しました" });
        } else {
            res.status(404).json({ success: false, message: "チケットが見つかりません" });
        }
    } catch (error) {
        console.error("更新エラー", error);
        res.status(500).json({ success: false, message: "更新失敗" });
    }
});

module.exports = router;