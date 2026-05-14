// 環境変数を .env から読み込む（dotenv がインストールされていれば）
try {
    require("dotenv").config();
} catch (e) {
    // dotenv 未インストール時はスキップ（要 npm install）
}

const express = require("express");
const path = require("path");
const fileUpload = require("express-fileupload");
const stockPoller = require("./jobs/stockPoller");
const { applyHelmetIfAvailable } = require("./middlewares/helmetIfAvailable");
const { createCorsAllowlistMiddleware } = require("./middlewares/corsAllowlist");
const { createSessionMiddleware } = require("./middlewares/sessionMiddleware");
const { createSlidingSessionTimeoutMiddleware } = require("./middlewares/slidingSessionTimeout");
const { createResponseTimeMiddleware } = require("./middlewares/responseTime");

const app = express();
const port = process.env.PORT || 3000;

const trustProxyEnv = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
const trustProxyEnabled = trustProxyEnv === "1" || trustProxyEnv === "true";
if (trustProxyEnabled) {
    app.set("trust proxy", 1);
}

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

applyHelmetIfAvailable(app);
app.use(createCorsAllowlistMiddleware(allowedOrigins));
app.use(createSessionMiddleware());
app.use(createSlidingSessionTimeoutMiddleware({}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: false
}));

// 旧「お知らせ」専用ページはメイン（商品一覧）へ統合済み
app.get(["/announcements.html", "/announcements"], (req, res) => {
    res.redirect(302, "/home.html");
});

app.use(express.static(path.join(__dirname, "public")));
app.use(createResponseTimeMiddleware());

app.use("/api", require("./routes/auth-api"));
app.use("/api", require("./routes/admin-api"));
app.use("/api/integration", require("./routes/integration-api"));

app.use("/", require("./routes/products-api"));
app.use("/", require("./routes/orders-api"));
app.use("/", require("./routes/kaitori-api"));
app.use("/", require("./routes/support-api"));

function startServer() {
    return app.listen(port, () => {
        console.log(`サーバー起動しました。 http://localhost:${port}`);
        console.log("FLAM連携機能: 準備完了");
        const erpKey = String(process.env.ERP_SYNC_API_KEY || "").trim();
        if (erpKey) {
            console.log("販管連携 API (/api/integration/*): 有効（ERP_SYNC_API_KEY 設定済み）");
        } else {
            console.warn("販管連携 API (/api/integration/*): 無効 — ERP_SYNC_API_KEY 未設定のため 503 になります");
        }
        stockPoller.start().catch(err => console.error("[StockPoller] 起動失敗:", err));
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
