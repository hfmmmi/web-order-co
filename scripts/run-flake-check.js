/**
 * flake監視: APIテスト（およびオプションでE2E）を複数回実行し、不安定（flaky）テストを検出する
 * 用法: node scripts/run-flake-check.js [repeatCount]
 *       node scripts/run-flake-check.js 3 --e2e  … E2Eも含めて3回実行
 * 既定: 3回実行。失敗パターンが run 間で異なれば flaky と判定
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const e2eIndex = args.indexOf("--e2e");
const withE2e = e2eIndex >= 0;
if (withE2e) args.splice(e2eIndex, 1);
const REPEAT = parseInt(args[0], 10) || 3;
const FLAKE_LOG_PATH = path.join(__dirname, "../docs/flake-log.md");

function runJest() {
    const cmd = withE2e ? "test:all" : "test:api";
    return new Promise((resolve) => {
        const child = spawn("npm", ["run", cmd], {
            shell: true,
            env: { ...process.env, CI: "" }
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b) => { stdout += b.toString(); process.stdout.write(b); });
        child.stderr.on("data", (b) => { stderr += b.toString(); process.stderr.write(b); });
        child.on("close", (code) => {
            resolve({
                code: code == null ? 1 : code,
                output: stdout + stderr,
                failedSuites: parseFailedSuites(stdout + stderr)
            });
        });
    });
}

function parseFailedSuites(output) {
    const lines = output.split(/\r?\n/);
    const failed = [];
    for (const line of lines) {
        const t = line.trim();
        if (t.startsWith("FAIL ")) {
            failed.push(t.replace(/^FAIL\s+/, "").trim());
        }
    }
    return [...new Set(failed)];
}

function appendFlakeLog(flaky, runResults) {
    const dir = path.dirname(FLAKE_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const header = `## ${new Date().toISOString()} - flake検出\n`;
    const body = flaky.length > 0
        ? `不安定と判定されたスイート:\n${flaky.map((s) => `- ${s}`).join("\n")}\n\n`
        : "検出なし\n\n";
    const runs = runResults.map((r, i) => `- Run ${i + 1}: ${r.code === 0 ? "PASS" : "FAIL"} ${r.failedSuites.length ? `(${r.failedSuites.join(", ")})` : ""}`).join("\n");
    const entry = header + body + "実行結果:\n" + runs + "\n\n---\n\n";
    const existing = fs.existsSync(FLAKE_LOG_PATH) ? fs.readFileSync(FLAKE_LOG_PATH, "utf-8") : "# Flake監視ログ\n\n";
    fs.writeFileSync(FLAKE_LOG_PATH, existing + entry);
}

async function main() {
    const target = withE2e ? "API + E2E" : "API";
    console.log(`\nflake監視: ${target} テストを ${REPEAT} 回実行します...\n`);

    const runResults = [];
    for (let i = 0; i < REPEAT; i++) {
        console.log(`\n--- Run ${i + 1}/${REPEAT} ---\n`);
        const result = await runJest();
        runResults.push(result);
    }

    const allFailed = new Set();
    const anyFailed = new Set();
    for (const r of runResults) {
        for (const s of r.failedSuites) anyFailed.add(s);
        if (r.code !== 0) {
            for (const s of r.failedSuites) allFailed.add(s);
        }
    }

    // 全 run で失敗したスイート = 確実な失敗
    // 一部の run でのみ失敗 = flaky
    const flaky = [...anyFailed].filter((s) => !allFailed.has(s) || runResults.some((r) => r.code === 0));

    const hasInconsistent = runResults.some((r) => r.code !== 0) && runResults.some((r) => r.code === 0);
    const flakySuites = hasInconsistent ? [...anyFailed] : [...anyFailed].filter((s) => {
        const failCount = runResults.filter((r) => r.failedSuites.includes(s)).length;
        return failCount > 0 && failCount < REPEAT;
    });

    console.log("\n======================================");
    console.log("flake監視 サマリー");
    console.log("======================================");
    console.log(`実行回数: ${REPEAT}`);
    const passCount = runResults.filter((r) => r.code === 0).length;
    console.log(`PASS回数: ${passCount}/${REPEAT}`);
    if (flakySuites.length > 0) {
        console.log("\n⚠️ 不安定（flaky）と判定されたスイート:");
        flakySuites.forEach((s) => console.log(`  - ${s}`));
        appendFlakeLog(flakySuites, runResults);
        console.log(`\n記録: ${FLAKE_LOG_PATH}`);
    } else if (passCount < REPEAT) {
        console.log("\n全 run で一貫して失敗したスイート（flaky ではなく確実な失敗）:");
        [...allFailed].forEach((s) => console.log(`  - ${s}`));
    } else {
        console.log("\n全 run PASS: flaky なし");
    }

    process.exit(passCount === REPEAT ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
