/**
 * 販管連携 API（ERP_SYNC_API_KEY）
 */
"use strict";

const request = require("supertest");
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData, readJson } = require("../helpers/testSandbox");

const INT_KEY = "jest-erp-sync-test-key";

describe("Aランク: integration-api（販管連携）", () => {
    let backup;
    let prevKey;

    beforeAll(async () => {
        backup = await backupDbFiles();
        prevKey = process.env.ERP_SYNC_API_KEY;
        process.env.ERP_SYNC_API_KEY = INT_KEY;
    });

    afterAll(async () => {
        process.env.ERP_SYNC_API_KEY = prevKey;
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("ERP_SYNC_API_KEY 未設定時は GET /api/integration/v1/orders が 503", async () => {
        const k = process.env.ERP_SYNC_API_KEY;
        delete process.env.ERP_SYNC_API_KEY;
        const res = await request(app).get("/api/integration/v1/orders").set("Authorization", `Bearer ${INT_KEY}`);
        process.env.ERP_SYNC_API_KEY = k;
        expect(res.statusCode).toBe(503);
        expect(res.body.success).toBe(false);
    });

    test("不正キーは 401", async () => {
        const res = await request(app)
            .get("/api/integration/v1/orders")
            .set("Authorization", "Bearer wrong-key");
        expect(res.statusCode).toBe(401);
    });

    test("X-Integration-Key で GET /api/integration/v1/orders が 200", async () => {
        const res = await request(app)
            .get("/api/integration/v1/orders")
            .set("X-Integration-Key", INT_KEY);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.orders)).toBe(true);
        expect(typeof res.body.count).toBe("number");
    });

    test("since で注文を絞れる", async () => {
        const res = await request(app)
            .get("/api/integration/v1/orders")
            .query({ since: "2099-01-01T00:00:00.000Z", limit: 10 })
            .set("Authorization", `Bearer ${INT_KEY}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(0);
    });

    test("POST /api/integration/v1/customers/patch で顧客を更新し冪等キーが効く", async () => {
        const patch = {
            customerId: "TEST001",
            customerName: "連携テスト名",
            email: "erp-sync-test@example.com",
            idempotencyKey: "key-erp-1"
        };
        const r1 = await request(app)
            .post("/api/integration/v1/customers/patch")
            .set("Authorization", `Bearer ${INT_KEY}`)
            .send(patch);
        expect(r1.statusCode).toBe(200);
        expect(r1.body.success).toBe(true);

        const customers = await readJson("customers.json");
        const row = customers.find((c) => c.customerId === "TEST001");
        expect(row.customerName).toBe("連携テスト名");
        expect(row.email).toBe("erp-sync-test@example.com");
        expect(row.erpSync && row.erpSync.lastIdempotencyKey).toBe("key-erp-1");

        const r2 = await request(app)
            .post("/api/integration/v1/customers/patch")
            .set("Authorization", `Bearer ${INT_KEY}`)
            .send(patch);
        expect(r2.statusCode).toBe(200);
        expect(r2.body.idempotent).toBe(true);
    });

    test("POST customers/patch は存在しない顧客で 400", async () => {
        const res = await request(app)
            .post("/api/integration/v1/customers/patch")
            .set("Authorization", `Bearer ${INT_KEY}`)
            .send({
                customerId: "NO_SUCH_USER",
                customerName: "x"
            });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("POST customers/patch はパッチ項目なしで 400", async () => {
        const res = await request(app)
            .post("/api/integration/v1/customers/patch")
            .set("Authorization", `Bearer ${INT_KEY}`)
            .send({ customerId: "TEST001" });
        expect(res.statusCode).toBe(400);
    });

    test("GET /api/integration/v1/customers が 200 でパスワードを含まない", async () => {
        const res = await request(app)
            .get("/api/integration/v1/customers")
            .query({ limit: 100 })
            .set("Authorization", `Bearer ${INT_KEY}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.customers)).toBe(true);
        if (res.body.customers.length > 0) {
            expect(res.body.customers[0].password).toBeUndefined();
            expect(res.body.customers[0].customerId).toBeDefined();
        }
    });

    test("GET /api/integration/v1/products が 200", async () => {
        const res = await request(app)
            .get("/api/integration/v1/products")
            .query({ limit: 50 })
            .set("Authorization", `Bearer ${INT_KEY}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.products)).toBe(true);
        expect(typeof res.body.count).toBe("number");
    });
});
