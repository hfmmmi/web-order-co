/**
 * ステップ3: 負荷試験スクリプト・PERF_LOG の動作検証
 * - 閾値超過時に exit 1
 * - 結果記録のフォーマット
 * - PERF_LOG 閾値超過時のログ出力
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData
} = require("../helpers/testSandbox");

function runLoadTest(env = {}) {
    return new Promise((resolve) => {
        const child = spawn("node", ["scripts/load-test.js", "http://127.0.0.1:3999"], {
            cwd: path.join(__dirname, "../.."),
            env: { ...process.env, NODE_ENV: "test", PORT: "3999", ...env }
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b) => { stdout += b.toString(); });
        child.stderr.on("data", (b) => { stderr += b.toString(); });
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

describe("Bランク: ステップ3 負荷試験・PERF_LOG", () => {
    let backup;
    let server;
    const LOAD_TEST_DURATION = 1;
    const TEST_PORT = 3999;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        process.env.PORT = String(TEST_PORT);
        process.env.NODE_ENV = "test";
        jest.resetModules();
        const { startServer } = require("../../server");
        server = startServer();
        await new Promise((r) => server.on("listening", r));
    });

    afterEach((done) => {
        if (server) server.close(done);
    });

    test("閾値超過時は exit code 1 で終了する", async () => {
        const { code } = await runLoadTest({
            LOAD_TEST_P99_THRESHOLD_MS: "0",
            LOAD_TEST_SKIP_RECORD: "true",
            LOAD_TEST_DURATION: String(LOAD_TEST_DURATION)
        });
        expect(code).toBe(1);
    }, 30000);

    test("結果記録は期待フォーマットで追記される", async () => {
        const tmpPath = path.join(os.tmpdir(), `load-test-results-${Date.now()}.md`);
        const { code } = await runLoadTest({
            LOAD_TEST_SKIP_THRESHOLD: "true",
            LOAD_TEST_RESULTS_PATH: tmpPath,
            LOAD_TEST_DURATION: String(LOAD_TEST_DURATION)
        });
        expect(code).toBe(0);

        const content = fs.readFileSync(tmpPath, "utf-8");
        expect(content).toMatch(/^\#\s+負荷試験結果ログ|^##\s+\d{4}-\d{2}-\d{2}T/);
        expect(content).toMatch(/\|\s*API\s*\|\s*requests\s*\|\s*avg\s*\|\s*p99\s*\|\s*errors\s*\|/);
        expect(content).toMatch(/settings\/public|login/);
        try { fs.unlinkSync(tmpPath); } catch (_) {}
    }, 30000);
});

describe("Bランク: ステップ3 PERF_LOG 閾値超過", () => {
    let backup;
    let envBackup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        envBackup = { ...process.env };
        process.env.ENABLE_PERF_LOG = "true";
        process.env.PERF_LOG_THRESHOLD_MS = "50";
        jest.resetModules();
    });

    afterEach(() => {
        process.env = envBackup;
    });

    test("閾値超過時に [PERF] ログが出力される", async () => {
        const request = require("supertest");
        const { app } = require("../../server");
        app.get("/test-perf-slow", (req, res) => {
            setTimeout(() => res.json({}), 80);
        });

        const logSpy = jest.spyOn(console, "log").mockImplementation();

        await request(app).get("/test-perf-slow");

        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[PERF\].*\d+ms$/));
        logSpy.mockRestore();
    });
});
