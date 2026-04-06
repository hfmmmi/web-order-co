/**
 * .env が無ければ .env.example をコピーする（初回のみ）。
 */
const fs = require("fs").promises;
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

async function main() {
    try {
        await fs.access(envPath);
        console.log("[setup-env] .env は既にあります。スキップしました。");
        return;
    } catch {
        /* create */
    }
    try {
        await fs.copyFile(examplePath, envPath);
    } catch (e) {
        console.error("[setup-env] コピー失敗:", e.message);
        process.exit(1);
    }
    console.log("[setup-env] .env を .env.example から作成しました。");
    console.log("[setup-env] 販売管理と連携する場合は ERP_SYNC_API_KEY を設定し、sales-mgmt の .env と同じ値にしてください。");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
