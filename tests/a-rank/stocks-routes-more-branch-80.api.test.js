/**
 * routes/admin/stocksRoutes.js 追加分岐（分岐80%向け）
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
const stockService = require("../../services/stockService");
const { CsvAdapter } = require("../../services/stockAdapters");
const excelReader = require("../../utils/excelReader");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: stocksRoutes 分岐80%向け（追加）", () => {
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

    test("GET /api/admin/stocks/settings は adapters 省略時に空配列で返す", async () => {
        jest.spyOn(stockService, "getAdapterConfig").mockResolvedValueOnce({ display: { enabled: true } });
        jest.spyOn(stockService, "getDisplaySettings").mockResolvedValueOnce({ enabled: true });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/settings");
        expect(res.statusCode).toBe(200);
        expect(res.body.adapters).toEqual([]);
    });

    test("PUT /api/admin/stocks/settings は adapters が配列ならそのまま保存する", async () => {
        const incoming = [{ id: "new-csv", type: "csv", options: {} }];
        jest.spyOn(stockService, "getAdapterConfig").mockResolvedValueOnce({
            display: { enabled: false },
            adapters: [{ id: "old", type: "csv", options: {} }]
        });
        const saveSpy = jest.spyOn(stockService, "saveAdapterConfig").mockImplementation(async (c) => c);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.put("/api/admin/stocks/settings").send({ adapters: incoming });
        expect(res.statusCode).toBe(200);
        expect(saveSpy.mock.calls[0][0].adapters).toEqual(incoming);
        saveSpy.mockRestore();
    });

    test("PUT /api/admin/stocks/settings は display 省略時に既存 display をマージする", async () => {
        jest.spyOn(stockService, "getAdapterConfig").mockResolvedValueOnce({
            display: { enabled: true, hiddenMessage: "keep" },
            adapters: []
        });
        const saveSpy = jest.spyOn(stockService, "saveAdapterConfig").mockImplementation(async (c) => c);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.put("/api/admin/stocks/settings").send({ adapters: [] });
        expect(res.statusCode).toBe(200);
        expect(saveSpy.mock.calls[0][0].display.hiddenMessage).toBe("keep");
        saveSpy.mockRestore();
    });

    test("PUT /api/admin/stocks/settings は adapters が配列でなければ既存を維持", async () => {
        jest.spyOn(stockService, "getAdapterConfig").mockResolvedValueOnce({
            display: {},
            adapters: [{ id: "keep", type: "csv", options: {} }]
        });
        const saveSpy = jest.spyOn(stockService, "saveAdapterConfig").mockImplementation(async (c) => c);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.put("/api/admin/stocks/settings").send({ display: {}, adapters: "nope" });
        expect(res.statusCode).toBe(200);
        expect(saveSpy).toHaveBeenCalled();
        const arg = saveSpy.mock.calls[0][0];
        expect(Array.isArray(arg.adapters)).toBe(true);
        expect(arg.adapters[0].id).toBe("keep");
        saveSpy.mockRestore();
    });

    test("GET /api/admin/stocks/settings は取得失敗で500", async () => {
        jest.spyOn(stockService, "getAdapterConfig").mockRejectedValueOnce(new Error("cfg"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/settings");
        expect(res.statusCode).toBe(500);
    });

    test("PUT /api/admin/stocks/settings は保存失敗で500", async () => {
        jest.spyOn(stockService, "getAdapterConfig").mockResolvedValueOnce({ display: {}, adapters: [] });
        jest.spyOn(stockService, "saveAdapterConfig").mockRejectedValueOnce(new Error("save"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.put("/api/admin/stocks/settings").send({ display: {} });
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/stocks は一覧取得失敗で500", async () => {
        jest.spyOn(stockService, "getAllStocks").mockRejectedValueOnce(new Error("list"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/stocks/import はファイル無しで400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/import");
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/stocks/import は adapter.run 失敗で500", async () => {
        jest.spyOn(CsvAdapter.prototype, "run").mockRejectedValueOnce(new Error("csv bad"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const csv = Buffer.from("productCode,totalQty\nX,1", "utf-8");
        const res = await admin.post("/api/admin/stocks/import").attach("stockFile", csv, "s.csv");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/stocks/template は writeBuffer 失敗で500", async () => {
        function FailingWorkbook() {
            this.addWorksheet = () => ({ addRow: () => {} });
            this.xlsx = {
                writeBuffer: jest.fn().mockRejectedValue(new Error("xlsx"))
            };
        }
        jest.spyOn(excelReader.ExcelJS, "Workbook").mockImplementationOnce(FailingWorkbook);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/template");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/stocks/history は失敗で500", async () => {
        jest.spyOn(stockService, "getHistory").mockRejectedValueOnce(new Error("hist"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/history");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/stocks/manual-adjust は productCode 無しで400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-adjust").send({ totalQty: 1 });
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/stocks/manual-adjust は saveStock 失敗で500", async () => {
        jest.spyOn(stockService, "saveStock").mockRejectedValueOnce(new Error("save"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-adjust").send({ productCode: "P001" });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/stocks/manual-adjust は publish false を保存する", async () => {
        const saveSpy = jest.spyOn(stockService, "saveStock").mockResolvedValueOnce(undefined);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin
            .post("/api/admin/stocks/manual-adjust")
            .send({ productCode: "P001", publish: false });
        expect(res.statusCode).toBe(200);
        expect(saveSpy).toHaveBeenCalled();
        expect(saveSpy.mock.calls[0][0].publish).toBe(false);
        saveSpy.mockRestore();
    });

    test("POST /api/admin/stocks/manual-reserve は items 空で400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-reserve").send({ items: [] });
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/stocks/manual-reserve は失敗で400", async () => {
        jest.spyOn(stockService, "reserve").mockRejectedValueOnce(new Error("no stock"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-reserve").send({
            items: [{ productCode: "P001", quantity: 99999 }]
        });
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/stocks/manual-release は release 失敗で500", async () => {
        jest.spyOn(stockService, "release").mockRejectedValueOnce(new Error("release fail"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-release").send({
            items: [{ productCode: "P001", quantity: 1 }]
        });
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/kaitori/parse-excel は読込例外で500", async () => {
        jest.spyOn(excelReader, "readToObjects").mockRejectedValueOnce(new Error("bad xlsx"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const buf = Buffer.from([0x50, 0x4b, 3, 4]);
        const res = await admin.post("/api/admin/kaitori/parse-excel").attach("excelFile", buf, "x.xlsx");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/admin/kaitori/parse-excel は message 無し例外でも500", async () => {
        jest.spyOn(excelReader, "readToObjects").mockRejectedValueOnce(new Error(""));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const buf = Buffer.from([0x50, 0x4b, 3, 4]);
        const res = await admin.post("/api/admin/kaitori/parse-excel").attach("excelFile", buf, "y.xlsx");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/stocks/:productCode は無い商品で404", async () => {
        jest.spyOn(stockService, "getStock").mockResolvedValueOnce(null);
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/NOPE");
        expect(res.statusCode).toBe(404);
    });

    test("GET /api/admin/stocks/:productCode は取得例外で500", async () => {
        jest.spyOn(stockService, "getStock").mockRejectedValueOnce(new Error("db"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/P001");
        expect(res.statusCode).toBe(500);
    });
});
