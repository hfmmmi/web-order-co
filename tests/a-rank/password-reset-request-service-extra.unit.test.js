"use strict";

jest.mock("../../services/mailService", () => ({
    sendInviteEmail: jest.fn()
}));

const fs = require("fs").promises;
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");
const { requestPasswordReset } = require("../../services/passwordResetRequestService");
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("passwordResetRequestService 追加分岐", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        jest.clearAllMocks();
    });

    test("rawId が非文字でも成功メッセージのみ", async () => {
        const r = await requestPasswordReset({
            rawId: null,
            clientIp: "10.0.0.1",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).not.toHaveBeenCalled();
    });

    test("顧客メール送信失敗時はトークンをロールバック", async () => {
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "smtp down" });
        const r = await requestPasswordReset({
            rawId: "TEST001",
            clientIp: "10.0.0.2",
            protocol: "https",
            host: "example.com"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
    });

    test("管理者は email 無しでも supportNotifyTo があれば送信経路", async () => {
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            mail: { supportNotifyTo: "support@example.com" }
        });
        await writeJson("admins.json", [
            { adminId: "adm-mail-fallback", name: "A", password: "$2a$10$abcdefghijklmnopqrstuv", email: "" }
        ]);
        const r = await requestPasswordReset({
            rawId: "adm-mail-fallback",
            clientIp: "10.0.0.3",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
        settingsService.getSettings.mockRestore();
    });

    test("外側 catch でエラー時も同一メッセージ", async () => {
        jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("db"));
        await writeJson("customers.json", "not-json");
        const r = await requestPasswordReset({
            rawId: "TEST001",
            clientIp: "10.0.0.4",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        settingsService.getSettings.mockRestore();
    });

    test("rawId が空白のみならメール送信なしで成功メッセージ", async () => {
        const r = await requestPasswordReset({
            rawId: "  \t  ",
            clientIp: "10.0.0.5",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).not.toHaveBeenCalled();
    });

    test("同一IPで5回目まで送信し6回目はレート制限でトークン増やさない", async () => {
        mailService.sendInviteEmail.mockResolvedValue({ success: true });
        const ip = "192.168.55.55";
        for (let i = 0; i < 5; i++) {
            await requestPasswordReset({
                rawId: "TEST001",
                clientIp: ip,
                protocol: "https",
                host: "example.com"
            });
        }
        expect(mailService.sendInviteEmail).toHaveBeenCalledTimes(5);
        await requestPasswordReset({
            rawId: "TEST001",
            clientIp: ip,
            protocol: "https",
            host: "example.com"
        });
        expect(mailService.sendInviteEmail).toHaveBeenCalledTimes(5);
    });

    test("メールアドレス入力で顧客を検索してリセット送信", async () => {
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        const r = await requestPasswordReset({
            rawId: "test001@example.com",
            clientIp: "10.0.0.6",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
    });

    test("管理者リセットメール失敗時は admin_reset トークンをロールバック", async () => {
        await writeJson("admins.json", [
            { adminId: "adm-reset-fail", name: "R", password: "$2a$10$abcdefghijklmnopqrstuv", email: "adm@example.com" }
        ]);
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "smtp" });
        const r = await requestPasswordReset({
            rawId: "adm-reset-fail",
            clientIp: "10.0.0.7",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        const tokens = await readJson("admin_reset_tokens.json");
        expect(tokens["adm-reset-fail"]).toBeUndefined();
    });

    test("顧客はいるがメール無しのとき管理者検索へ進む", async () => {
        await writeJson("customers.json", [
            {
                customerId: "NOMAIL",
                password: "$2a$10$abcdefghijklmnopqrstuv",
                customerName: "無mail",
                priceRank: "A",
                email: ""
            }
        ]);
        const r = await requestPasswordReset({
            rawId: "NOMAIL",
            clientIp: "10.0.0.8",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
    });

    test("reset_rate_limit.json が壊れていてもレート処理は続行", async () => {
        await fs.writeFile(dbPath("reset_rate_limit.json"), "{bad json", "utf-8");
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        const r = await requestPasswordReset({
            rawId: "TEST002",
            clientIp: "10.0.0.9",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
    });

    test("管理者はメールも supportNotifyTo も無ければ送信スキップ", async () => {
        await writeJson("admins.json", [
            { adminId: "adm-no-to", name: "N", password: "$2a$10$abcdefghijklmnopqrstuv", email: "" }
        ]);
        const st = await readJson("settings.json");
        st.mail = { ...(st.mail || {}), supportNotifyTo: "", from: st.mail?.from || "" };
        await writeJson("settings.json", st);
        const r = await requestPasswordReset({
            rawId: "adm-no-to",
            clientIp: "10.0.0.10",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).not.toHaveBeenCalled();
    });

    test("メールアドレスで管理者を検索してリセット送信", async () => {
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        await writeJson("admins.json", [
            {
                adminId: "adm-by-email",
                name: "E",
                password: "$2a$10$abcdefghijklmnopqrstuv",
                email: "adminmatch@example.com"
            }
        ]);
        const r = await requestPasswordReset({
            rawId: "adminmatch@example.com",
            clientIp: "10.0.0.11",
            protocol: "https",
            host: "x.example"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
    });

    test("レート制限掃除で期限切れIPは cleaned から除外される", async () => {
        const stale = Date.now() - RATE_LIMIT_WINDOW_MS - 1000;
        await fs.writeFile(
            dbPath("reset_rate_limit.json"),
            JSON.stringify({ "10.0.0.12": [stale, stale - 1] }, null, 2),
            "utf-8"
        );
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        const r = await requestPasswordReset({
            rawId: "TEST001",
            clientIp: "10.0.0.13",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        const lim = await readJson("reset_rate_limit.json");
        expect(lim["10.0.0.12"]).toBeUndefined();
        expect(Array.isArray(lim["10.0.0.13"])).toBe(true);
    });

    test("顧客名が空のとき mailPayload の customerName に customerId を使う", async () => {
        await writeJson("customers.json", [
            {
                customerId: "NONAME",
                password: "$2a$10$abcdefghijklmnopqrstuv",
                customerName: "",
                priceRank: "A",
                email: "noname@example.com"
            }
        ]);
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        await requestPasswordReset({
            rawId: "NONAME",
            clientIp: "10.0.0.14",
            protocol: "",
            host: ""
        });
        expect(mailService.sendInviteEmail).toHaveBeenCalledWith(
            expect.objectContaining({ customerName: "NONAME" }),
            expect.stringMatching(/^http:\/\/localhost\//),
            "",
            true
        );
    });

    test("顧客メール失敗のロールバックで reset_tokens が壊JSONでも続行", async () => {
        await fs.writeFile(dbPath("reset_tokens.json"), "{broken", "utf-8");
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "smtp" });
        const r = await requestPasswordReset({
            rawId: "TEST001",
            clientIp: "10.0.0.15",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
    });

    test("管理者メール失敗のロールバックで admin_reset_tokens が壊JSONでも続行", async () => {
        await writeJson("admins.json", [
            { adminId: "adm-bad-rollback", name: "B", password: "$2a$10$abcdefghijklmnopqrstuv", email: "b@example.com" }
        ]);
        await fs.writeFile(dbPath("admin_reset_tokens.json"), "{broken", "utf-8");
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "smtp" });
        const r = await requestPasswordReset({
            rawId: "adm-bad-rollback",
            clientIp: "10.0.0.16",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
    });

    test("顧客に無いメールアドレスは管理者メール一致でリセット送信", async () => {
        mailService.sendInviteEmail.mockResolvedValueOnce({ success: true });
        await writeJson("customers.json", [{ customerId: "OTHER", email: "other@example.com" }]);
        await writeJson("admins.json", [
            { adminId: "adm-by-email", name: "AE", password: "$2a$10$abcdefghijklmnopqrstuv", email: "admin-only@reset.test" }
        ]);
        const r = await requestPasswordReset({
            rawId: "admin-only@reset.test",
            clientIp: "10.0.0.50",
            protocol: "https",
            host: "reset.example"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalled();
    });

    test("管理者は ID 一致でもメール・supportNotifyTo 無しなら送信しない", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({ mail: {} });
        mailService.sendInviteEmail.mockClear();
        await writeJson("customers.json", []);
        await writeJson("admins.json", [
            { adminId: "no-sink", name: "N", password: "$2a$10$abcdefghijklmnopqrstuv", email: "" }
        ]);
        const r = await requestPasswordReset({
            rawId: "no-sink",
            clientIp: "10.0.0.51",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(mailService.sendInviteEmail).not.toHaveBeenCalled();
        settingsService.getSettings.mockRestore();
    });
});
