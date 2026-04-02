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

const request = require("supertest");
const { app } = require("../../server");
const customerService = require("../../services/customerService");
const mailService = require("../../services/mailService");
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
});
