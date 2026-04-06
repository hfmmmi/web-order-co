/**
 * prestart 用。ERP_SYNC_API_KEY 未設定時は連携 API が 503 になる旨を表示する。
 */
try {
    require("dotenv").config();
} catch (_) {
    /* optional */
}

const k = String(process.env.ERP_SYNC_API_KEY || "").trim();
if (!k) {
    console.warn(
        "[web-order] ERP_SYNC_API_KEY 未設定: /api/integration/* は 503 になります。" +
            " 販売管理と連携する場合は .env に設定してください（sales-mgmt の ERP_SYNC_API_KEY と同一値）。"
    );
} else {
    console.log("[web-order] 販管連携 API: ERP_SYNC_API_KEY 設定済み");
}
