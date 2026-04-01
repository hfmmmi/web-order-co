/**
 * passwordResetRequestService.requestPasswordReset の分岐
 */
"use strict";

const fs = require("fs").promises;
const { requestPasswordReset, safeMessage } = require("../../services/passwordResetRequestService");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const RATE_PATH = dbPath("reset_rate_limit.json");

describe("Aランク: passwordResetRequestService", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        jest.restoreAllMocks();
    });

    test("rawId が非文字列なら safeMessage", async () => {
        const r = await requestPasswordReset({ rawId: 123, clientIp: "127.0.0.1", protocol: "http", host: "localhost" });
        expect(r.success).toBe(true);
        expect(r.message).toBe(safeMessage);
    });

    test("trim 後空なら safeMessage", async () => {
        const r = await requestPasswordReset({ rawId: "   ", clientIp: "127.0.0.1", protocol: "http", host: "localhost" });
        expect(r.message).toBe(safeMessage);
    });

    test("顧客が見つかりメール送信失敗時はトークンを削除する", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValueOnce({ success: false, message: "smtp" });
        const r = await requestPasswordReset({
            rawId: "TEST001",
            clientIp: "10.0.0.1",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        const raw = await fs.readFile(dbPath("reset_tokens.json"), "utf-8");
        const tokens = JSON.parse(raw);
        expect(tokens.TEST001).toBeUndefined();
    });

    test("同一 IP でレート制限超過時も safeMessage", async () => {
        await fs.writeFile(RATE_PATH, JSON.stringify({ "192.168.99.99": [1, 2, 3, 4, 5].map((i) => Date.now() - i * 1000) }, null, 2), "utf-8");
        const r = await requestPasswordReset({
            rawId: "NOBODY",
            clientIp: "192.168.99.99",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
    });

    test("管理者メールは supportNotifyTo フォールバックで送る", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValue({ success: true });
        await settingsService.updateSettings({ mail: { supportNotifyTo: "fallback-support@test" } });
        const admins = JSON.parse(await fs.readFile(dbPath("admins.json"), "utf-8"));
        const a0 = admins[0];
        const prevEmail = a0.email;
        a0.email = "";
        await fs.writeFile(dbPath("admins.json"), JSON.stringify(admins, null, 2), "utf-8");
        const r = await requestPasswordReset({
            rawId: a0.adminId,
            clientIp: "10.0.0.2",
            protocol: "https",
            host: "example.com"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
        a0.email = prevEmail;
        await fs.writeFile(dbPath("admins.json"), JSON.stringify(admins, null, 2), "utf-8");
        await settingsService.updateSettings({ mail: { supportNotifyTo: "" } });
    });

    test("メールアドレス入力で顧客を解決してリセットメールを送る", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValue({ success: true });
        const r = await requestPasswordReset({
            rawId: "test001@example.com",
            clientIp: "10.0.0.44",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
    });

    test("管理者宛メール送信失敗時は admin_reset_tokens からトークンを削除する", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValueOnce({ success: false, message: "smtp admin" });
        const admins = JSON.parse(await fs.readFile(dbPath("admins.json"), "utf-8"));
        const a0 = admins[0];
        await fs.writeFile(
            dbPath("admins.json"),
            JSON.stringify([{ ...a0, email: "adminonly@test.com" }], null, 2),
            "utf-8"
        );
        const r = await requestPasswordReset({
            rawId: a0.adminId,
            clientIp: "10.0.0.55",
            protocol: "https",
            host: "adm.example.com"
        });
        expect(r.success).toBe(true);
        const raw = await fs.readFile(dbPath("admin_reset_tokens.json"), "utf-8");
        const tokens = JSON.parse(raw);
        expect(tokens[a0.adminId]).toBeUndefined();
    });

    test("顧客一覧読込で例外が出ても外側で握りつぶして safeMessage", async () => {
        const origRead = fs.readFile.bind(fs);
        jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("customers.json")) {
                throw new Error("customers read boom");
            }
            return origRead(p, enc);
        });
        const r = await requestPasswordReset({
            rawId: "TEST001",
            clientIp: "10.0.0.66",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
    });

    test("admins.json が配列でない場合も管理者検索を続行する", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValue({ success: true });
        await fs.writeFile(dbPath("admins.json"), JSON.stringify({ notArray: true }, null, 2), "utf-8");
        const r = await requestPasswordReset({
            rawId: "test-admin",
            clientIp: "10.0.0.77",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
    });
});
