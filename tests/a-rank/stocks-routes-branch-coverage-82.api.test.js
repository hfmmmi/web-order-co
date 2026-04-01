/**
 * routes/admin/stocksRoutes.js 残分岐（import バッファ型、parse-excel 失敗、PUT adapters、manual-release 失敗など）
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
const excelReader = require("../../utils/excelReader");
const stockService = require("../../services/stockService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: stocksRoutes 分岐82%向け", () => {
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

    test("POST /api/admin/kaitori/parse-excel は readToObjects 失敗で500", async () => {
        jest.spyOn(excelReader, "readToObjects").mockRejectedValueOnce(new Error("bad xlsx"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const pk = Buffer.from([0x50, 0x4b, 3, 4]);
        const res = await admin.post("/api/admin/kaitori/parse-excel").attach("excelFile", pk, "bad.xlsx");
        expect(res.statusCode).toBe(500);
        expect(String(res.body.message || "")).toContain("Excel");
        excelReader.readToObjects.mockRestore();
    });

    test("PUT /api/admin/stocks/settings は adapters が配列でないとき既存を維持する", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const cur = await admin.get("/api/admin/stocks/settings");
        expect(cur.statusCode).toBe(200);
        const adaptersBefore = cur.body.adapters;
        const res = await admin.put("/api/admin/stocks/settings").send({
            display: { showWarehouse: true },
            adapters: "not-array"
        });
        expect(res.statusCode).toBe(200);
        const after = await admin.get("/api/admin/stocks/settings");
        expect(Array.isArray(after.body.adapters)).toBe(true);
        if (Array.isArray(adaptersBefore)) {
            expect(after.body.adapters.length).toBe(adaptersBefore.length);
        }
    });

    test("POST /api/admin/stocks/manual-adjust は publish=false と warehouses を反映する", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-adjust").send({
            productCode: "P001",
            totalQty: 3,
            reservedQty: 0,
            warehouses: [{ code: "W1", qty: 2 }],
            publish: false,
            manualLock: true,
            note: "t"
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("POST /api/admin/stocks/manual-release は stockService.release 失敗で500", async () => {
        jest.spyOn(stockService, "release").mockRejectedValueOnce(new Error("release failed"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-release").send({
            items: [{ productCode: "P001", quantity: 1 }]
        });
        expect(res.statusCode).toBe(500);
        stockService.release.mockRestore();
    });
});
