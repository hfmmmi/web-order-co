"use strict";

/**
 * 分岐カバレッジ 85% 未満ファイル向けの追加ユニット（loginRateLimit / authAuditLog）
 */
const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const LOGIN_PATH = dbPath("login_rate_limit.json");
const ADMIN_LOG = dbPath("logs/admin-auth.json");
const CUSTOMER_LOG = dbPath("logs/customer-auth.json");

describe("branch 85+: loginRateLimit", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("login_rate_limit.json が配列 JSON のときオブジェクトとして扱われず空に近い動作でロックされない", async () => {
        await fs.writeFile(LOGIN_PATH, "[]", "utf8");
        const ll = require("../../routes/auth/loginRateLimit");
        await expect(ll.isLoginLocked("customer:TEST001")).resolves.toBe(false);
    });

    test("ロック期限切れエントリは isLoginLocked が false になりキーが削除される", async () => {
        await fs.writeFile(
            LOGIN_PATH,
            JSON.stringify({
                "customer:EXPIRED": { lockedUntil: Date.now() - 60_000, attempts: [] }
            }),
            "utf8"
        );
        const ll = require("../../routes/auth/loginRateLimit");
        await expect(ll.isLoginLocked("customer:EXPIRED")).resolves.toBe(false);
        const data = JSON.parse(await fs.readFile(LOGIN_PATH, "utf8"));
        expect(data["customer:EXPIRED"]).toBeUndefined();
    });

    test("recordLoginFailure の6回目は justHitFive が false", async () => {
        await fs.writeFile(LOGIN_PATH, "{}", "utf8");
        const ll = require("../../routes/auth/loginRateLimit");
        const key = "customer:SIXTH";
        for (let i = 0; i < 4; i++) {
            await ll.recordLoginFailure(key);
        }
        const fifth = await ll.recordLoginFailure(key);
        expect(fifth.justHitFive).toBe(true);
        const sixth = await ll.recordLoginFailure(key);
        expect(sixth.justHitFive).toBe(false);
        expect(sixth.locked).toBe(true);
    });

    test("getLoginFailureCount は attempts が配列でなければ 0", async () => {
        await fs.writeFile(
            LOGIN_PATH,
            JSON.stringify({
                "customer:BADATT": { attempts: "not-array" }
            }),
            "utf8"
        );
        const ll = require("../../routes/auth/loginRateLimit");
        await expect(ll.getLoginFailureCount("customer:BADATT")).resolves.toBe(0);
    });

    test("isLoginLocked は空キーなら false（ファイルを読まない）", async () => {
        const ll = require("../../routes/auth/loginRateLimit");
        await expect(ll.isLoginLocked("")).resolves.toBe(false);
    });

    test("recordLoginFailure は attempts 欠損エントリで (entry.attempts || []) 枝を通す", async () => {
        await fs.writeFile(
            LOGIN_PATH,
            JSON.stringify({
                "customer:NO_ATTEMPTS": { lockedUntil: null }
            }),
            "utf8"
        );
        const ll = require("../../routes/auth/loginRateLimit");
        const r = await ll.recordLoginFailure("customer:NO_ATTEMPTS");
        expect(r.locked).toBe(false);
        expect(r.justHitFive).toBe(false);
    });

    test("clearLoginFailures は空キーなら login_rate_limit.json を変更しない", async () => {
        const snapshot = JSON.stringify({ "customer:KEEP": { attempts: [1], lockedUntil: null } }, null, 2);
        await fs.writeFile(LOGIN_PATH, snapshot, "utf8");
        const ll = require("../../routes/auth/loginRateLimit");
        await ll.clearLoginFailures("");
        expect(await fs.readFile(LOGIN_PATH, "utf8")).toBe(snapshot);
    });

    test("getLoginFailureCount は空キーなら 0", async () => {
        const ll = require("../../routes/auth/loginRateLimit");
        await expect(ll.getLoginFailureCount("")).resolves.toBe(0);
    });
});

describe("branch 85+: authAuditLogService", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("appendAdminAuthLog はファイル不存在時も ENOENT で read エラーログを出さず追記できる", async () => {
        await fs.rm(ADMIN_LOG, { force: true });
        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.resetModules();
        const { appendAdminAuthLog } = require("../../services/authAuditLogService");
        await appendAdminAuthLog({ ok: true, adminId: "a1" });
        const readErrCalls = spy.mock.calls.filter((c) => String(c[0]).includes("[admin-auth-log] read error"));
        expect(readErrCalls.length).toBe(0);
        spy.mockRestore();
        const list = JSON.parse(await fs.readFile(ADMIN_LOG, "utf8"));
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBe(1);
    });

    test("appendAdminAuthLog は既存ファイルが壊れた JSON のとき read エラーをログする", async () => {
        await fs.mkdir(path.dirname(ADMIN_LOG), { recursive: true });
        await fs.writeFile(ADMIN_LOG, "{broken", "utf8");
        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.resetModules();
        const { appendAdminAuthLog } = require("../../services/authAuditLogService");
        await appendAdminAuthLog({ ok: false });
        expect(spy.mock.calls.some((c) => String(c[0]).includes("[admin-auth-log] read error"))).toBe(true);
        spy.mockRestore();
    });

    test("appendCustomerAuthLog はファイル不存在でも追記でき ENOENT read ログを出さない", async () => {
        await fs.rm(CUSTOMER_LOG, { force: true });
        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.resetModules();
        const { appendCustomerAuthLog } = require("../../services/authAuditLogService");
        await appendCustomerAuthLog({ ok: true, customerId: "C1" });
        const readErrCalls = spy.mock.calls.filter((c) => String(c[0]).includes("[customer-auth-log] read error"));
        expect(readErrCalls.length).toBe(0);
        spy.mockRestore();
    });
});
