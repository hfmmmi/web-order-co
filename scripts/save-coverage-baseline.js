/**
 * `npm run coverage:baseline` 実行後に coverage-summary.json を
 * coverage/baselines/ にタイムスタンプ付きで複製する（マイルストーン記録用）。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "coverage", "coverage-summary.json");
const destDir = path.join(root, "coverage", "baselines");

if (!fs.existsSync(src)) {
    console.error(
        "[save-coverage-baseline] coverage/coverage-summary.json がありません。先に npm run coverage:baseline を実行してください。"
    );
    process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(destDir, `coverage-summary-${stamp}.json`);
fs.copyFileSync(src, dest);

let branchPct = null;
try {
    const summary = JSON.parse(fs.readFileSync(dest, "utf8"));
    const t = summary.total;
    if (t && t.branches && typeof t.branches.pct === "number") {
        branchPct = t.branches.pct;
    }
} catch {
    // ignore
}

console.log("[save-coverage-baseline] 保存しました:", dest);
if (branchPct != null) {
    console.log(`[save-coverage-baseline] 全体分岐カバレッジ: ${branchPct}%`);
}
