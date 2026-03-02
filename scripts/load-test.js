/**
 * 負荷試験: 代表API 2-3本に対する応答時間・スループット測定
 * 事前にサーバーを起動してください: npm start （別ターミナル）
 * 用法: node scripts/load-test.js [baseUrl]
 * 例: node scripts/load-test.js
 *     node scripts/load-test.js http://localhost:3000
 *
 * 環境変数:
 *   LOAD_TEST_SKIP_RECORD=true  … 結果記録をスキップ
 *   LOAD_TEST_SKIP_THRESHOLD=true … 閾値アサーションをスキップ
 *   LOAD_TEST_P99_THRESHOLD_MS=N … p99閾値(ms)。未設定時は500
 *   LOAD_TEST_RESULTS_PATH=path  … 結果記録先。未設定時は docs/load-test-results.md
 *   LOAD_TEST_DURATION=N        … 測定秒数。未設定時は5
 */
const autocannon = require("autocannon");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const DURATION = process.env.LOAD_TEST_DURATION != null ? Number(process.env.LOAD_TEST_DURATION) : 5;
const CONNECTIONS = 10;
const P99_THRESHOLD_MS = process.env.LOAD_TEST_P99_THRESHOLD_MS != null
    ? Number(process.env.LOAD_TEST_P99_THRESHOLD_MS)
    : 500;
const RESULTS_PATH = process.env.LOAD_TEST_RESULTS_PATH || path.join(__dirname, "../docs/load-test-results.md");
const SKIP_RECORD = String(process.env.LOAD_TEST_SKIP_RECORD || "").toLowerCase() === "true";
const SKIP_THRESHOLD = String(process.env.LOAD_TEST_SKIP_THRESHOLD || "").toLowerCase() === "true";

const TARGETS = [
    {
        name: "GET /api/settings/public",
        url: `${BASE}/api/settings/public`,
        opts: { method: "GET", duration: DURATION, connections: CONNECTIONS }
    },
    {
        name: "POST /api/login (認証負荷)",
        url: `${BASE}/api/login`,
        opts: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: "loadtest", pass: "x" }),
            duration: DURATION,
            connections: CONNECTIONS
        }
    }
];

async function runOne(target) {
    return new Promise((resolve, reject) => {
        const instance = autocannon({
            url: target.url,
            ...target.opts
        }, (err, result) => {
            if (err) return reject(err);
            resolve({ name: target.name, result });
        });
        autocannon.track(instance, { renderProgressBar: true });
    });
}

function appendResult(results) {
    if (SKIP_RECORD) return;
    const dir = path.dirname(RESULTS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const header = `## ${new Date().toISOString()}\n`;
    const rows = results.map((r) => {
        const p99 = (r.result.latency.p99 / 1000).toFixed(2);
        return `| ${r.name} | ${r.result.requests.total} | ${(r.result.latency.mean / 1000).toFixed(2)}ms | ${p99}ms | ${r.result.errors} |`;
    }).join("\n");
    const table = "| API | requests | avg | p99 | errors |\n|-----|----------|-----|-----|--------|\n" + rows + "\n\n";
    const existing = fs.existsSync(RESULTS_PATH) ? fs.readFileSync(RESULTS_PATH, "utf-8") : "# 負荷試験結果ログ\n\n";
    fs.writeFileSync(RESULTS_PATH, existing + header + table);
}

async function main() {
    console.log(`\n負荷試験: ${BASE}\n`);
    console.log(`duration=${DURATION}s, connections=${CONNECTIONS}, p99閾値=${P99_THRESHOLD_MS}ms\n`);

    const results = [];
    let thresholdFailed = false;

    for (const target of TARGETS) {
        console.log(`\n--- ${target.name} ---`);
        try {
            const { name, result } = await runOne(target);
            results.push({ name, result });
            const r = result;
            const p99Ms = r.latency.p99 / 1000;
            console.log(`  requests: ${r.requests.total}, latency avg: ${(r.latency.mean / 1000).toFixed(2)}ms, p99: ${p99Ms.toFixed(2)}ms`);
            console.log(`  throughput: ${(r.throughput.total / 1024).toFixed(2)} KB/s, errors: ${r.errors}`);
            if (!SKIP_THRESHOLD && p99Ms > P99_THRESHOLD_MS) {
                console.error(`  ⚠️ p99 ${p99Ms.toFixed(2)}ms > 閾値 ${P99_THRESHOLD_MS}ms`);
                thresholdFailed = true;
            }
        } catch (e) {
            console.error(`  ERROR: ${e.message}`);
            thresholdFailed = true;
        }
    }

    if (results.length > 0) appendResult(results);
    if (!SKIP_RECORD && results.length > 0) console.log(`\n記録: ${RESULTS_PATH}`);

    console.log("\n負荷試験完了\n");
    if (thresholdFailed) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
