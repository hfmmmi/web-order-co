// routes/orders-api.js
// 注文APIルート
// ★修正: 顧客用はルート直下、管理用は /api プレフィックスを付与して共存させる
const express = require("express");
const router = express.Router();
const multer = require("multer");

// 各サービスの専門部隊を呼び出し
const orderService = require("../services/orderService");
const mailService = require("../services/mailService");
const csvService = require("../services/csvService");
const settingsService = require("../services/settingsService");
const { validateBody } = require("../middlewares/validate");
const { placeOrderSchema } = require("../validators/requestSchemas");

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 🛒 顧客用エンドポイント (Prefixなし)
// ==========================================
// ※ cart.js, history.js から呼ばれるため変更禁止

// 1. 注文確定 API
router.post("/place-order", validateBody(placeOrderSchema), async (req, res) => {
    if (!req.session.customerId) return res.json({ success: false, message: "ログインが必要です" });

    const { cart, deliveryInfo } = req.body;
    const { customerId, customerName, priceRank } = req.session;

    try {
        const newOrder = await orderService.placeOrder(customerId, cart, deliveryInfo, priceRank || "");
        mailService.sendOrderConfirmation(newOrder, customerName).catch(e => console.error(e));
        res.json({ success: true, orderId: newOrder.orderId });
    } catch (error) {
        console.error("注文保存エラー", error);
        if (error.code === "STOCK_SHORTAGE") {
            res.json({ success: false, message: error.message || "在庫不足のため注文できません" });
        } else {
            res.json({ success: false, message: "システムエラーが発生しました" });
        }
    }
});

// 2. 注文一覧取得 API (顧客・管理者共用)
// 管理画面一覧は /api/admin/orders (admin-api.js) が担当するが、汎用的に残す
router.get("/orders", async (req, res) => {
    const { isAdmin, customerId } = req.session;
    if (!isAdmin && !customerId) return res.status(401).json({ success: false, message: "権限がありません" });

    const criteria = {
        ...req.query,
        customerId,
        isAdmin
    };

    try {
        const orders = await orderService.searchOrders(criteria);
        res.json({ success: true, orders });
    } catch (error) {
        console.error("注文一覧取得エラー", error);
        res.json({ success: false, message: "データの読み込み失敗" });
    }
});

// 3. 履歴API (顧客用)
router.get("/order-history", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });
    try {
        const historyData = await orderService.searchOrders({
            customerId: req.session.customerId,
            isAdmin: false
        });
        res.json({ success: true, history: historyData });
    } catch (error) {
        console.error("履歴取得エラー", error);
        res.json({ success: false, message: "読み込みエラー" });
    }
});

// 4. 配送履歴API (顧客用)
router.get("/delivery-history", async (req, res) => {
    if (!req.session.customerId) return res.json({ success: false, message: "ログインが必要です" });
    const keyword = (req.query.keyword || "").toLowerCase();
    try {
        const myOrders = await orderService.searchOrders({
            customerId: req.session.customerId,
            isAdmin: false
        });
        const addressSet = new Set();
        const uniqueHistory = [];
        myOrders.forEach(order => {
            const info = order.deliveryInfo || {};
            if (!info.address) return;
            const uniqueKey = `${info.address}::${info.name || ""}::${info.tel || ""}`;
            if (!addressSet.has(uniqueKey)) {
                if (keyword) {
                    const targetStr = `${info.address} ${info.name || ""} ${info.tel || ""}`.toLowerCase();
                    if (!targetStr.includes(keyword)) return;
                }
                addressSet.add(uniqueKey);
                uniqueHistory.push({
                    zip: info.zip || "",
                    address: info.address,
                    name: info.name || "",
                    tel: info.tel || "",
                    note: info.note || ""
                });
            }
        });
        res.json({ success: true, list: uniqueHistory.slice(0, 50) });
    } catch (error) {
        console.error("配送履歴取得エラー", error);
        res.json({ success: false, message: "エラー発生" });
    }
});

