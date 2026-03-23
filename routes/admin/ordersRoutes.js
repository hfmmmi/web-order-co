"use strict";

const express = require("express");
const router = express.Router();
const orderService = require("../../services/orderService");
const specialPriceService = require("../../services/specialPriceService");
const csvService = require("../../services/csvService");
const settingsService = require("../../services/settingsService");
const { requireAdmin } = require("./requireAdmin");

router.post("/update-order-status", (req, res, next) => {
    if (!req.session.isAdmin && !req.session.customerId) return res.status(401).json({ message: "権限なし" });
    orderService.updateOrderStatus(req.body.orderId, req.body)
        .then(() => res.json({ success: true }))
        .catch(err => res.status(500).json({ success: false, message: "保存失敗" }));
});

router.get("/admin/orders", requireAdmin, async (req, res) => {
    try {
        const orders = await orderService.getAllOrders();
        res.json({ success: true, orders: orders });
    } catch (e) {
        console.error("Order Fetch Error:", e);
        res.status(500).json({ success: false, message: "注文データの取得に失敗しました" });
    }
});

router.post("/import-flam", requireAdmin, async (req, res) => {
    if (!req.files || !req.files.csvFile) {
        return res.status(400).json({ success: false, message: "CSVファイルがありません" });
    }
    try {
        const result = await orderService.importFlamData(req.files.csvFile.data);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: "インポート失敗: " + error.message });
    }
});

router.post("/admin/import-estimates", requireAdmin, async (req, res) => {
    if (!req.files || !req.files.estimateFile) {
        return res.status(400).json({ success: false, message: "ファイルがアップロードされていません" });
    }
    try {
        const fileBuffer = req.files.estimateFile.data;
        const fileName = req.files.estimateFile.name || "";
        const settings = await settingsService.getSettings();
        const aliasOverride =
            settings.dataFormats && settings.dataFormats.estimateImportAliases
                ? settings.dataFormats.estimateImportAliases
                : {};
        const parsedData = await csvService.parseEstimatesData(fileBuffer, fileName, aliasOverride);
        if (parsedData.length === 0) {
            return res.status(400).json({ success: false, message: "有効なデータが見つかりませんでした（顧客コード0000の行は除外されます）" });
        }
        const saveResult = await specialPriceService.saveEstimates(parsedData);
        res.json({
            success: true,
            message: `${saveResult.count} 件の見積データを登録しました`,
            count: saveResult.count
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "インポート処理中にエラーが発生しました: " + error.message });
    }
});

router.post("/admin/delete-estimates-by-manufacturer", requireAdmin, async (req, res) => {
    try {
        const { manufacturer } = req.body;
        if (!manufacturer || typeof manufacturer !== "string") {
            return res.status(400).json({ success: false, message: "メーカー名を指定してください" });
        }
        const result = await specialPriceService.deleteEstimatesByManufacturer(manufacturer);
        res.json({
            success: true,
            message: `商品名に「${manufacturer}」を含む見積を削除しました`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error("Delete by Manufacturer Error:", error);
        res.status(500).json({ success: false, message: "削除処理に失敗しました: " + error.message });
    }
});

router.post("/admin/delete-estimates-by-products", requireAdmin, async (req, res) => {
    try {
        const { productCodes } = req.body;
        if (!Array.isArray(productCodes) || productCodes.length === 0) {
            return res.status(400).json({ success: false, message: "商品コードを指定してください" });
        }
        const result = await specialPriceService.deleteEstimatesByProductCodes(productCodes);
        res.json({
            success: true,
            message: `${result.deletedCount}件の見積データを削除しました`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error("Delete by Product Codes Error:", error);
        res.status(500).json({ success: false, message: "削除処理に失敗しました: " + error.message });
    }
});

module.exports = router;
