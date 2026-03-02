const path = require("path");

// データディレクトリのルート
// - 本番サーバーなどで DATA_DIR を指定すれば、そのパス配下の JSON を利用
// - 未指定の場合は、従来どおりプロジェクト直下の JSON を利用
const DATA_ROOT = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : __dirname;

/**
 * 業務データ用 JSON ファイルの絶対パスを返すヘルパー
 * 例: dbPath("customers.json") -> C:\...\web-order\customers.json など
 */
function dbPath(fileName) {
    return path.join(DATA_ROOT, fileName);
}

module.exports = {
    dbPath,
    DATA_ROOT
};
