/**
 * routes/support-api.js 残分岐（update-ticket 404/500、my-tickets エラー、添付パス検証）
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue(true),
    sendSupportNotification: jest.fn().mockResolvedValue(true),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue(true)
}));

const request = require("supertest");
const { app } = require("../../server");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const SUPPORT = dbPath("support_tickets.json");

describe("Aランク: support-api 分岐80%向け", () => {
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

    test("POST /admin/update-ticket は全フィールドと履歴を更新して200", async () => {
        await fs.writeFile(
            SUPPORT,
            JSON.stringify(
                [
                    {
                        ticketId: "T-FULLUPD",
                        customerId: "TEST001",
                        status: "open",
                        history: []
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/admin/update-ticket").send({
            ticketId: "T-FULLUPD",
            status: "closed",
            internalOrderNo: "IO1",
            internalCustomerPoNumber: "PO1",
            desiredAction: "返品",
            collectionDate: "2026-04-01",
            newHistoryLog: "対応メモ"
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        const data = JSON.parse(await fs.readFile(SUPPORT, "utf-8"));
        const t = data.find((x) => x.ticketId === "T-FULLUPD");
        expect(t.internalOrderNo).toBe("IO1");
        expect(Array.isArray(t.history)).toBe(true);
        expect(t.history.length).toBeGreaterThan(0);
    });

    test("POST /admin/update-ticket は tickets が配列でなければ空配列から更新する", async () => {
        await fs.writeFile(SUPPORT, JSON.stringify({ legacy: true }), "utf-8");
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/admin/update-ticket").send({
            ticketId: "T-NEWONLY",
            status: "open"
        });
        expect(res.statusCode).toBe(404);
    });

    test("POST /admin/update-ticket は存在しない ticketId で404", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/admin/update-ticket").send({
            ticketId: "T-NONEXIST999",
            status: "open"
        });
        expect(res.statusCode).toBe(404);
    });

    test("GET /support/my-tickets は添付 size が数値でなければ0に正規化", async () => {
        await fs.writeFile(
            SUPPORT,
            JSON.stringify(
                [
                    {
                        ticketId: "T-SZ",
                        customerId: "TEST001",
                        status: "open",
                        timestamp: new Date().toISOString(),
                        attachments: [{ storedName: "a.pdf", originalName: "a.pdf", size: "x" }]
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const cust = request.agent(app);
        await cust.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await cust.get("/support/my-tickets");
        expect(res.statusCode).toBe(200);
        const t = res.body.tickets.find((x) => x.ticketId === "T-SZ");
        expect(t.attachments[0].size).toBe(0);
    });

    test("GET /support/my-tickets は一覧整形中に例外で500", async () => {
        const cust = request.agent(app);
        await cust.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const sortSpy = jest.spyOn(Array.prototype, "sort").mockImplementationOnce(() => {
            throw new Error("forced sort");
        });
        try {
            const res = await cust.get("/support/my-tickets");
            expect(res.statusCode).toBe(500);
        } finally {
            sortSpy.mockRestore();
        }
    });

    test("POST /admin/update-ticket は support JSON 破損で500", async () => {
        await fs.writeFile(SUPPORT, "{not-json", "utf-8");
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/admin/update-ticket").send({
            ticketId: "T-ANY",
            status: "closed"
        });
        expect(res.statusCode).toBe(500);
    });

    test("GET /support/attachment は存在しないチケットで404", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/support/attachment/T-NOTFOUND/0_1_aabbccdd.pdf");
        expect(res.statusCode).toBe(404);
    });

    test("GET /support/attachment は添付名不一致で404", async () => {
        await fs.writeFile(
            SUPPORT,
            JSON.stringify(
                [
                    {
                        ticketId: "T-NOMATCH",
                        customerId: "TEST001",
                        attachments: [{ storedName: "0_0_11223344.pdf", originalName: "a.pdf", size: 1 }]
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/support/attachment/T-NOMATCH/0_1_aabbccdd.pdf");
        expect(res.statusCode).toBe(404);
    });
});
