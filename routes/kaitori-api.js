// routes/kaitori-api.js
// 買取システム（申請、マスタ管理、一括インポート）を担当
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs").promises;
const { dbPath } = require("../dbPaths");

// データベースの場所
const KAITORI_DB_PATH = dbPath("kaitori_requests.json");
const KAITORI_MASTER_PATH = dbPath("kaitori_master.json");

// ==========================================
//  1. 買取申請 (Front & Admin)
// ==========================================

// 買取申請受付 (POST /kaitori-request) -> ★顧客専用のまま
router.post("/kaitori-request", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const requestData = req.body;
    const customerId = req.session.customerId;
    const customerName = req.session.customerName;

    try {
        let requests = [];
        try {
            const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
            requests = JSON.parse(data);
        } catch (e) { requests = []; }

        const newRequest = {
            requestId: Date.now(),
            requestDate: new Date().toISOString(),
            customerId: customerId,
            customerName: customerName,
            status: "未対応",
            items: requestData.items,
            logistics: requestData.logistics || null,
            note: requestData.note || "",
            internalMemo: "",
            customerNote: ""
        };

        requests.push(newRequest);
        await fs.writeFile(KAITORI_DB_PATH, JSON.stringify(requests, null, 2));
        
        res.json({ success: true, requestId: newRequest.requestId });
    } catch (error) {
        console.error("買取処理エラー", error);
        res.status(500).json({ success: false, message: "サーバーエラー" });
    }
});

// 買取申請一覧 (管理者用) -> ★管理者専用に変更
router.get("/admin/kaitori-list", async (req, res) => {
    // ★修正: 管理者権限チェック
    if (!req.session.isAdmin) return res.status(401).json([]);
    
    try {
        const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
        const list = JSON.parse(data);
        res.json(list.reverse());
    } catch (error) {
        res.json([]);
    }
});

// 買取ステータス・詳細更新 (管理者用) -> ★管理者専用に変更
router.post("/admin/kaitori-update", async (req, res) => {
    // ★修正: 管理者権限チェック
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const { requestId, status, internalMemo, customerNote, items } = req.body;

    try {
        const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
        let requests = JSON.parse(data);

        const targetIndex = requests.findIndex(r => r.requestId == requestId);
        if (targetIndex === -1) {
            return res.status(404).json({ success: false, message: "データが見つかりません" });
        }

        if (status !== undefined) requests[targetIndex].status = status;
        if (internalMemo !== undefined) requests[targetIndex].internalMemo = internalMemo;
        if (customerNote !== undefined) requests[targetIndex].customerNote = customerNote;
        if (internalMemo !== undefined) requests[targetIndex].adminNote = internalMemo; // 互換性

        if (items && Array.isArray(items)) {
            requests[targetIndex].items = items;
        }

        requests[targetIndex].updatedAt = new Date().toISOString();

        await fs.writeFile(KAITORI_DB_PATH, JSON.stringify(requests, null, 2));
        res.json({ success: true, message: "内容を更新しました" });

    } catch (error) {
        console.error("更新エラー", error);
        res.status(500).json({ success: false, message: "サーバーエラー" });
    }
});


// ==========================================
//  2. 買取マスタ管理 (CRUD & Import)
// ==========================================

// マスタ取得 -> ★顧客(申込時)と管理者(編集時)の両方が使う
router.get("/kaitori-master", async (req, res) => {
    // ★修正: 顧客または管理者のどちらかならOK
    const isCustomer = !!req.session.customerId;
    const isAdmin = !!req.session.isAdmin;

    if (!isCustomer && !isAdmin) {
        return res.status(401).json([]);
    }

    try {
        const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
        res.json(JSON.parse(data));
    } catch (error) {
        res.json([]);
    }
});

// マスタ一括更新 -> ★管理者専用に変更
router.post("/admin/kaitori-master/import", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });
    
    const newList = req.body.masterData; 
    if (!Array.isArray(newList)) return res.status(400).json({ message: "データ形式エラー" });

    try {
        const cleanList = newList.map((item, index) => ({
            id: item.id || `K-${Date.now()}-${index}`,
            maker: item.maker || "",
            name: item.name || "",
            type: item.type || "",
            price: parseInt(item.price) || 0,
            destination: item.destination || "大阪"
        }));

        await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(cleanList, null, 2));
        res.json({ success: true, count: cleanList.length, message: `マスタ ${cleanList.length}件 を更新しました` });
    } catch (error) {
        console.error("Import Error", error);
        res.status(500).json({ message: "マスタ保存失敗" });
    }
});

// マスタ単体追加 -> ★管理者専用に変更
router.post("/admin/kaitori-master/add", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const newItem = req.body;
    
    try {
        let master = [];
        try {
            const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
            master = JSON.parse(data);
        } catch(e) {}

        const item = {
            id: newItem.id || `K-${Date.now()}`,
            maker: newItem.maker || "",
            name: newItem.name || "",
            type: newItem.type || "",
            price: parseInt(newItem.price) || 0,
            destination: newItem.destination || "大阪"
        };

        master.push(item);
        await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(master, null, 2));
        res.json({ success: true, message: "追加しました", item });
    } catch (error) {
        res.status(500).json({ success: false, message: "追加失敗" });
    }
});

// マスタ単体編集 -> ★管理者専用に変更
router.post("/admin/kaitori-master/edit", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const { id, ...updates } = req.body;

    try {
        const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
        let master = JSON.parse(data);
        const idx = master.findIndex(m => m.id === id);

        if (idx === -1) return res.status(404).json({ success: false, message: "対象が見つかりません" });

        master[idx] = { ...master[idx], ...updates };
        if(updates.price !== undefined) master[idx].price = parseInt(updates.price) || 0;

        await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(master, null, 2));
        res.json({ success: true, message: "更新しました" });
    } catch (error) {
        res.status(500).json({ success: false, message: "更新失敗" });
    }
});

// マスタ単体削除 -> ★管理者専用に変更
router.post("/admin/kaitori-master/delete", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const { id } = req.body;

    try {
        const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
        let master = JSON.parse(data);
        
        const beforeLen = master.length;
        master = master.filter(m => m.id !== id);

        if (master.length === beforeLen) return res.status(404).json({ success: false, message: "削除対象なし" });

        await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(master, null, 2));
        res.json({ success: true, message: "削除しました" });
    } catch (error) {
        res.status(500).json({ success: false, message: "削除失敗" });
    }
});

// 6. ユーザー用履歴取得 -> ★顧客専用のまま
router.get("/my-kaitori-history", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }
    
    const myId = req.session.customerId;

    try {
        const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
        const allRequests = JSON.parse(data);
        const myRequests = allRequests.filter(req => req.customerId === myId).reverse();
        res.json(myRequests);

    } catch (error) {
        console.error("履歴取得エラー", error);
        res.json([]);
    }
});

module.exports = router;