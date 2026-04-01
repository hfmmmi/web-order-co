/**
 * catalogRoutes: rank_prices.json 読込失敗時の .catch(() => "{}") 経路（POST /cart-details, GET /frequent, GET /download-my-pricelist）
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
const path = require("path");
const fs = require("fs").promises;
const { app } = require("../../server");
const { DATA_ROOT } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: catalogRoutes rank 欠落フォールバック", () => {
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

    test("POST /cart-details は rank_prices.json 欠落時も 200（ランクマップ空）", async () => {
        const rankPath = path.join(DATA_ROOT, "rank_prices.json");
        const orig = await fs.readFile(rankPath, "utf-8");
        try {
            await fs.unlink(rankPath);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/cart-details").send({ cart: [{ productCode: "P001", quantity: 1 }] });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        } finally {
            await fs.writeFile(rankPath, orig, "utf-8");
        }
    });

    test("GET /products/frequent は rank_prices.json 欠落時も 200", async () => {
        const rankPath = path.join(DATA_ROOT, "rank_prices.json");
        const orig = await fs.readFile(rankPath, "utf-8");
        try {
            await fs.unlink(rankPath);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products/frequent?limit=5");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body.items)).toBe(true);
        } finally {
            await fs.writeFile(rankPath, orig, "utf-8");
        }
    });

    test("GET /download-my-pricelist は rank_prices.json 欠落時も CSV を返す", async () => {
        const rankPath = path.join(DATA_ROOT, "rank_prices.json");
        const orig = await fs.readFile(rankPath, "utf-8");
        try {
            await fs.unlink(rankPath);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/download-my-pricelist");
            expect(res.statusCode).toBe(200);
            expect(String(res.text || "")).toContain("商品コード");
        } finally {
            await fs.writeFile(rankPath, orig, "utf-8");
        }
    });
});
