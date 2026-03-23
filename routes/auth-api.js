// routes/auth-api.js
// 認証（ログイン）API — 顧客向け・管理者向けルータをマウント（パスは従来どおり /api 配下）
const express = require("express");
const router = express.Router();

router.use(require("./auth/customerSessionRoutes"));
router.use(require("./auth/adminSessionRoutes"));

module.exports = router;
