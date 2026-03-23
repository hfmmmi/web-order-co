// routes/admin-api.js
// 管理者API — ドメイン別ルータをマウント（パスは従来どおり /api 配下）
const express = require("express");
const router = express.Router();

router.use(require("./admin/settingsRoutes"));
router.use(require("./admin/productsRoutes"));
router.use(require("./admin/customersRoutes"));
router.use(require("./admin/pricesRoutes"));
router.use(require("./admin/ordersRoutes"));
router.use(require("./admin/stocksRoutes"));

module.exports = router;
