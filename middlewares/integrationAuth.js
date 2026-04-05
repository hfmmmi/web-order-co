/**
 * 販管などバックエンド連携用。環境変数 ERP_SYNC_API_KEY と一致する Bearer または X-Integration-Key のみ通す。
 * キー未設定時は 503（本番で誤開放しない）。
 */
function requireIntegrationAuth(req, res, next) {
    const expected = String(process.env.ERP_SYNC_API_KEY || "").trim();
    if (!expected) {
        return res.status(503).json({
            success: false,
            message: "連携APIが無効です（ERP_SYNC_API_KEY が未設定）"
        });
    }

    const authHeader = req.headers.authorization || "";
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader);
    const token = bearer
        ? bearer[1].trim()
        : String(req.headers["x-integration-key"] || "").trim();

    if (!token || token !== expected) {
        return res.status(401).json({ success: false, message: "認証に失敗しました" });
    }

    next();
}

module.exports = { requireIntegrationAuth };
