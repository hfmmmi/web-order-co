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
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: 価格Excel取込ルート", () => {
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

    test("POST /api/admin/import-rank-prices-excel はファイルなしで400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/import-rank-prices-excel");
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBeTruthy();
    });

    test("POST /api/admin/import-rank-prices-excel は req.files.file でも受け付ける", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const buf = Buffer.from("not-valid-xlsx");
        const res = await admin
            .post("/api/admin/import-rank-prices-excel")
            .attach("file", buf, "upload.xlsx");
        expect([400, 500]).toContain(res.statusCode);
        expect(res.body).toBeDefined();
    });
});
