/**
 * coverage-summary.json から分岐ギャップが大きいファイルを優先度順に一覧する。
 * 先に npm run coverage:baseline を実行して coverage/coverage-summary.json を生成すること。
 *
 * 用法:
 *   node scripts/coverage-gap-report.js
 *   node scripts/coverage-gap-report.js --summary path/to/coverage-summary.json
 *   node scripts/coverage-gap-report.js --top 40 --out coverage/gap-report.md
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
    let summaryPath = path.join(root, "coverage", "coverage-summary.json");
    let outPath = null;
    let top = 30;
    let minBranchTotal = 0;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--summary" && argv[i + 1]) {
            summaryPath = path.resolve(argv[++i]);
            continue;
        }
        if (a === "--out" && argv[i + 1]) {
            outPath = path.resolve(argv[++i]);
            continue;
        }
        if (a === "--top" && argv[i + 1]) {
            top = Math.max(1, parseInt(argv[++i], 10) || 30);
            continue;
        }
        if (a === "--min-branch-total" && argv[i + 1]) {
            minBranchTotal = Math.max(0, parseInt(argv[++i], 10) || 0);
            continue;
        }
        if (a === "--help" || a === "-h") {
            console.log(`Usage: node scripts/coverage-gap-report.js [options]
  --summary <path>     coverage-summary.json（省略時: coverage/coverage-summary.json）
  --top <n>            表示件数（既定: 30）
  --min-branch-total <n>  分岐総数が n 未満のファイルを除外（ノイズ削減）
  --out <path>         Markdown をファイルへ出力（省略時は標準出力のみ）`);
            process.exit(0);
        }
    }
    return { summaryPath, outPath, top, minBranchTotal };
}

function relDisplay(filePath) {
    const rel = path.relative(root, filePath);
    if (rel && !rel.startsWith("..")) {
        return rel.split(path.sep).join("/");
    }
    return filePath.split(path.sep).join("/");
}

function branchRow(key, entry) {
    const b = entry.branches;
    if (!b || typeof b.total !== "number") {
        return null;
    }
    const total = b.total;
    const covered = typeof b.covered === "number" ? b.covered : 0;
    const skipped = typeof b.skipped === "number" ? b.skipped : 0;
    const pct = typeof b.pct === "number" ? b.pct : total > 0 ? (covered / total) * 100 : 100;
    // istanbul の分岐: 未ヒット数の目安（total に対する covered の差）
    const missed = Math.max(0, total - covered);
    return { key, total, covered, skipped, pct, missed };
}

function main() {
    const { summaryPath, outPath, top, minBranchTotal } = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(summaryPath)) {
        console.error(
            `[coverage-gap-report] 見つかりません: ${summaryPath}\n先に npm run coverage:baseline を実行してください。`
        );
        process.exit(1);
    }

    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    } catch (e) {
        console.error("[coverage-gap-report] JSON の読み込みに失敗しました:", e.message);
        process.exit(1);
    }

    const rows = [];
    for (const key of Object.keys(raw)) {
        if (key === "total") {
            continue;
        }
        const r = branchRow(key, raw[key]);
        if (!r || r.total < minBranchTotal) {
            continue;
        }
        rows.push(r);
    }

    // 未充足分岐数が多い順。同率なら分岐総数が大きい順、次に分岐％が低い順
    rows.sort((a, b) => {
        if (b.missed !== a.missed) {
            return b.missed - a.missed;
        }
        if (b.total !== a.total) {
            return b.total - a.total;
        }
        return a.pct - b.pct;
    });

    const totalEntry = raw.total && raw.total.branches ? raw.total.branches : null;
    const globalLine =
        totalEntry && typeof totalEntry.pct === "number"
            ? `全体分岐: **${totalEntry.pct}%**（covered ${totalEntry.covered ?? "?"} / total ${totalEntry.total ?? "?"}）\n\n`
            : "";

    const header = `# 分岐ギャップ優先度レポート（自動生成）

生成元: \`${relDisplay(summaryPath)}\`

${globalLine}並び順: **未充足分岐数（missed）** の多い順（同率は分岐総数・分岐％でタイブレーク）。

| 優先 | ファイル | 分岐% | 分岐総数 | 未充足 |
|------|----------|-------|----------|--------|
`;

    const lines = [header];
    const slice = rows.slice(0, top);
    slice.forEach((r, i) => {
        const name = relDisplay(r.key);
        const pct = typeof r.pct === "number" ? r.pct.toFixed(2) : String(r.pct);
        lines.push(`| ${i + 1} | \`${name}\` | ${pct} | ${r.total} | ${r.missed} |\n`);
    });

    lines.push(`
## 使い方メモ

1. \`lcov-report\` で該当ファイルを開き、赤い分岐を確認する。
2. 分岐の「種類」（正常系の else / catch・権限エラー / バリデーション / 文字列・日付・CSV 列フォールバック等）を \`docs/branch-coverage-90-phase2-gap-analysis.md\` のチェックリストに照らす。
3. API で足りるかユニットで足りるかを決め、テストを追加する。
`);

    const md = lines.join("");

    if (outPath) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, md, "utf8");
        console.error(`[coverage-gap-report] 書き出しました: ${relDisplay(outPath)}`);
    } else {
        process.stdout.write(md);
    }
}

main();