// 5. 荷主履歴API (顧客用)
router.get("/shipper-history", async (req, res) => {
    if (!req.session.customerId) return res.json({ success: false, message: "ログインが必要です" });
    const keyword = (req.query.keyword || "").toLowerCase();
    try {
        const myOrders = await orderService.searchOrders({
            customerId: req.session.customerId,
            isAdmin: false
        });
        const addressSet = new Set();
        const uniqueHistory = [];
        myOrders.forEach(order => {
            const info = order.deliveryInfo || {};
            const shipper = info.shipper;
            if (!shipper || !shipper.name) return;
            const uniqueKey = `${shipper.address || ""}::${shipper.name}::${shipper.tel || ""}`;
            if (!addressSet.has(uniqueKey)) {
                if (keyword) {
                    const targetStr = `${shipper.address || ""} ${shipper.name} ${shipper.tel || ""}`.toLowerCase();
                    if (!targetStr.includes(keyword)) return;
                }
                addressSet.add(uniqueKey);
                uniqueHistory.push({
                    zip: shipper.zip || "",
                    address: shipper.address || "",
                    name: shipper.name,
                    tel: shipper.tel || ""
                });
            }
        });
        res.json({ success: true, list: uniqueHistory.slice(0, 50) });
    } catch (error) {
        console.error("荷主履歴取得エラー", error);
        res.json({ success: false, message: "エラー発生" });
    }
});

// ==========================================
// 🛡️ 管理用API (Prefix: /api を付与)
// ==========================================
// ※ admin-orders.js 等から呼ばれる

/**
 * 受注CSVの keyword は管理画面の統合検索と同様に、得意先ID・社名・注文ID・明細のコード/品名のいずれかに一致すれば true。
 * 先頭が "(コード)" のときは得意先IDまたは商品コードの完全一致のみ。
 */
function orderMatchesDownloadCsvKeyword(order, keywordRaw) {
    if (keywordRaw === undefined || keywordRaw === null || String(keywordRaw).trim() === "") return true;
    const raw = String(keywordRaw);
    const key = raw.toLowerCase();
    const orderIdStr = String(order.orderId);
    const custIdStr = order.customerId || "";
    const codeMatch = raw.match(/^\((.+?)\)/);
    if (codeMatch && codeMatch[1]) {
        const codeRaw = codeMatch[1].trim();
        if (String(custIdStr) === codeRaw) return true;
        if (order.items && order.items.some(it => String(it.code || "") === codeRaw)) return true;
        return false;
    }
    if (orderIdStr.toLowerCase().includes(key)) return true;
    if (custIdStr.toLowerCase().includes(key)) return true;
    const cname = (order.customerName || "").toLowerCase();
    if (cname.includes(key)) return true;
    if (order.items && Array.isArray(order.items)) {
        for (const it of order.items) {
            const blob = `${it.code || ""} ${it.name || ""}`.toLowerCase();
            if (blob.includes(key)) return true;
        }
    }
    return false;
}

// CSVダウンロード API
router.get("/api/download-csv", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).send("権限がありません");
    
    const { status, keyword, start, end, mode } = req.query;
    const isUnexportedOnly = (mode === "unexported");

    try {
        const { productMaster, priceList, customerList, rankPriceMap, rawOrders } = await orderService.getAllDataForCsv();
        const filteredOrders = rawOrders.filter(order => {
            if (isUnexportedOnly && order.exported_at) return false;
            
            const matchKeyword = orderMatchesDownloadCsvKeyword(order, keyword);
            const currentStatus = order.status || "未発送";
            const matchStatus = (status === "") || (status === undefined) || (currentStatus === status);
            
            let orderDateStr = "1970-01-01";
            try {
                const d = new Date(order.orderDate);
                if (!isNaN(d.getTime())) {
                    const jstTime = d.getTime() + (9 * 60 * 60 * 1000);
                    orderDateStr = new Date(jstTime).toISOString().split('T')[0];
                }
            } catch (e) { }
            
            let matchDate = true;
            if (start && orderDateStr < start) matchDate = false;
            if (end && orderDateStr > end) matchDate = false;
            
            return matchKeyword && matchStatus && matchDate;
        });

        const exportSpec = await settingsService.getOrderCsvExportSpec();
        const csvData = csvService.generateOrdersCsv(
            filteredOrders,
            productMaster,
            priceList,
            customerList,
            rankPriceMap,
            isUnexportedOnly,
            exportSpec
        );

        if (isUnexportedOnly && filteredOrders.length > 0) {
            await orderService.markOrdersAsExported(filteredOrders.map(o => o.orderId));
        }

        const filename = isUnexportedOnly ? "flam_import_orders_NEW.csv" : "flam_import_orders_HISTORY.csv";
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(csvData);

    } catch (e) {
        console.error("CSVエラー", e);
        res.status(500).send("CSVエラー");
    }
});

