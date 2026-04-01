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
});
