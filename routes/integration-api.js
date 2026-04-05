// 販売管理システム等とのバックエンド連携（セッション不要・ERP_SYNC_API_KEY）
const express = require("express");
const router = express.Router();
const { requireIntegrationAuth } = require("../middlewares/integrationAuth");
const { validateBody } = require("../middlewares/validate");
const orderService = require("../services/orderService");
const customerService = require("../services/customerService");
const productService = require("../services/productService");
const { integrationCustomerPatchSchema } = require("../validators/integrationSchemas");

router.get("/v1/orders", requireIntegrationAuth, async (req, res) => {
    try {
        const result = await orderService.getOrdersSnapshotForIntegration({
            since: req.query.since,
            limit: req.query.limit
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("[integration-api] GET /v1/orders", e);
        res.status(500).json({ success: false, message: "注文スナップショット取得に失敗しました" });
    }
});

router.get("/v1/customers", requireIntegrationAuth, async (req, res) => {
    try {
        const result = await customerService.getCustomersSnapshotForIntegration({
            limit: req.query.limit
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("[integration-api] GET /v1/customers", e);
        res.status(500).json({ success: false, message: "顧客スナップショット取得に失敗しました" });
    }
});

router.get("/v1/products", requireIntegrationAuth, async (req, res) => {
    try {
        const result = await productService.getProductsSnapshotForIntegration({
            limit: req.query.limit,
            activeOnly: req.query.activeOnly
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("[integration-api] GET /v1/products", e);
        res.status(500).json({ success: false, message: "商品スナップショット取得に失敗しました" });
    }
});

router.post(
    "/v1/customers/patch",
    requireIntegrationAuth,
    validateBody(integrationCustomerPatchSchema),
    async (req, res) => {
        try {
            const r = await customerService.applyIntegrationCustomerPatch(req.body);
            if (!r.success) {
                return res.status(400).json(r);
            }
            res.json({ success: true, ...r });
        } catch (e) {
            console.error("[integration-api] POST /v1/customers/patch", e);
            res.status(500).json({ success: false, message: "顧客更新に失敗しました" });
        }
    }
);

module.exports = router;
