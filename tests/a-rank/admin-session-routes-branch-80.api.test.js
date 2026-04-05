/**
 * routes/auth/adminSessionRoutes.js 分岐80%向け（セッション保存失敗・invite-reset catch 等）
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const fs = require("fs").promises;
const request = require("supertest");
const { app } = require("../../server");
const customerService = require("../../services/customerService");
const settingsService = require("../../services/settingsService");
const authTokenStore = require("../../services/authTokenStore");
const recaptcha = require("../../routes/auth/recaptcha");
const mailService = require("../../services/mailService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");
const bcrypt = require("bcryptjs");

describe("Aランク: adminSessionRoutes 分岐80%向け", () => {
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

    test("POST /api/admin/invite-reset は updateCustomerPassword 失敗でエラーメッセージ", async () => {
        jest.spyOn(customerService, "updateCustomerPassword").mockResolvedValueOnce({
            success: false,
            message: "IDが見つかりません"
        });
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/invite-reset").send({ customerId: "GHOST" });
        expect(res.body.success).toBe(false);
    });

    test("管理者ログイン処理の外側 catch（設定取得失敗）", async () => {
        jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("settings boom"));
        const agent = request.agent(app);
        const res = await agent.post("/api/admin/login").send({
            id: "test-admin",
            pass: "AdminPass123!"
        });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("システム");
    });

    test("2回失敗後は reCAPTCHA シークレットありのとき captcha 無しでログイン不可", async () => {
        await settingsService.updateSettings({
            recaptcha: { siteKey: "site", secretKey: "secret-for-test" }
        });
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong" });
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong" });
        const res = await agent.post("/api/admin/login").send({
            id: "test-admin",
            pass: "AdminPass123!"
        });
        expect(res.body.success).toBe(false);
        expect(res.body.captchaRequired).toBe(true);
    });

    test("2回失敗後は無効な captcha トークンでログイン不可", async () => {
        await settingsService.updateSettings({
            recaptcha: { siteKey: "site", secretKey: "secret-for-test" }
        });
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong" });
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong" });
        const res = await agent.post("/api/admin/login").send({
            id: "test-admin",
            pass: "AdminPass123!",
            captchaToken: "invalid-token-for-google"
        });
        expect(res.body.success).toBe(false);
        expect(res.body.captchaRequired).toBe(true);
    });

    test("2回失敗後に captcha 検証成功すればログインできる", async () => {
        await settingsService.updateSettings({
            recaptcha: { siteKey: "site", secretKey: "secret-for-test" }
        });
        jest.spyOn(recaptcha, "verifyRecaptcha").mockResolvedValue(true);
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong" });
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong" });
        const res = await agent.post("/api/admin/login").send({
            id: "test-admin",
            pass: "AdminPass123!",
            captchaToken: "any-token"
        });
        expect(res.body.success).toBe(true);
    });

    test("顧客ログイン後に管理者ログインし、管理者ログアウトで顧客セッションは維持", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const out = await agent.post("/api/admin/logout").send({});
        expect(out.body.success).toBe(true);
        const check = await agent.get("/api/session");
        expect(check.body.loggedIn).toBe(true);
        expect(check.body.customerId).toBe("TEST001");
    });

    test("管理者5回連続失敗でログイン失敗アラートが飛ぶ", async () => {
        const sendAlert = mailService.sendLoginFailureAlert;
        const agent = request.agent(app);
        for (let i = 0; i < 4; i++) {
            await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong-pass" });
        }
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "wrong-pass" });
        expect(sendAlert.mock.calls.length).toBeGreaterThanOrEqual(1);
        const last = sendAlert.mock.calls[sendAlert.mock.calls.length - 1][0];
        expect(last.type).toBe("admin");
        expect(last.count).toBe(5);
    });

    test("平文パス昇格時 mutate 内で該当管理者が見つからない分岐でも admins は壊さない", async () => {
        await writeJson("admins.json", [
            {
                adminId: "plain-admin",
                password: "PlainSecret99!",
                name: "平文管理者"
            }
        ]);
        const realMutate = jest.requireActual("../../services/authTokenStore").mutateJsonFile;
        jest.spyOn(authTokenStore, "mutateJsonFile").mockImplementationOnce(async (filePath, fallback, mutator) => {
            if (filePath !== authTokenStore.ADMINS_DB_PATH) {
                return realMutate(filePath, fallback, mutator);
            }
            const raw = await fs.readFile(filePath, "utf-8");
            const full = JSON.parse(raw);
            const without = full.filter((a) => a.adminId !== "plain-admin");
            await mutator(without);
            await fs.writeFile(filePath, JSON.stringify(full, null, 2), "utf-8");
        });
        const agent = request.agent(app);
        const res = await agent.post("/api/admin/login").send({
            id: "plain-admin",
            pass: "PlainSecret99!"
        });
        expect(res.body.success).toBe(true);
        const admins = JSON.parse(await fs.readFile(authTokenStore.ADMINS_DB_PATH, "utf-8"));
        expect(admins.find((a) => a.adminId === "plain-admin").password).toBe("PlainSecret99!");
    });

    test("管理者ログイン失敗時 name 空でもアラート用 adminName がフォールバックする", async () => {
        const hash = await bcrypt.hash("Secret1!", 10);
        await writeJson("admins.json", [
            { adminId: "noname-admin", password: hash, name: "" }
        ]);
        const sendAlert = mailService.sendLoginFailureAlert;
        const agent = request.agent(app);
        for (let i = 0; i < 5; i++) {
            await agent.post("/api/admin/login").send({ id: "noname-admin", pass: "wrong" });
        }
        const adminCalls = sendAlert.mock.calls.filter((c) => c[0].type === "admin");
        const hit = adminCalls.find((c) => c[0].adminName === "Admin");
        expect(hit).toBeTruthy();
    });
});
