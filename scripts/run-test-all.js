const { spawn } = require("child_process");
const http = require("http");

const STEPS = [
    { key: "API", label: "API（S+A+B+Risk・カバレッジ付き）", command: "npm", args: ["run", "test:api"] },
    { key: "E2E", label: "E2E", command: "npm", args: ["run", "test:e2e"] },
    {
        key: "LOAD",
        label: "負荷試験",
        command: "npm",
        args: ["run", "test:load"],
        needsServer: true
    },
    { key: "FLAKE", label: "flake監視", command: "npm", args: ["run", "test:flake"] }
];

function parseFailures(output) {
    const lines = output.split(/\r?\n/);
    const failedSuites = [];
    const failedTests = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("FAIL ")) {
            // 例: FAIL tests/s-rank/foo.test.js
            failedSuites.push(trimmed.replace(/^FAIL\s+/, ""));
            continue;
        }
        // E2E の失敗行(例): 1) tests/e2e/specs/foo.spec.js:...
        if (/^\d+\)\s+tests\/|^\d+\)\s+tests\\/.test(trimmed)) {
            failedTests.push(trimmed);
        }
    }

    return {
        failedSuites: [...new Set(failedSuites)],
        failedTests: [...new Set(failedTests)]
    };
}

function parseCoverage(output) {
    const lines = output.split(/\r?\n/);
    const coverage = {
        global: null,
        files: {}
    };

    // Jest カバレッジテーブルのヘッダー行を探す
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // テーブル開始（File | % Stmts | % Branch | ...）
        if (line.includes("File") && (line.includes("% Stmts") || line.includes("Stmts")) && (line.includes("% Branch") || line.includes("Branch"))) {
            inTable = true;
            continue;
        }
        
        // テーブル終了（区切り行または空行）
        if (inTable && (line.match(/^-+[\|\s-]*$/) || (line === "" && coverage.global))) {
            if (coverage.global) break; // All files が見つかったら終了
            continue;
        }
        
        if (!inTable) continue;
        
        // All files 行を解析（パイプ区切りまたはスペース区切り）
        if (line.startsWith("All files")) {
            // パイプ区切り: All files | 87.39 | 69.16 | 92.56 | 89.58
            let match = line.match(/All files\s*\|?\s*([\d.]+)\s*\|?\s*([\d.]+)\s*\|?\s*([\d.]+)\s*\|?\s*([\d.]+)/);
            if (!match) {
                // スペース区切り: All files    87.39    69.16    92.56    89.58
                match = line.match(/All files\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
            }
            if (match) {
                coverage.global = {
                    statements: parseFloat(match[1]),
                    branches: parseFloat(match[2]),
                    functions: parseFloat(match[3]),
                    lines: parseFloat(match[4])
                };
            }
            continue;
        }
        
        // 個別ファイル行を解析（例: routes/auth-api.js | 83.72 | 68.77 | ...）
        // パイプ区切りを優先
        if (line.includes("|")) {
            const parts = line.split(/\s*\|\s*/).filter(p => p.trim());
            if (parts.length >= 5) {
                const filePath = parts[0].trim();
                // 数値部分を抽出（%記号を除去）
                const nums = parts.slice(1, 5).map(p => {
                    const cleaned = p.replace(/%/g, "").trim();
                    return parseFloat(cleaned);
                });
                if (nums.every(n => !isNaN(n))) {
                    coverage.files[filePath] = {
                        statements: nums[0],
                        branches: nums[1],
                        functions: nums[2],
                        lines: nums[3]
                    };
                }
            }
        } else {
            // スペース区切りの場合（例: routes/auth-api.js    83.72    68.77    80.3    85.12）
            // ファイルパスは複数単語を含む可能性があるため、最後の4つの数値を見つける
            const numMatches = line.match(/([\d.]+)/g);
            if (numMatches && numMatches.length >= 4) {
                const nums = numMatches.slice(-4).map(n => parseFloat(n));
                // ファイルパスは数値の前の部分
                const filePathMatch = line.match(/^(.+?)(?:\s+[\d.]+){4}/);
                if (filePathMatch && nums.every(n => !isNaN(n))) {
                    const filePath = filePathMatch[1].trim();
                    coverage.files[filePath] = {
                        statements: nums[0],
                        branches: nums[1],
                        functions: nums[2],
                        lines: nums[3]
                    };
                }
            }
        }
    }

    return coverage;
}

