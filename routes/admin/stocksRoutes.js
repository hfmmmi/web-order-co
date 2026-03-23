"use strict";

const express = require("express");
const router = express.Router();
const stockService = require("../../services/stockService");
const { createAdapter } = require("../../services/stockAdapters");
const excelReader = require("../../utils/excelReader");
const { requireAdmin } = require("./requireAdmin");

router.get("/admin/stocks/settings", requireAdmin, async (req, res) => {
    try {
        const [config, display] = await Promise.all([
            stockService.getAdapterConfig(),
            stockService.getDisplaySettings()
        ]);
        res.json({
            success: true,
            display,
            adapters: config.adapters || []
        });
    } catch (error) {
        console.error("Stock settings fetch error:", error);
        res.status(500).json({ success: false, message: "設定の取得に失敗しました" });
    }
});

router.put("/admin/stocks/settings", requireAdmin, async (req, res) => {
    try {
        const current = await stockService.getAdapterConfig();
        const nextConfig = {
            ...current,
            display: {
                ...current.display,
                ...(req.body.display || {})
            },
            adapters: Array.isArray(req.body.adapters) ? req.body.adapters : (current.adapters || [])
        };
        const saved = await stockService.saveAdapterConfig(nextConfig);
        res.json({ success: true, config: saved });
    } catch (error) {
        console.error("Stock settings update error:", error);
        res.status(500).json({ success: false, message: "設定の保存に失敗しました" });
    }
});

router.get("/admin/stocks", requireAdmin, async (_req, res) => {
    try {
        const stocks = await stockService.getAllStocks();
        res.json({ success: true, stocks });
    } catch (error) {
        console.error("Stock list error:", error);
        res.status(500).json({ success: false, message: "在庫データの取得に失敗しました" });
    }
});

router.post("/admin/stocks/import", requireAdmin, async (req, res) => {
    if (!req.files || !req.files.stockFile) {
        return res.status(400).json({ success: false, message: "在庫CSVファイルを添付してください" });
    }
    try {
        const file = req.files.stockFile;
        const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
        const adapter = createAdapter({
            id: `csv-upload-${Date.now()}`,
            type: "csv",
            options: {}
        });
        const result = await adapter.run({
            fileBuffer,
            filename: file.name || "",
            userId: req.session.adminName || req.session.adminId || "admin"
        });
        res.json({ success: true, summary: result.summary });
    } catch (error) {
        console.error("Stock import error:", error);
        res.status(500).json({ success: false, message: "在庫取込に失敗しました: " + error.message });
    }
});

router.get("/admin/stocks/template", requireAdmin, async (_req, res) => {
    try {
        const workbook = new excelReader.ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("在庫テンプレート");
        const headers = ["product_code", "total_qty", "warehouse_code", "warehouse_qty", "timestamp", "publish", "hidden_message"];
        const ts = "2025-02-01T09:00:00+09:00";
        sheet.addRow(headers);
        sheet.addRow(["PRD-001", 50, "本社", 30, ts, 1, ""]);
        sheet.addRow(["PRD-001", "", "倉庫", 20, ts, 1, ""]);
        sheet.addRow(["PRD-002", 0, "", 0, ts, 0, "仕入先直送"]);
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="stock_template.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error("Stock template error:", err);
        res.status(500).json({ success: false, message: "テンプレートの生成に失敗しました" });
    }
});

router.post("/admin/kaitori/parse-excel", requireAdmin, async (req, res) => {
    if (!req.files || !req.files.excelFile) {
        return res.status(400).json({ success: false, message: "Excelファイルを選択してください" });
    }
    try {
        const buf = Buffer.isBuffer(req.files.excelFile.data) ? req.files.excelFile.data : Buffer.from(req.files.excelFile.data || []);
        const data = await excelReader.readToObjects(buf, { defval: "" });
        res.json({ success: true, data });
    } catch (err) {
        console.error("Kaitori parse-excel error:", err);
        res.status(500).json({ success: false, message: "Excelの読み込みに失敗しました: " + (err.message || "") });
    }
});

router.get("/admin/stocks/history", requireAdmin, async (_req, res) => {
    try {
        const history = await stockService.getHistory(100);
        res.json({ success: true, history });
    } catch (error) {
        console.error("Stock history error:", error);
        res.status(500).json({ success: false, message: "履歴の取得に失敗しました" });
    }
});

router.post("/admin/stocks/manual-adjust", requireAdmin, async (req, res) => {
    const payload = req.body || {};
    if (!payload.productCode) {
        return res.status(400).json({ success: false, message: "商品コードは必須です" });
    }
    try {
        await stockService.saveStock({
            productCode: payload.productCode,
            totalQty: Number(payload.totalQty) || 0,
            reservedQty: Number(payload.reservedQty) || 0,
            warehouses: Array.isArray(payload.warehouses) ? payload.warehouses : [],
            publish: payload.publish !== undefined ? !!payload.publish : true,
            hiddenMessage: payload.hiddenMessage || "",
            manualLock: !!payload.manualLock,
            source: "manual-adjust",
            note: payload.note || ""
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Manual adjust error:", error);
        res.status(500).json({ success: false, message: "在庫の更新に失敗しました" });
    }
});

router.post("/admin/stocks/manual-reserve", requireAdmin, async (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "対象データがありません" });
    }
    try {
        await stockService.reserve(items, {
            userId: req.session.adminName || req.session.adminId || "admin",
            silent: true
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Manual reserve error:", error);
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post("/admin/stocks/manual-release", requireAdmin, async (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "対象データがありません" });
    }
    try {
        await stockService.release(items, {
            userId: req.session.adminName || req.session.adminId || "admin"
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Manual release error:", error);
        res.status(500).json({ success: false, message: "在庫の戻し処理に失敗しました" });
    }
});

router.get("/admin/stocks/:productCode", requireAdmin, async (req, res) => {
    try {
        const stock = await stockService.getStock(req.params.productCode);
        if (!stock) {
            return res.status(404).json({ success: false, message: "在庫データが見つかりません" });
        }
        res.json({ success: true, stock });
    } catch (error) {
        console.error("Single stock fetch error:", error);
        res.status(500).json({ success: false, message: "取得に失敗しました" });
    }
});

module.exports = router;
