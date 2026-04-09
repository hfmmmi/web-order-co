"use strict";

const express = require("express");
const router = express.Router();
const productService = require("../../services/productService");
const { requireAdmin } = require("./requireAdmin");

router.post("/add-product", requireAdmin, async (req, res) => {
    try {
        const result = await productService.addProduct(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/admin/products", requireAdmin, async (req, res) => {
    try {
        const data = await productService.getAllProductsForAdmin();
        res.json(data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/update-product", requireAdmin, async (req, res) => {
    try {
        const result = await productService.updateProduct(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/upload-product-data", requireAdmin, async (req, res) => {
    try {
        const result = await productService.importProductCsv(req.body.fileData);
        res.json(result);
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: e.message });
    }
});

router.get("/admin/product-master/template", requireAdmin, async (_req, res) => {
    try {
        const buffer = await productService.getProductTemplateBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="product_master_template.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error("Product master template error:", e);
        res.status(500).json({ success: false, message: "テンプレートの生成に失敗しました" });
    }
});

router.get("/admin/product-master/export", requireAdmin, async (_req, res) => {
    try {
        const buffer = await productService.getProductMasterExportBuffer();
        const filename = `product_master_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer));
    } catch (e) {
        console.error("Product master export error:", e);
        res.status(500).json({ success: false, message: "マスタの出力に失敗しました" });
    }
});

module.exports = router;
