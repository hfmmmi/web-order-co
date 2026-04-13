"use strict";

const express = require("express");
const router = express.Router();
const priceService = require("../../services/priceService");
const settingsService = require("../../services/settingsService");
const { requireAdmin } = require("./requireAdmin");

/** :rank を英大文字1文字以上に正規化（分岐計測・短絡評価の取りこぼしを避ける） */
function normalizeDownloadRankParam(rankParam) {
    const raw = rankParam == null ? "" : String(rankParam);
    const letters = raw.toUpperCase().replace(/[^A-Z]/g, "");
    return letters || "A";
}

router.post("/admin/save-rank-prices", requireAdmin, async (req, res) => {
    try {
        await priceService.saveRankPrices(req.body);
        res.json({ success: true, message: "ランク価格を保存しました" });
    } catch (e) { res.status(500).json({ message: "保存失敗" }); }
});

router.get("/admin/rank-prices-list", requireAdmin, async (req, res) => {
    try {
        const result = await priceService.getRankPrices();
        res.json(result);
    } catch (e) { res.status(500).json({ message: "取得失敗" }); }
});

router.get("/admin/rank-list", requireAdmin, async (req, res) => {
    try {
        const list = await settingsService.getRankList();
        res.json(list);
    } catch (e) { res.status(500).json({ message: "取得失敗" }); }
});

router.get("/admin/customer-price-list", requireAdmin, async (req, res) => {
    try {
        const result = await priceService.getCustomerPriceList(req.query.customerId);
        res.json(result);
    } catch (e) { res.json([]); }
});

router.get("/admin/special-prices-list", requireAdmin, async (req, res) => {
    try {
        const result = await priceService.getAllSpecialPrices();
        res.json(result);
    } catch (e) { res.status(500).json({ message: "取得失敗" }); }
});

router.get("/admin/download-pricelist-by-rank/:rank", requireAdmin, async (req, res) => {
    try {
        const rank = normalizeDownloadRankParam(req.params.rank);
        const { csv, filename } = await priceService.getPricelistCsvForRank(rank);
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
        res.send(csv);
    } catch (e) {
        console.error("Rank pricelist download error:", e);
        res.status(500).send("価格表の生成に失敗しました");
    }
});

router.get("/admin/download-pricelist-excel-by-rank/:rank", requireAdmin, async (req, res) => {
    try {
        const rank = normalizeDownloadRankParam(req.params.rank);
        const { buffer, filename } = await priceService.getPricelistExcelForRank(rank);
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
        res.send(buffer);
    } catch (e) {
        console.error("Rank pricelist Excel download error:", e);
        res.status(500).send("価格表の生成に失敗しました");
    }
});

module.exports = router;
module.exports.normalizeDownloadRankParam = normalizeDownloadRankParam;