function waitForServer(url, timeoutMs = 30000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        function attempt() {
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`サーバーが ${timeoutMs}ms 以内に起動しませんでした`));
                return;
            }
            const req = http.get(url, (res) => {
                res.resume();
                resolve();
            });
            req.on("error", () => {
                setTimeout(attempt, 500);
            });
        }
        attempt();
    });
}

function startServer() {
    const child = spawn("node", ["server.js"], {
        cwd: require("path").join(__dirname, ".."),
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "test" },
        stdio: "pipe"
    });
    child.stdout.on("data", (d) => process.stdout.write(d));
    child.stderr.on("data", (d) => process.stderr.write(d));
    return child;
}

function runStep(step, serverProcess) {
    return new Promise((resolve) => {
        const child = spawn(step.command, step.args, {
            shell: true,
            env: process.env
        });

        let allOutput = "";

        child.stdout.on("data", (buf) => {
            const s = buf.toString();
            allOutput += s;
            process.stdout.write(s);
        });

        child.stderr.on("data", (buf) => {
            const s = buf.toString();
            allOutput += s;
            process.stderr.write(s);
        });

        child.on("close", (code) => {
            const failures = parseFailures(allOutput);
            const coverage = step.key === "API" ? parseCoverage(allOutput) : null;
            resolve({
                ...step,
                code: code == null ? 1 : code,
                ok: code === 0,
                ...failures,
                coverage
            });
        });
    });
}

