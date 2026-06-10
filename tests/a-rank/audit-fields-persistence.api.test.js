/**
 * 監査フィールド（createdBy / updatedBy 等）の保存を API 経由で検証
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
const { backupDbFiles, restoreDbFiles, seedBaseData, readJson } = require("../helpers/testSandbox");

describe("Aランク: 監査フィールドの永続化", () => {
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

    test("顧客の place-order で注文に監査フィールドが付く", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const placed = await customer.post("/place-order").send({
            cart: [{ code: "P001", name: "テストトナーA", price: 1000, quantity: 1 }],
            deliveryInfo: { name: "テスト", address: "大阪", tel: "06-0000-0000" }
        });
        expect(placed.body.success).toBe(true);

        const orders = await readJson("orders.json");
        const order = orders.find((o) => o.orderId === placed.body.orderId);
        expect(order).toBeDefined();
        expect(order.createdBy).toBe("テスト顧客");
        expect(order.updatedBy).toBe("テスト顧客");
        expect(order.createdAt).toEqual(expect.any(String));
        expect(order.updatedAt).toEqual(expect.any(String));
    });

    test("管理者の add-product / update-product で監査フィールドが付く", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const created = await admin.post("/api/add-product").send({
            productCode: "AUDIT-P1",
            name: "監査テスト商品",
            manufacturer: "M",
            category: "純正",
            basePrice: 100,
            stockStatus: "即納",
            active: true
        });
        expect(created.body.success).toBe(true);
        expect(created.body.audit.createdBy).toBe("テスト管理者");

        const updated = await admin.post("/api/update-product").send({
            productCode: "AUDIT-P1",
            name: "監査テスト商品（更新）"
        });
        expect(updated.body.success).toBe(true);
        expect(updated.body.audit.updatedBy).toBe("テスト管理者");

        const products = await readJson("products.json");
        const row = products.find((p) => p.productCode === "AUDIT-P1");
        expect(row.updatedBy).toBe("テスト管理者");
    });

    test("管理者の add-customer / update-customer で監査フィールドが付く", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const created = await admin.post("/api/add-customer").send({
            customerId: "AUDIT-C1",
            customerName: "監査顧客",
            password: "Pass1234!",
            priceRank: "A",
            email: "audit@example.com"
        });
        expect(created.body.success).toBe(true);
        expect(created.body.audit.createdBy).toBe("テスト管理者");

        const updated = await admin.post("/api/update-customer").send({
            customerId: "AUDIT-C1",
            customerName: "監査顧客（更新）",
            priceRank: "B",
            email: "audit2@example.com"
        });
        expect(updated.body.success).toBe(true);
        expect(updated.body.audit.updatedBy).toBe("テスト管理者");

        const list = await admin.get("/api/admin/customers").query({ keyword: "AUDIT-C1" });
        const row = list.body.customers.find((c) => c.customerId === "AUDIT-C1");
        expect(row.updatedBy).toBe("テスト管理者");
    });

    test("管理者の update-ticket でチケットに監査フィールドが付く", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await customer.post("/request-support").send({
            type: "不具合",
            detail: "監査テスト用"
        });

        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const ticketsRes = await admin.get("/admin/support-tickets");
        expect(Array.isArray(ticketsRes.body)).toBe(true);
        const ticket = ticketsRes.body.find((t) => t.detail === "監査テスト用");
        expect(ticket).toBeDefined();

        const upd = await admin.post("/admin/update-ticket").send({
            ticketId: ticket.ticketId,
            status: "verifying",
            newHistoryLog: "確認中"
        });
        expect(upd.body.success).toBe(true);
        expect(upd.body.audit.updatedBy).toBe("テスト管理者");

        const tickets = await readJson("support_tickets.json");
        const saved = tickets.find((t) => t.ticketId === ticket.ticketId);
        expect(saved.updatedBy).toBe("テスト管理者");
    });

    test("管理者の kaitori-update で買取申請に監査フィールドが付く", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const reqRes = await customer.post("/kaitori-request").send({
            items: [{ name: "トナー", price: 100, qty: 1, destination: "大阪" }]
        });
        expect(reqRes.body.success).toBe(true);

        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const upd = await admin.post("/admin/kaitori-update").send({
            requestId: reqRes.body.requestId,
            status: "査定中",
            internalMemo: "確認"
        });
        expect(upd.body.success).toBe(true);
        expect(upd.body.audit.updatedBy).toBe("テスト管理者");

        const requests = await readJson("kaitori_requests.json");
        const saved = requests.find((r) => r.requestId === reqRes.body.requestId);
        expect(saved.updatedBy).toBe("テスト管理者");
    });
});
