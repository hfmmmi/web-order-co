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
const productService = require("../../services/productService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("branch coverage 90: admin productsRoutes", () => {
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

    test("GET /api/admin/product-master/template は失敗時500", async () => {
        jest.spyOn(productService, "getProductTemplateBuffer").mockRejectedValueOnce(new Error("tpl"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/product-master/template");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/product-master/export は失敗時500", async () => {
        jest.spyOn(productService, "getProductMasterExportBuffer").mockRejectedValueOnce(new Error("exp"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/product-master/export");
        expect(res.statusCode).toBe(500);
    });

    test("POST /api/upload-product-data は importProductCsv 失敗を JSON で返す", async () => {
        jest.spyOn(productService, "importProductCsv").mockRejectedValueOnce(new Error("csv bad"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/upload-product-data").send({ fileData: "a" });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("csv bad");
    });

    test("GET /api/admin/products は getAllProducts 失敗時500", async () => {
        jest.spyOn(productService, "getAllProducts").mockRejectedValueOnce(new Error("read"));
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/products");
        expect(res.statusCode).toBe(500);
    });
});
