/**
 * routes/admin/customersRoutes.js 分岐80%向け
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
const { dbPath } = require("../../dbPaths");
const customerService = require("../../services/customerService");
const mailService = require("../../services/mailService");
const proxyRequestsStore = require("../../utils/proxyRequestsStore");
const sessionAsync = require("../../utils/sessionAsync");
const { backupDbFiles, restoreDbFiles, seedBaseData, readJson, writeJson } = require("../helpers/testSandbox");

describe("Aランク: customersRoutes 分岐80%向け", () => {
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

    test("GET /api/admin/customers は keyword と page を渡せる", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/customers").query({ keyword: "TEST", page: 2 });
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.customers)).toBe(true);
    });

    test("POST /api/admin/send-invite-email は isPasswordReset をメールに渡す", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin
            .post("/api/admin/send-invite-email")
            .send({ customerId: "TEST001", isPasswordReset: true });
        expect(res.body.success).toBe(true);
        expect(mailService.sendInviteEmail).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(String),
            expect.any(String),
            true
        );
    });

    test("invite_tokens.json が壊れていても send-invite は続行する", async () => {
        await fs.writeFile(dbPath("invite_tokens.json"), "{bad", "utf-8");
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(true);
    });

    test("POST /api/admin/send-invite-email は内部例外で500", async () => {
        jest.spyOn(customerService, "getCustomerById").mockRejectedValueOnce(new Error("boom"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/proxy-request-status は pending / approved を返す", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: false }
        });
        const pen = await admin.get("/api/admin/proxy-request-status").query({ customerId: "TEST001" });
        expect(pen.body.status).toBe("pending");
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: true }
        });
        const appd = await admin.get("/api/admin/proxy-request-status").query({ customerId: "TEST001" });
        expect(appd.body.status).toBe("approved");
    });

    test("POST /api/admin/proxy-login は未承認なら not_approved", async () => {
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: false }
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/許可/);
    });

    test("POST /api/admin/proxy-login は期限切れ承認なら expired", async () => {
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now() - 20 * 60 * 1000, approved: true }
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/期限/);
    });

    test("POST /api/admin/send-invite-email-with-token は isPasswordReset を渡して成功", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email-with-token").send({
            customerId: "TEST001",
            tempPassword: "abcd1234",
            isPasswordReset: true
        });
        expect(res.body.success).toBe(true);
    });

    test("GET /api/admin/customers は取得失敗で500", async () => {
        jest.spyOn(customerService, "getAllCustomers").mockRejectedValueOnce(new Error("db"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/customers");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/add-customer は例外で500", async () => {
        jest.spyOn(customerService, "addCustomer").mockRejectedValueOnce(new Error("lock"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/add-customer").send({
            customerId: "NEW99",
            customerName: "N",
            password: "Pass1234!",
            priceRank: "A",
            email: "n@test.com"
        });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/update-customer は例外で500", async () => {
        jest.spyOn(customerService, "updateCustomer").mockRejectedValueOnce(new Error("x"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/update-customer").send({
            customerId: "TEST001",
            customerName: "X",
            password: "",
            priceRank: "A",
            email: "test001@example.com"
        });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/send-invite-email は customerId 無しで失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email").send({});
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/send-invite-email はメール未登録で失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const list = await readJson("customers.json");
        const c = list.find((x) => x.customerId === "TEST001");
        const prev = c.email;
        c.email = "";
        await writeJson("customers.json", list);
        const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
        c.email = prev;
        await writeJson("customers.json", list);
    });

    test("POST /api/admin/send-invite-email は updateCustomerPassword 失敗で失敗JSON", async () => {
        jest.spyOn(customerService, "updateCustomerPassword").mockResolvedValueOnce({
            success: false,
            message: "ng"
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/send-invite-email はメール失敗で success false", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValueOnce({
            success: false,
            message: "smtp down"
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message)).toContain("smtp down");
    });

    test("POST /api/admin/send-invite-email-with-token は tempPassword 無しで失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email-with-token").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/proxy-request は customerId 無しで400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-request").send({});
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/proxy-request は顧客不在で失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-request").send({ customerId: "NOPE" });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/proxy-logout は代理ログイン中でなければ400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-logout").send({});
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/send-invite-email は顧客不在で失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "NO_CUSTOMER_XYZ" });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/send-invite-email-with-token は顧客不在で失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email-with-token").send({
            customerId: "NO_CUSTOMER_XYZ",
            tempPassword: "abcd1234"
        });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/send-invite-email-with-token はメール未登録で失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const list = await readJson("customers.json");
        const c = list.find((x) => x.customerId === "TEST001");
        const prev = c.email;
        c.email = "";
        await writeJson("customers.json", list);
        const res = await admin.post("/api/admin/send-invite-email-with-token").send({
            customerId: "TEST001",
            tempPassword: "abcd1234"
        });
        expect(res.body.success).toBe(false);
        c.email = prev;
        await writeJson("customers.json", list);
    });

    test("POST /api/admin/send-invite-email-with-token はメール失敗でメッセージ返却", async () => {
        jest.spyOn(mailService, "sendInviteEmail").mockResolvedValueOnce({
            success: false,
            message: "smtp token fail"
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email-with-token").send({
            customerId: "TEST001",
            tempPassword: "abcd1234"
        });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message)).toContain("smtp token fail");
    });

    test("POST /api/admin/proxy-request は mutate 失敗で500", async () => {
        jest.spyOn(proxyRequestsStore, "mutateProxyRequests").mockRejectedValueOnce(new Error("proxy io"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/proxy-login は未承認で失敗", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/許可/);
    });

    test("POST /api/admin/proxy-login は期限切れで失敗", async () => {
        const old = Date.now() - 20 * 60 * 1000;
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: old, approved: true, adminName: "Mgr" }
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/期限/);
    });

    test("POST /api/admin/proxy-login は顧客削除済みで失敗", async () => {
        await writeJson("proxy_requests.json", {
            GHOST: { requestedAt: Date.now(), approved: true, adminName: "Mgr" }
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "GHOST" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/見つかりません/);
    });

    test("POST /api/admin/proxy-login はセッション保存失敗で500", async () => {
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: Date.now(), approved: true, adminName: "Mgr" }
        });
        jest.spyOn(sessionAsync, "saveSession").mockRejectedValueOnce(new Error("sess"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/send-invite-email-with-token は内部例外で500", async () => {
        jest.spyOn(customerService, "getCustomerById").mockRejectedValueOnce(new Error("db"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/send-invite-email-with-token").send({
            customerId: "TEST001",
            tempPassword: "abcd1234"
        });
        expect(res.statusCode).toBe(500);
    });
});
