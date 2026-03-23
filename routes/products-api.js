// routes/products-api.js
// 商品関連API — 顧客向けカタログルータをマウント（パスは従来どおり / 直下）
const express = require("express");
const router = express.Router();

router.use(require("./products/catalogRoutes"));

module.exports = router;
