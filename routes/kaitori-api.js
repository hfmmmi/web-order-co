// routes/kaitori-api.js
// 買取システム（申請、マスタ管理、一括インポート）を担当
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");
const {
    nextPrefixedSequentialId,
    attachPrefixedDisplayIds
} = require("../utils/sequentialPrefixedId");
const kaitoriMasterExportService = require("../services/kaitoriMasterExportService");

const KAITORI_DB_PATH = dbPath("kaitori_requests.json");
const KAITORI_MASTER_PATH = dbPath("kaitori_master.json");
const KAITORI_ID_PREFIX = "KS";

const KAITORI_DISPLAY_OPTS = {
    prefix: KAITORI_ID_PREFIX,
    dateField: "requestDate",
    idField: "requestId"
};

const KAITORI_MASTER_STATUS_ACTIVE = "買取中";
const KAITORI_MASTER_STATUS_ENDED = "買取終了";

function normalizeKaitoriMasterStatus(status) {
    return status === KAITORI_MASTER_STATUS_ENDED ? KAITORI_MASTER_STATUS_ENDED : KAITORI_MASTER_STATUS_ACTIVE;
}

function buildKaitoriMasterItem(item, fallbackId) {
    return {
        id: item.id || fallbackId,
        maker: item.maker || "",
        name: item.name || "",
        type: item.type || "",
        status: normalizeKaitoriMasterStatus(item.status),
        price: parseInt(item.price, 10) || 0,
        destination: item.destination || "大阪"
    };
}

function nextKaitoriRequestId(requests) {
    return nextPrefixedSequentialId(requests, KAITORI_DISPLAY_OPTS);
}

function attachKaitoriDisplayIds(requests) {
    return attachPrefixedDisplayIds(requests, KAITORI_DISPLAY_OPTS);
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
        let requestId;
        await runWithJsonFileWriteLock(KAITORI_DB_PATH, async () => {
            let requests = [];
            try {
                const data = await fs.readFile(KAITORI_DB_PATH, "utf-8");
                requests = JSON.parse(data);
                if (!Array.isArray(requests)) requests = [];
            } catch (e) {
                requests = [];
            }

            requestId = nextKaitoriRequestId(requests);

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

        res.json({ success: true, requestId, displayId: requestId });
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
        if (!Array.isArray(list)) {
            res.json([]);
            return;
        }
        res.json(attachKaitoriDisplayIds(list).reverse());
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

router.get("/admin/kaitori-master/export", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });

    try {
        const buffer = await kaitoriMasterExportService.buildKaitoriMasterExportBuffer();
        const filename = kaitoriMasterExportService.buildExportFilename();
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        return res.send(Buffer.from(buffer));
    } catch (error) {
        console.error("Kaitori master export error:", error);
        return res.status(500).json({ success: false, message: "マスタの出力に失敗しました" });
    }
});

router.get("/kaitori-master", async (req, res) => {
    const isCustomer = !!req.session.customerId;
    const isAdmin = !!req.session.isAdmin;

    if (!isCustomer && !isAdmin) {
        return res.status(401).json([]);
    }

    try {
        const data = await fs.readFile(KAITORI_MASTER_PATH, "utf-8");
        let list = JSON.parse(data);
        if (!Array.isArray(list)) list = [];
        if (isCustomer && !isAdmin) {
            list = list.filter((item) => normalizeKaitoriMasterStatus(item.status) !== KAITORI_MASTER_STATUS_ENDED);
        }
        res.json(list);
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
            const cleanList = newList.map((item, index) =>
                buildKaitoriMasterItem(item, `K-${Date.now()}-${index}`)
            );
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

            item = buildKaitoriMasterItem(newItem, `K-${Date.now()}`);

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
            if (updates.status !== undefined) {
                master[idx].status = normalizeKaitoriMasterStatus(updates.status);
            } else if (master[idx].status === undefined) {
                master[idx].status = KAITORI_MASTER_STATUS_ACTIVE;
            }
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
        const withDisplay = attachKaitoriDisplayIds(allRequests);
        const myRequests = withDisplay.filter((r) => r.customerId === myId).reverse();
        res.json(myRequests);
    } catch (error) {
        console.error("履歴取得エラー", error);
        res.json([]);
    }
});

module.exports = router;
