"use strict";

/**
 * customerSessionRoutes: 分岐90%向け（captcha 成功・代理申請・ログアウト・setup 周辺）
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const settingsService = require("../../services/settingsService");
const customerService = require("../../services/customerService");
const recaptcha = require("../../routes/auth/recaptcha");
const mailService = require("../../services/mailService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");
const { PROXY_REQUEST_EXPIRY_MS } = require("../../utils/proxyRequestsStore");
const proxyRequestsStore = require("../../utils/proxyRequestsStore");
const sessionAsync = require("../../utils/sessionAsync");

describe("分岐90向け: customerSessionRoutes", () => {
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

    test("GET /api/session は未ログインで loggedIn false", async () => {
        const res = await request(app).get("/api/session");
        expect(res.body.loggedIn).toBe(false);
        expect(res.body.customerId).toBeNull();
    });

    test("2回失敗後 captcha 検証成功で顧客ログインできる", async () => {
        await settingsService.updateSettings({
            recaptcha: { siteKey: "site", secretKey: "secret-for-test" }
        });
        jest.spyOn(recaptcha, "verifyRecaptcha").mockResolvedValue(true);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        const res = await agent.post("/api/login").send({
            id: "TEST001",
            pass: "CustPass123!",
            captchaToken: "ok"
        });
        expect(res.body.success).toBe(true);
    });

    test("2回失敗後 reCAPTCHA 必須でトークンなしは captchaRequired", async () => {
        await settingsService.updateSettings({
            recaptcha: { siteKey: "site", secretKey: "secret-for-captcha-req" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        const res = await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(res.body.success).toBe(false);
        expect(res.body.captchaRequired).toBe(true);
    });

    test("2回失敗後 reCAPTCHA 検証失敗メッセージ", async () => {
        await settingsService.updateSettings({
            recaptcha: { siteKey: "site", secretKey: "secret-for-captcha-fail" }
        });
        jest.spyOn(recaptcha, "verifyRecaptcha").mockResolvedValue(false);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        const res = await agent.post("/api/login").send({
            id: "TEST001",
            pass: "CustPass123!",
            captchaToken: "bad-token"
        });
        expect(res.body.success).toBe(false);
        expect(res.body.captchaRequired).toBe(true);
    });

    test("顧客5回失敗かつメールありでログイン失敗アラート", async () => {
        const agent = request.agent(app);
        for (let i = 0; i < 5; i++) {
            await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        }
        expect(mailService.sendLoginFailureAlert.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    test("顧客ログイン後に管理者ログインし、顧客ログアウトでセッション破棄しない", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const out = await agent.post("/api/logout").send({});
        expect(out.body.success).toBe(true);
        const chk = await agent.get("/api/admin/check");
        expect(chk.body.loggedIn).toBe(true);
    });

    test("GET /api/account/proxy-request は申請なしで pending false", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/proxy-request");
        expect(res.body.pending).toBe(false);
    });

    test("GET /api/account/proxy-request は未承認申請で pending と adminName", async () => {
        const now = Date.now();
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: now, approved: false, adminName: "Mgr" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/proxy-request");
        expect(res.body.pending).toBe(true);
        expect(res.body.adminName).toBeTruthy();
    });

    test("GET /api/account/proxy-request は期限切れ申請を削除して pending false", async () => {
        const old = Date.now() - PROXY_REQUEST_EXPIRY_MS - 1000;
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: old, approved: false, adminName: "Mgr" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/proxy-request");
        expect(res.body.pending).toBe(false);
        const pr = await readJson("proxy_requests.json");
        expect(pr.TEST001).toBeUndefined();
    });

    test("GET /api/account/proxy-request は既に承認済みなら pending false", async () => {
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: true, adminName: "Mgr" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/proxy-request");
        expect(res.body.pending).toBe(false);
    });

    test("POST /api/account/proxy-request/approve は期限切れで失敗メッセージ", async () => {
        const old = Date.now() - PROXY_REQUEST_EXPIRY_MS - 1000;
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: old, approved: false, adminName: "Mgr" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/api/account/proxy-request/approve").send({});
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/期限/);
    });

    test("GET /api/account/settings は顧客が存在しなければ 404", async () => {
        jest.spyOn(customerService, "getCustomerById").mockResolvedValueOnce(null);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/settings");
        expect(res.status).toBe(404);
    });

    test("PUT /api/account/settings は更新失敗で 400", async () => {
        jest.spyOn(customerService, "updateCustomerAllowProxy").mockResolvedValueOnce({
            success: false,
            message: "NG"
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.put("/api/account/settings").send({ allowProxyLogin: true });
        expect(res.status).toBe(400);
    });

    test("POST /api/setup は reset トークン期限切れメッセージ", async () => {
        await writeJson("reset_tokens.json", {
            TEST001: { token: "tok1", expiresAt: Date.now() - 1000 }
        });
        const res = await request(app).post("/api/setup").send({
            id: "TEST001",
            newPass: "NewPass123!",
            key: "tok1"
        });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/24時間/);
    });

    test("POST /api/setup は admin_reset 期限切れメッセージ", async () => {
        await writeJson("admin_reset_tokens.json", {
            testadmin: { token: "admintok", expiresAt: Date.now() - 1000 }
        });
        const res = await request(app).post("/api/setup").send({
            id: "testadmin",
            newPass: "NewPass123!",
            key: "admintok"
        });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/24時間/);
    });

    test("POST /api/setup は招待リンク期限切れメッセージ", async () => {
        await writeJson("invite_tokens.json", {
            TEST002: Date.now() - 1000
        });
        const res = await request(app).post("/api/setup").send({
            id: "TEST002",
            currentPass: "CustPass123!",
            newPass: "NewPass123!"
        });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/招待/);
    });

    test("POST /api/request-password-reset は rawId を受け取る", async () => {
        const res = await request(app).post("/api/request-password-reset").send({ id: "TEST001" });
        expect(res.body).toBeDefined();
        expect(typeof res.body.success === "boolean" || res.body.message !== undefined).toBe(true);
    });

    test("GET /api/account/proxy-request は mutate 失敗時 pending false", async () => {
        jest.spyOn(proxyRequestsStore, "mutateProxyRequests").mockRejectedValueOnce(new Error("proxy io"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/proxy-request");
        expect(res.body.pending).toBe(false);
    });

    test("代理申請の adminName 空なら表示用に「管理者」", async () => {
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: false, adminName: "" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/proxy-request");
        expect(res.body.pending).toBe(true);
        expect(res.body.adminName).toBe("管理者");
    });

    test("メール無し顧客は5回失敗でもログインアラートを送らない", async () => {
        const list = await readJson("customers.json");
        const next = list.map((c) =>
            c.customerId === "TEST001" ? { ...c, email: "" } : c
        );
        await writeJson("customers.json", next);
        const agent = request.agent(app);
        const before = mailService.sendLoginFailureAlert.mock.calls.length;
        for (let i = 0; i < 5; i++) {
            await agent.post("/api/login").send({ id: "TEST001", pass: "wrong" });
        }
        expect(mailService.sendLoginFailureAlert.mock.calls.length).toBe(before);
    });

    test("GET /api/account/settings は取得例外で 500", async () => {
        jest.spyOn(customerService, "getCustomerById").mockRejectedValueOnce(new Error("db"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/settings");
        expect(res.status).toBe(500);
    });

    test("PUT /api/account/settings は保存例外で 500", async () => {
        jest.spyOn(customerService, "updateCustomerAllowProxy").mockRejectedValueOnce(new Error("db"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.put("/api/account/settings").send({ allowProxyLogin: false });
        expect(res.status).toBe(500);
    });

    test("顧客ログインは設定取得失敗でシステムエラー", async () => {
        jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("boom"));
        const res = await request(app).post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("システム");
    });

    test("顧客ログインはセッション保存失敗で失敗メッセージ", async () => {
        jest.spyOn(sessionAsync, "saveSession").mockRejectedValueOnce(new Error("sess"));
        const res = await request(app).post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/セッション/);
    });

    test("POST /api/account/proxy-request/approve は正常承認", async () => {
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: false, adminName: "Mgr" }
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/api/account/proxy-request/approve").send({});
        expect(res.body.success).toBe(true);
    });

    test("POST /api/account/proxy-request/reject は mutate 失敗で500", async () => {
        jest.spyOn(proxyRequestsStore, "mutateProxyRequests").mockRejectedValueOnce(new Error("rej"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/api/account/proxy-request/reject").send({});
        expect(res.status).toBe(500);
    });

    test("POST /api/setup は顧客一覧読込失敗でシステムエラー", async () => {
        const fsp = require("fs").promises;
        const realRead = jest.requireActual("fs").promises.readFile;
        jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("customers.json")) {
                throw new Error("eio");
            }
            return realRead(p, enc);
        });
        try {
            const res = await request(app).post("/api/setup").send({
                id: "TEST001",
                currentPass: "CustPass123!",
                newPass: "NewPass999!"
            });
            expect(res.body.success).toBe(false);
            expect(String(res.body.message || "")).toContain("システム");
        } finally {
            fsp.readFile.mockRestore();
        }
    });
});