// 出荷情報インポート API
router.post("/api/import-shipping-csv", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });
    const uploaded = req.file || (req.files && req.files.file);
    if (!uploaded) return res.status(400).json({ message: "ファイルがありません" });

    try {
        const fileBuffer = uploaded.buffer || uploaded.data;
        const rawData = csvService.parseShippingCsv(fileBuffer);
        if (rawData.length === 0) return res.json({ success: false, message: "データが空です" });

        let updateCount = 0;
        for (const row of rawData) {
            let targetOrderId = row["社内メモ"];
            if (!targetOrderId) continue;

            const trackingNumber = row["送り状番号"] || row["配送伝票番号"] || "";
            const deliveryCompany = row["配送業者"] || row["運送会社"] || "";

            if (trackingNumber) {
                try {
                    await orderService.registerShipment(targetOrderId, [{
                        deliveryCompany,
                        trackingNumber,
                        items: [],
                        deliveryDateUnknown: false
                    }]);
                    updateCount++;
                } catch (err) { }
            }
        }
        res.json({ success: true, count: updateCount, message: `${updateCount}件のステータスを更新しました` });
    } catch (error) {
        console.error("インポートエラー", error);
        res.status(500).json({ message: "処理に失敗: " + error.message });
    }
});

// 外部受注CSV一括取込
router.post('/api/import-orders-csv', async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });
    const uploaded = req.file || (req.files && req.files.file);
    if (!uploaded) return res.status(400).json({ success: false, message: "ファイルがありません" });

    try {
        const fileBuffer = uploaded.buffer || uploaded.data;
        const fileName = uploaded.originalname || uploaded.name || "";
        const importedOrders = csvService.parseExternalOrdersCsv(fileBuffer, fileName);
        const {
            createdCount,
            skippedCount,
            createdIds,
            skippedIds
        } = await orderService.importExternalOrders(importedOrders);

        res.json({
            success: true,
            message: `処理完了: 新規登録${createdCount}件 / 重複スキップ${skippedCount}件`,
            skippedIds: skippedIds,
            createdIds: createdIds
        });

    } catch (error) {
        console.error('Import Error:', error);
        res.status(500).json({ success: false, message: '取込失敗: ' + error.message });
    }
});

// ステータスリセット API
router.post("/api/reset-export-status", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ message: "権限なし" });
    try {
        const success = await orderService.resetExportStatus(req.body.orderId);
        res.json({ success, message: success ? "リセット完了" : "注文なし" });
    } catch (error) {
        res.status(500).json({ message: "保存失敗" });
    }
});

// ステータス・情報更新 API
router.post("/api/update-order-status", async (req, res) => {
    if (!req.session.isAdmin && !req.session.customerId) return res.status(401).json({ message: "権限なし" });
    try {
        await orderService.updateOrderStatus(req.body.orderId, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: "保存失敗" });
    }
});

// 出荷登録 API (Single)
router.post("/api/register-shipment", async (req, res) => {
    if (!req.session.isAdmin && !req.session.customerId) return res.status(401).json({ message: "権限なし" });
    const { orderId, shipItems, deliveryCompany, trackingNumber, deliveryDate, deliveryDateUnknown } = req.body;
    try {
        const newStatus = await orderService.registerShipment(orderId, [{
            items: shipItems,
            deliveryCompany,
            trackingNumber,
            deliveryDate,
            deliveryDateUnknown
        }]);
        res.json({ success: true, newStatus });
    } catch (error) {
        res.status(500).json({ message: "処理に失敗しました" });
    }
});

// ★修正: パスを /api/register-shipment-batch に変更 (404エラー対策)
// バッチ出荷登録 API
router.post("/api/register-shipment-batch", async (req, res) => {
    if (!req.session.isAdmin && !req.session.customerId) return res.status(401).json({ message: "権限なし" });
    try {
        const newStatus = await orderService.registerShipment(req.body.orderId, req.body.shipmentsPayload);
        res.json({ success: true, newStatus });
    } catch (error) {
        res.status(500).json({ message: "一括処理に失敗しました" });
    }
});

// 出荷履歴修正 API
router.post("/api/update-shipment-info", async (req, res) => {
    if (!req.session.isAdmin && !req.session.customerId) return res.status(401).json({ message: "権限なし" });
    try {
        await orderService.updateShipment(req.body.orderId, req.body.shipmentId, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: "保存失敗" });
    }
});

module.exports = router;
/** @type {typeof orderMatchesDownloadCsvKeyword} ユニットテスト用（本番ルーティングには影響しない） */
module.exports.orderMatchesDownloadCsvKeyword = orderMatchesDownloadCsvKeyword;