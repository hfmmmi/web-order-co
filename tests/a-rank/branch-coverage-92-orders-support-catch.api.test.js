/**
 * orders-api GET /api/download-csv（getAllDataForCsv / markOrdersAsExported 失敗）
 * support-api POST /admin/update-ticket（writeFile 失敗）、GET /support/my-tickets（外側 catch）
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
const fs = require("fs").promises;
const { app } = require("../../server");
const orderService = require("../../services/orderService");
const { backupDbFiles, restoreDbFiles, seedBaseData, readJson } = require("../helpers/testSandbox");

describe("Aランク: orders/support catch 500 追加分岐", () => {
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

    test("GET /api/download-csv は getAllDataForCsv 失敗時に500", async () => {
        jest.spyOn(orderService, "getAllDataForCsv").mockRejectedValueOnce(new Error("csv load fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv");
        expect(res.statusCode).toBe(500);
        expect(String(res.text)).toContain("CSVエラー");
    });

    test("GET /api/download-csv?mode=unexported は markOrdersAsExported 失敗時に500", async () => {
        jest.spyOn(orderService, "getAllDataForCsv").mockResolvedValueOnce({
            productMaster: [],
            priceList: [],
            customerList: [],
            rankPriceMap: {},
            rawOrders: [
                {
                    orderId: 9100,
                    customerId: "TEST001",
                    orderDate: new Date().toISOString(),
                    status: "未発送",
                    items: [{ code: "P001", quantity: 1 }],
                    exported_at: null
                }
            ]
        });
        jest.spyOn(orderService, "markOrdersAsExported").mockRejectedValueOnce(new Error("mark fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/download-csv").query({ mode: "unexported" });
        expect(res.statusCode).toBe(500);
        expect(String(res.text)).toContain("CSVエラー");
    });

    test("POST /admin/update-ticket は writeFile 失敗時に500", async () => {
        const customer = request.agent(app);
        const admin = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        await customer.post("/request-support").send({ category: "support", detail: "更新失敗テスト" });
        const tickets = await readJson("support_tickets.json");
        const ticketId = tickets.find((t) => t.customerId === "TEST001")?.ticketId;
        expect(ticketId).toBeTruthy();

        jest.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));
        const res = await admin.post("/admin/update-ticket").send({
            ticketId,
            status: "resolved"
        });
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test("GET /support/my-tickets は一覧整形中に例外が出たら500", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const sortSpy = jest.spyOn(Array.prototype, "sort").mockImplementationOnce(() => {
            throw new Error("forced sort error");
        });
        try {
            const res = await customer.get("/support/my-tickets");
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
        } finally {
            sortSpy.mockRestore();
        }
    });
});
