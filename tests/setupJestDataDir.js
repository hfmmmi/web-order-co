/**
 * Jest 実行時にデータディレクトリを必ずテスト用サンドボックスに設定する。
 * 本番の kaitori_master.json / kaitori_requests.json 等をテストで上書きする事故を防ぐ。
 */
const path = require("path");

if (!process.env.DATA_DIR) {
    process.env.DATA_DIR = path.join(__dirname, "_sandbox_data");
}
