/**
 * routes/admin/pricesRoutes.js の catch / 分岐（分岐80%向け）
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
const priceService = require("../../services/priceService");
const settingsService = require("../../services/settingsService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: admin pricesRoutes 分岐", () => {
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

    test("POST /api/admin/save-rank-prices は保存失敗で500", async () => {
        jest.spyOn(priceService, "saveRankPrices").mockRejectedValueOnce(new Error("disk full"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/save-rank-prices").send({ rows: [] });
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/rank-prices-list は取得失敗で500", async () => {
        jest.spyOn(priceService, "getRankPrices").mockRejectedValueOnce(new Error("read fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/rank-prices-list");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/special-prices-list は取得失敗で500", async () => {
        jest.spyOn(priceService, "getAllSpecialPrices").mockRejectedValueOnce(new Error("read"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/special-prices-list");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/download-pricelist-by-rank/:rank は CSV 生成失敗で500", async () => {
        jest.spyOn(priceService, "getPricelistCsvForRank").mockRejectedValueOnce(new Error("csv"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/download-pricelist-by-rank/A");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/download-pricelist-by-rank は rank パラメータを正規化する", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/download-pricelist-by-rank/b1");
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/csv");
    });

    test("POST /api/admin/import-rank-prices-excel は result.success false で400", async () => {
        jest.spyOn(priceService, "updateRankPricesFromExcel").mockResolvedValueOnce({
            success: false,
            message: "検証エラー"
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const buf = Buffer.from("x");
        const res = await admin
            .post("/api/admin/import-rank-prices-excel")
            .attach("rankExcelFile", buf, "r.xlsx");
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/import-rank-prices-excel は例外で500", async () => {
        jest.spyOn(priceService, "updateRankPricesFromExcel").mockRejectedValueOnce(new Error("parse"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin
            .post("/api/admin/import-rank-prices-excel")
            .attach("file", Buffer.from("x"), "f.xlsx");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/rank-list は getRankList 失敗で500（settings）", async () => {
        jest.spyOn(settingsService, "getRankList").mockRejectedValueOnce(new Error("rank"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/rank-list");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/customer-price-list は取得失敗時に空配列", async () => {
        jest.spyOn(priceService, "getCustomerPriceList").mockRejectedValueOnce(new Error("db"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/customer-price-list?customerId=TEST001");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toEqual([]);
    });

    test("GET /api/admin/download-pricelist-excel-by-rank は Excel を返す", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/download-pricelist-excel-by-rank/b");
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"] || "").toContain("spreadsheet");
    });

    test("GET /api/admin/download-pricelist-excel-by-rank は生成失敗で500", async () => {
        jest.spyOn(priceService, "getPricelistExcelForRank").mockRejectedValueOnce(new Error("xlsx"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/download-pricelist-excel-by-rank/A");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/import-rank-prices-excel はファイル無しで400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/import-rank-prices-excel");
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("GET /api/admin/download-pricelist-by-rank は数字のみの rank を A に正規化する", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const spy = jest.spyOn(priceService, "getPricelistCsvForRank").mockResolvedValueOnce({
            csv: "ok",
            filename: "f.csv"
        });
        const res = await admin.get("/api/admin/download-pricelist-by-rank/123");
        expect(res.statusCode).toBe(200);
        expect(spy).toHaveBeenCalledWith("A");
        spy.mockRestore();
    });

    test("POST /api/admin/import-rank-prices-excel は rankExcelFile 無しで file のみでも取込む", async () => {
        jest.spyOn(priceService, "updateRankPricesFromExcel").mockResolvedValueOnce({
            success: true,
            message: "ok"
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const pk = Buffer.from([0x50, 0x4b, 3, 4]);
        const res = await admin
            .post("/api/admin/import-rank-prices-excel")
            .attach("file", pk, "onlyfile.xlsx");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
