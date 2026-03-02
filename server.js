// 環境変数を .env から読み込む（dotenv がインストールされていれば）
try {
    require("dotenv").config();
} catch (e) {
    // dotenv 未インストール時はスキップ（要 npm install）
}

const express = require("express");
const path = require("path");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
// ★復活: ファイルアップロード用ミドルウェア (これが無いと req.files が空になります)
const fileUpload = require("express-fileupload");
const stockPoller = require("./jobs/stockPoller");

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const isWindowsDev = process.platform === "win32" && !isProduction && !isTest;
const trustProxyEnv = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
const trustProxyEnabled = trustProxyEnv === "1" || trustProxyEnv === "true";
if (trustProxyEnabled) {
    app.set("trust proxy", 1);
}

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

// 0. セキュリティヘッダー（helmet がインストールされていれば）
// CSP: 段階的に有効化。default-src 'self' で同一オリジン中心に制限。reCAPTCHA 用に Google を許可。
// 将来: インラインスクリプト・onclick を nonce や hash に移行すれば 'unsafe-inline' を外せる。
try {
    const helmet = require("helmet");
    app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'", "'unsafe-inline'", "https://www.google.com", "https://www.gstatic.com"],
                "script-src-attr": ["'unsafe-inline'"],
                "style-src": ["'self'", "'unsafe-inline'"],
                "frame-src": ["'self'", "https://www.google.com", "https://www.recaptcha.net"],
                "img-src": ["'self'", "data:"],
                "connect-src": ["'self'"],
                "font-src": ["'self'"],
                "base-uri": ["'self'"],
                "form-action": ["'self'"]
            }
        }
    }));
} catch (e) {
    // helmet 未インストール時はスキップ（要 npm install）
}

// CORS: デフォルトは同一オリジンのみ。必要時のみ ALLOWED_ORIGINS で許可リストを有効化。
if (allowedOrigins.length > 0) {
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (!origin) {
            return next();
        }
        if (allowedOrigins.includes(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
            if (req.method === "OPTIONS") {
                return res.status(204).end();
            }
            return next();
        }
        return res.status(403).json({ success: false, message: "CORS origin is not allowed" });
    });
}

// 1. セッション設定 (ファイル保存・24時間維持)
// ★本番では必ず環境変数 SESSION_SECRET を設定してください（長いランダム文字列推奨）
const sessionSecret = process.env.SESSION_SECRET || "mySecretKey12345";
if (isProduction && sessionSecret === "mySecretKey12345") {
    console.warn("⚠️ 本番環境では SESSION_SECRET を環境変数で設定してください");
}
// ★Windows環境でのEPERMエラー完全回避設定 (Ultra-Patient Mode)
const sessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "weborder.sid",        // デフォルト名の推測を避ける
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24時間
        httpOnly: true,              // JavaScript から読めない（XSS 対策）
        secure: isProduction,        // 本番では HTTPS 時のみ送信
        sameSite: "lax"              // CSRF の影響を軽減
    }
};

if (!isTest && !isWindowsDev) {
    sessionOptions.store = new FileStore({
        path: "./sessions",
        logFn: function(){},      // 余計なログは出さない
        retries: 50,              // ★増強: 5回 -> 50回 (絶対に諦めない)
        factor: 1,                // 待機時間の増加率
        minTimeout: 100,          // ★増強: 50ms -> 100ms (最低待ち時間)
        maxTimeout: 1000,         // ★増強: 200ms -> 1秒 (最大待ち時間)
        reapInterval: 60 * 60     // 1時間ごとに掃除
    });
}

if (isWindowsDev) {
    console.warn("⚠️ Windows開発環境のためメモリセッションを使用します（EPERM回避）");
}

app.use(session(sessionOptions));

// ==========================================
// ★追加: 120分無操作 自動ログアウト監視ミドルウェア (Sliding Expiration)
// ==========================================
app.use((req, res, next) => {
    // ログイン中のユーザーのみ対象
    if (req.session && (req.session.customerId || req.session.isAdmin)) {
        const now = Date.now();
        const twoHours = 120 * 60 * 1000; // 120分
        const lastActivity = req.session.lastActivity || now;

        // 最終操作から120分以上経過していたらアウト
        if (now - lastActivity > twoHours) {
            console.log(`⏳ Session Expired: User ${req.session.customerId || req.session.adminName}`);
            
            // セッションをサーバーから削除
            return req.session.destroy((err) => {
                // フロントエンドに「期限切れ」を通知
                res.status(401).json({ success: false, message: "Session Expired" });
            });
        }

        // セーフなら「最終操作時刻」を現在時刻に更新（スライディング）
        req.session.lastActivity = now;
    }
    next();
});

// 2. データ受信設定 (50MB制限)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ★追加: ファイルアップロードの有効化 (50MB制限, 一時ファイル使用)
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    abortOnLimit: true,
    useTempFiles: false // メモリ内で処理 (EPERM回避のためディスク書き込みを避ける)
}));

// 3. 静的ファイル (publicフォルダ)
app.use(express.static(path.join(__dirname, "public")));

// 3.5. 性能監視（応答時間の測定）※ステップ3
// 代表API: POST /api/login, POST /place-order, GET /products 等を X-Response-Time で監視
const PERF_LOG_ENABLED = String(process.env.ENABLE_PERF_LOG || "").trim().toLowerCase() === "true";
const PERF_LOG_THRESHOLD_MS = Number(process.env.PERF_LOG_THRESHOLD_MS) || 1000;
app.use((req, res, next) => {
    const start = Date.now();
    const origEnd = res.end;
    res.end = function (...args) {
        const ms = Date.now() - start;
        if (!res.headersSent) {
            res.setHeader("X-Response-Time", `${ms}ms`);
        }
        if (PERF_LOG_ENABLED && ms >= PERF_LOG_THRESHOLD_MS) {
            console.log(`[PERF] ${req.method} ${req.originalUrl || req.url} ${ms}ms`);
        }
        return origEnd.apply(this, args);
    };
    next();
});

// 4. ルーティング (各部隊への指令)
// 認証系と管理系APIは /api プレフィックスを維持
app.use("/api", require("./routes/auth-api"));      // 認証 (/api/login 等)
app.use("/api", require("./routes/admin-api"));     // 管理・インポート (/api/admin/...)

// フロントエンドとのURL整合性用ルート
app.use("/", require("./routes/products-api"));  // 商品・価格表
app.use("/", require("./routes/orders-api"));    // 注文・履歴
app.use("/", require("./routes/kaitori-api"));   // 買取
app.use("/", require("./routes/support-api"));   // サポート

function startServer() {
    return app.listen(port, () => {
        console.log(`サーバー起動しました。 http://localhost:${port}`);
        console.log("FLAM連携機能: 準備完了");
        stockPoller.start().catch(err => console.error("[StockPoller] 起動失敗:", err));
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };