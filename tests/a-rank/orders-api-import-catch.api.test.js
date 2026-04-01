/**
 * routes/orders-api.js の import 系 catch(500) 分岐
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
const csvService = require("../../services/csvService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: orders-api import catch 500", () => {
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

    test("POST /api/import-shipping-csv は parseShippingCsv 例外で500", async () => {
        jest.spyOn(csvService, "parseShippingCsv").mockImplementationOnce(() => {
            throw new Error("parse ship");
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/import-shipping-csv").attach("file", Buffer.from("x"), "s.csv");
        expect(res.statusCode).toBe(500);
        expect(String(res.body.message || "")).toContain("parse ship");
    });

    test("POST /api/import-orders-csv は parseExternalOrdersCsv 例外で500", async () => {
        jest.spyOn(csvService, "parseExternalOrdersCsv").mockImplementationOnce(() => {
            throw new Error("parse ext");
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/import-orders-csv").attach("file", Buffer.from("x"), "o.csv");
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("parse ext");
    });
});
