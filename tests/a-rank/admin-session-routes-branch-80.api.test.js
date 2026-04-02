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

const request = require("supertest");
const { app } = require("../../server");
const customerService = require("../../services/customerService");
const settingsService = require("../../services/settingsService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

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
});
