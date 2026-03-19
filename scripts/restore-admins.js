// admins.json が壊れた場合の復元用（1件の管理者を作成）
// 実行: node scripts/restore-admins.js
// ログイン: ID = admin / パスワード = Admin123!

const fs = require("fs").promises;
const bcrypt = require("bcryptjs");
const { dbPath } = require("../dbPaths");

async function main() {
    const adminsPath = dbPath("admins.json");
    const hashed = await bcrypt.hash("Admin123!", 10);
    const admins = [
        { adminId: "admin", password: hashed, name: "管理者" }
    ];
    await fs.writeFile(adminsPath, JSON.stringify(admins, null, 2), "utf-8");
    console.log("admins.json を復元しました。ログイン: ID=admin, パスワード=Admin123!");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