function formatDuration(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}秒`;
    return `${minutes}分${seconds}秒`;
}

function formatTimestamp(ms) {
    return new Date(ms).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}

function loadThresholds() {
    try {
        const jestConfig = require("../jest.config.js");
        return jestConfig.coverageThreshold || {};
    } catch (e) {
        return {};
    }
}

function formatCoverageSummary(coverage, thresholds) {
    if (!coverage || !coverage.global) return "";

    const global = coverage.global;
    const globalThreshold = thresholds.global || { lines: 0, branches: 0 };
    
    const linesOk = global.lines >= globalThreshold.lines;
    const branchesOk = global.branches >= globalThreshold.branches;
    
    let summary = "\n【カバレッジ】\n";
    summary += `全体: 行 ${global.lines.toFixed(2)}% (閾値: ${globalThreshold.lines}%) ${linesOk ? "✓" : "✗"}\n`;
    summary += `      分岐 ${global.branches.toFixed(2)}% (閾値: ${globalThreshold.branches}%) ${branchesOk ? "✓" : "✗"}\n`;
    
    // P0ファイルの閾値チェック
    const p0Files = [
        { path: "routes/auth-api.js", name: "auth-api" },
        { path: "routes/orders-api.js", name: "orders-api" },
        { path: "routes/admin-api.js", name: "admin-api" },
        { path: "middlewares/validate.js", name: "validate" },
        { path: "utils/priceCalc.js", name: "priceCalc" }
    ];
    
    const p0Results = [];
    for (const file of p0Files) {
        const fileCoverage = coverage.files[file.path];
        const fileThreshold = thresholds[file.path];
        if (fileCoverage && fileThreshold) {
            const linesOk = fileCoverage.lines >= fileThreshold.lines;
            const branchesOk = fileCoverage.branches >= fileThreshold.branches;
            p0Results.push({
                name: file.name,
                lines: fileCoverage.lines,
                branches: fileCoverage.branches,
                linesThreshold: fileThreshold.lines,
                branchesThreshold: fileThreshold.branches,
                linesOk,
                branchesOk
            });
        }
    }
    
    if (p0Results.length > 0) {
        summary += "\nP0ファイル:\n";
        for (const p0 of p0Results) {
            const linesMark = p0.linesOk ? "✓" : "✗";
            const branchesMark = p0.branchesOk ? "✓" : "✗";
            summary += `  ${p0.name}: 行 ${p0.lines.toFixed(2)}% (${p0.linesThreshold}%) ${linesMark}, `;
            summary += `分岐 ${p0.branches.toFixed(2)}% (${p0.branchesThreshold}%) ${branchesMark}\n`;
        }
    }
    
    return summary;
}

function printSummary(results, totalMs, startedAt, endedAt) {
    const allPass = results.every((r) => r.ok);
    const thresholds = loadThresholds();

    console.log("\n======================================");
    console.log("テスト最終サマリー");
    console.log("======================================");

    if (typeof startedAt === "number" && !Number.isNaN(startedAt)) {
        console.log(`開始時刻: ${formatTimestamp(startedAt)}`);
    }
    if (typeof endedAt === "number" && !Number.isNaN(endedAt)) {
        console.log(`終了時刻: ${formatTimestamp(endedAt)}`);
    }
    if (typeof totalMs === "number" && !Number.isNaN(totalMs)) {
        console.log(`総実行時間: ${formatDuration(totalMs)}`);
        console.log("");
    }

    for (const r of results) {
        const mark = r.ok ? "PASS" : "FAIL";
        console.log(`[${r.key}] ${r.label}: ${mark}`);
    }

    // APIステップのカバレッジ情報を表示
    const apiResult = results.find((r) => r.key === "API");
    if (apiResult && apiResult.coverage) {
        console.log(formatCoverageSummary(apiResult.coverage, thresholds));
    }

    if (allPass) {
        console.log("\n最終判定: 全テスト PASS");
        return;
    }

    console.log("\n最終判定: FAIL あり");
    console.log("失敗箇所:");

    for (const r of results.filter((x) => !x.ok)) {
        console.log(`- ${r.label} で失敗`);
        if (r.failedSuites.length > 0) {
            for (const suite of r.failedSuites) {
                console.log(`  - FAIL suite: ${suite}`);
            }
        } else {
            console.log("  - 失敗スイート名の抽出なし（上のログを確認）");
        }
        if (r.failedTests.length > 0) {
            for (const test of r.failedTests) {
                console.log(`  - FAIL test: ${test}`);
            }
        }
    }
}

async function main() {
    const startedAt = Date.now();
    const results = [];
    let serverProcess = null;

    for (const step of STEPS) {
        if (step.needsServer) {
            console.log("\n[負荷試験] サーバーを起動中...");
            serverProcess = startServer();
            try {
                await waitForServer("http://127.0.0.1:3000/api/settings/public");
                console.log("[負荷試験] サーバー起動完了\n");
            } catch (e) {
                console.error(`[負荷試験] サーバー起動失敗: ${e.message}`);
                if (serverProcess) serverProcess.kill("SIGTERM");
                results.push({
                    ...step,
                    code: 1,
                    ok: false,
                    failedSuites: [],
                    failedTests: []
                });
                break;
            }
        }

        const result = await runStep(step);
        results.push(result);

        if (step.needsServer && serverProcess) {
            serverProcess.kill("SIGTERM");
            serverProcess = null;
            console.log("\n[負荷試験] サーバー停止\n");
        }

        if (!result.ok) {
            break;
        }
    }

    const endedAt = Date.now();
    const totalMs = endedAt - startedAt;
    printSummary(results, totalMs, startedAt, endedAt);
    const allPass = results.every((r) => r.ok);
    process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
    console.error("test:all 実行中に予期せぬエラー:", err);
    process.exit(1);
});
