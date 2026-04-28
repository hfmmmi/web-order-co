/**
 * routes/products/catalogRoutes.js … 未ログイン 401 分岐
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
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: catalogRoutes 未認証", () => {
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

    test("GET /products は未ログインで401", async () => {
        const res = await request(app).get("/products?page=1&limit=5");
        expect(res.statusCode).toBe(401);
    });

    test("GET /products/estimate は未ログインで401", async () => {
        const res = await request(app).get("/products/estimate?estimateId=E1");
        expect(res.statusCode).toBe(401);
    });

    test("GET /products/frequent は未ログインで401", async () => {
        const res = await request(app).get("/products/frequent?limit=5");
        expect(res.statusCode).toBe(401);
    });

    test("POST /cart-details は未ログインで401", async () => {
        const res = await request(app).post("/cart-details").send({ cart: [] });
        expect(res.statusCode).toBe(401);
    });

    test("GET /download-my-pricelist は未ログインで401", async () => {
        const res = await request(app).get("/download-my-pricelist");
        expect(res.statusCode).toBe(401);
    });

    test("GET /my-pricelist-data は未ログインで401", async () => {
        const res = await request(app).get("/my-pricelist-data");
        expect(res.statusCode).toBe(401);
    });
});
