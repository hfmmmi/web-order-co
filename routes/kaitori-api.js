// routes/kaitori-api.js
// 買取システム（申請、マスタ管理、一括インポート）を担当
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const { randomBytes } = require("crypto");
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const KAITORI_DB_PATH = dbPath("kaitori_requests.json");
const KAITORI_MASTER_PATH = dbPath("kaitori_master.json");

function newKaitoriRequestId() {
    return `KR-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

// ==========================================
//  1. 買取申請 (Front & Admin)
// ==========================================

router.post("/kaitori-request", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const requestData = req.body;
    const customerId = req.session.customerId;
    const customerName = req.session.customerName;

    try {
        const requestId = newKaitoriRequestId();
        await runWithJsonFileWriteLock(KAITORI_DB_PATH, async () => {
            let requests = [];
            try {
                const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
                requests = JSON.parse(data);
                if (!Array.isArray(requests)) requests = [];
            } catch (e) {
                requests = [];
            }

            const newRequest = {
                requestId,
                requestDate: new Date().toISOString(),
                customerId,
                customerName,
                status: "未対応",
                items: requestData.items,
                logistics: requestData.logistics || null,
                note: requestData.note || "",
                internalMemo: "",
                customerNote: ""
            };

            requests.push(newRequest);
            await fs.writeFile(KAITORI_DB_PATH, JSON.stringify(requests, null, 2));
        });

        res.json({ success: true, requestId });
    } catch (error) {
        console.error("買取処理エラー", error);
        res.status(500).json({ success: false, message: "サーバーエラー" });
    }
});

router.get("/admin/kaitori-list", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json([]);

    try {
        const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
        const list = JSON.parse(data);
        res.json(list.reverse());
    } catch (error) {
        res.json([]);
    }
});

router.post("/admin/kaitori-update", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const { requestId, status, internalMemo, customerNote, items } = req.body;

    try {
        let notFound = false;
        await runWithJsonFileWriteLock(KAITORI_DB_PATH, async () => {
            const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
            let requests = JSON.parse(data);
            if (!Array.isArray(requests)) requests = [];

            const targetIndex = requests.findIndex((r) => r.requestId == requestId);
            if (targetIndex === -1) {
                notFound = true;
                return;
            }

            if (status !== undefined) requests[targetIndex].status = status;
            if (internalMemo !== undefined) requests[targetIndex].internalMemo = internalMemo;
            if (customerNote !== undefined) requests[targetIndex].customerNote = customerNote;
            if (internalMemo !== undefined) requests[targetIndex].adminNote = internalMemo;

            if (items && Array.isArray(items)) {
                requests[targetIndex].items = items;
            }

            requests[targetIndex].updatedAt = new Date().toISOString();

            await fs.writeFile(KAITORI_DB_PATH, JSON.stringify(requests, null, 2));
        });

        if (notFound) {
            return res.status(404).json({ success: false, message: "データが見つかりません" });
        }
        res.json({ success: true, message: "内容を更新しました" });
    } catch (error) {
        console.error("更新エラー", error);
        res.status(500).json({ success: false, message: "サーバーエラー" });
    }
});

// ==========================================
//  2. 買取マスタ管理 (CRUD & Import)
// ==========================================

router.get("/kaitori-master", async (req, res) => {
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

router.post("/admin/kaitori-master/import", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const newList = req.body.masterData;
    if (!Array.isArray(newList)) return res.status(400).json({ message: "データ形式エラー" });

    try {
        let count = 0;
        await runWithJsonFileWriteLock(KAITORI_MASTER_PATH, async () => {
            const cleanList = newList.map((item, index) => ({
                id: item.id || `K-${Date.now()}-${index}`,
                maker: item.maker || "",
                name: item.name || "",
                type: item.type || "",
                price: parseInt(item.price, 10) || 0,
                destination: item.destination || "大阪"
            }));
            count = cleanList.length;
            await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(cleanList, null, 2));
        });
        res.json({ success: true, count, message: `マスタ ${count}件 を更新しました` });
    } catch (error) {
        console.error("Import Error", error);
        res.status(500).json({ message: "マスタ保存失敗" });
    }
});

router.post("/admin/kaitori-master/add", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const newItem = req.body;

    try {
        let item;
        await runWithJsonFileWriteLock(KAITORI_MASTER_PATH, async () => {
            let master = [];
            try {
                const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
                master = JSON.parse(data);
                if (!Array.isArray(master)) master = [];
            } catch (e) {
                master = [];
            }

            item = {
                id: newItem.id || `K-${Date.now()}`,
                maker: newItem.maker || "",
                name: newItem.name || "",
                type: newItem.type || "",
                price: parseInt(newItem.price, 10) || 0,
                destination: newItem.destination || "大阪"
            };

            master.push(item);
            await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(master, null, 2));
        });
        res.json({ success: true, message: "追加しました", item });
    } catch (error) {
        res.status(500).json({ success: false, message: "追加失敗" });
    }
});

router.post("/admin/kaitori-master/edit", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const { id, ...updates } = req.body;

    try {
        let notFound = false;
        await runWithJsonFileWriteLock(KAITORI_MASTER_PATH, async () => {
            const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
            let master = JSON.parse(data);
            if (!Array.isArray(master)) master = [];
            const idx = master.findIndex((m) => m.id === id);

            if (idx === -1) {
                notFound = true;
                return;
            }

            master[idx] = { ...master[idx], ...updates };
            if (updates.price !== undefined) master[idx].price = parseInt(updates.price, 10) || 0;

            await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(master, null, 2));
        });

        if (notFound) return res.status(404).json({ success: false, message: "対象が見つかりません" });
        res.json({ success: true, message: "更新しました" });
    } catch (error) {
        res.status(500).json({ success: false, message: "更新失敗" });
    }
});

router.post("/admin/kaitori-master/delete", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    const { id } = req.body;

    try {
        let notFound = false;
        await runWithJsonFileWriteLock(KAITORI_MASTER_PATH, async () => {
            const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
            let master = JSON.parse(data);
            if (!Array.isArray(master)) master = [];

            const beforeLen = master.length;
            master = master.filter((m) => m.id !== id);

            if (master.length === beforeLen) {
                notFound = true;
                return;
            }

            await fs.writeFile(KAITORI_MASTER_PATH, JSON.stringify(master, null, 2));
        });

        if (notFound) return res.status(404).json({ success: false, message: "削除対象なし" });
        res.json({ success: true, message: "削除しました" });
    } catch (error) {
        res.status(500).json({ success: false, message: "削除失敗" });
    }
});

router.get("/my-kaitori-history", async (req, res) => {
    if (!req.session.customerId) {
        return res.status(401).json({ message: "ログインが必要です" });
    }

    const myId = req.session.customerId;

    try {
        const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
        const allRequests = JSON.parse(data);
        if (!Array.isArray(allRequests)) return res.json([]);
        const myRequests = allRequests.filter((r) => r.customerId === myId).reverse();
        res.json(myRequests);
    } catch (error) {
        console.error("履歴取得エラー", error);
        res.json([]);
    }
});

module.exports = router;
