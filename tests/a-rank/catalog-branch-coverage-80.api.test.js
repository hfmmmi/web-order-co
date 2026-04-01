/**
 * routes/products/catalogRoutes.js の残分岐（分岐80%向け）
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
const specialPriceService = require("../../services/specialPriceService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("Aランク: catalogRoutes 分岐80%向け", () => {
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

    test("GET /products は manufacturer のみ keyword マッチする", async () => {
        const products = await readJson("products.json");
        await writeJson("products.json", [
            ...products,
            {
                productCode: "P-MFG-ONLY",
                name: "ユニーク名隠し",
                manufacturer: "UniqueMfgKeywordOnly",
                category: "純正",
                basePrice: 500,
                stockStatus: "即納",
                active: true
            }
        ]);
        const rank = await readJson("rank_prices.json");
        rank["P-MFG-ONLY"] = { A: 400, B: 450 };
        await writeJson("rank_prices.json", rank);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=20&keyword=UniqueMfgKeywordOnly");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).some((p) => p.productCode === "P-MFG-ONLY")).toBe(true);
    });

    test("GET /products は page=2 で2ページ目を返す", async () => {
        const products = await readJson("products.json");
        const rank = await readJson("rank_prices.json");
        const extra = [];
        for (let i = 0; i < 12; i++) {
            const code = `P-PAGE-${i}`;
            extra.push({
                productCode: code,
                name: `ページ商品${i}`,
                manufacturer: "TestMaker",
                category: "純正",
                basePrice: 100 + i,
                stockStatus: "即納",
                active: true
            });
            rank[code] = { A: 100 + i, B: 110 + i };
        }
        await writeJson("products.json", [...products, ...extra]);
        await writeJson("rank_prices.json", rank);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=2&limit=10");
        expect(res.statusCode).toBe(200);
        expect(res.body.pagination.currentPage).toBe(2);
        expect(res.body.items.length).toBeGreaterThan(0);
    });

    test("GET /products/estimate は有効見積でマスタ一致商品を返す", async () => {
        await writeJson("estimates.json", [
            {
                estimateId: "EST-OK-80",
                customerId: "TEST001",
                productCode: "P001",
                productName: "テストトナーA",
                manufacturer: "TestMaker",
                unitPrice: 777,
                validUntil: "2035-12-31T00:00:00.000Z",
                subject: "件名テスト"
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate?estimateId=EST-OK-80");
        expect(res.statusCode).toBe(200);
        expect(res.body.items.length).toBe(1);
        expect(res.body.items[0].productCode).toBe("P001");
        expect(res.body.estimateInfo.subject).toBe("件名テスト");
    });

    test("GET /products/estimate はマスタにないコードでも見積から組み立てる", async () => {
        await writeJson("estimates.json", [
            {
                estimateId: "EST-ORPHAN",
                customerId: "TEST001",
                productCode: "NOMASTER99",
                productName: "カタログ外品",
                manufacturer: "外注メーカー",
                unitPrice: 333,
                validUntil: "2035-12-31T00:00:00.000Z",
                subject: "S"
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate?estimateId=EST-ORPHAN");
        expect(res.statusCode).toBe(200);
        expect(res.body.items[0].name).toBe("カタログ外品");
        expect(res.body.items[0].category).toBe("見積対象商品");
    });

    test("GET /products/estimate は getSpecialPrices 失敗時500", async () => {
        jest.spyOn(specialPriceService, "getSpecialPrices").mockRejectedValueOnce(new Error("db"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate?estimateId=ANY");
        expect(res.statusCode).toBe(500);
        specialPriceService.getSpecialPrices.mockRestore();
    });

    test("POST /cart-details は products 読込失敗で500", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const orig = await fs.readFile(productsPath, "utf-8");
        try {
            await fs.writeFile(productsPath, "{bad", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/cart-details").send({ cart: [{ productCode: "P001", quantity: 1 }] });
            expect(res.statusCode).toBe(500);
        } finally {
            await fs.writeFile(productsPath, orig, "utf-8");
        }
    });

    test("GET /products/frequent は明細が productCode のみでも集計する", async () => {
        await writeJson("orders.json", [
            {
                orderId: 88001,
                customerId: "TEST001",
                orderDate: "2025-08-01T00:00:00.000Z",
                status: "未発送",
                items: [{ productCode: "P002", quantity: 2 }],
                deliveryInfo: {}
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent?limit=10");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).some((p) => p.productCode === "P002")).toBe(true);
    });

    test("GET /products/frequent は active:false の商品を結果から除外する", async () => {
        await writeJson("orders.json", [
            {
                orderId: 88002,
                customerId: "TEST001",
                orderDate: "2025-08-02T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P-INACT", quantity: 1 }],
                deliveryInfo: {}
            }
        ]);
        const products = await readJson("products.json");
        await writeJson("products.json", [
            ...products.filter((p) => p.productCode !== "P-INACT"),
            {
                productCode: "P-INACT",
                name: "非アクティブ",
                manufacturer: "M",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: false
            }
        ]);
        const rank = await readJson("rank_prices.json");
        rank["P-INACT"] = { A: 100, B: 100 };
        await writeJson("rank_prices.json", rank);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent?limit=20");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).every((p) => p.productCode !== "P-INACT")).toBe(true);
    });

    test("GET /download-my-pricelist は最終価格0の行をCSVに含めない", async () => {
        const products = await readJson("products.json");
        await writeJson("products.json", [
            ...products,
            {
                productCode: "P-ZERO-PRICE",
                name: "ゼロ円表示",
                manufacturer: "M",
                category: "純正",
                basePrice: 0,
                stockStatus: "即納",
                active: true
            }
        ]);
        const rank = await readJson("rank_prices.json");
        rank["P-ZERO-PRICE"] = { A: 0, B: 0 };
        await writeJson("rank_prices.json", rank);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/download-my-pricelist");
        expect(res.statusCode).toBe(200);
        expect(res.text).not.toContain("P-ZERO-PRICE");
    });

    test("GET /download-my-pricelist は読込失敗で500", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const orig = await fs.readFile(productsPath, "utf-8");
        try {
            await fs.writeFile(productsPath, "{x", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/download-my-pricelist");
            expect(res.statusCode).toBe(500);
        } finally {
            await fs.writeFile(productsPath, orig, "utf-8");
        }
    });

    test("GET /products は keyword で商品コードにマッチする", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=20&keyword=P001");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).some((p) => p.productCode === "P001")).toBe(true);
    });

    test("GET /products は active:false の商品を除外する", async () => {
        const products = await readJson("products.json");
        await writeJson("products.json", [
            ...products,
            {
                productCode: "P-INACTIVE-LIST",
                name: "非表示",
                manufacturer: "M",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: false
            }
        ]);
        const rank = await readJson("rank_prices.json");
        rank["P-INACTIVE-LIST"] = { A: 100, B: 100 };
        await writeJson("rank_prices.json", rank);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=50&keyword=非表示");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).every((p) => p.productCode !== "P-INACTIVE-LIST")).toBe(true);
    });

    test("GET /products は rank_prices に無い商品を一覧に含めない", async () => {
        const products = await readJson("products.json");
        await writeJson("products.json", [
            ...products,
            {
                productCode: "P-NO-RANK-MAP",
                name: "ランク価格なし",
                manufacturer: "M",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            }
        ]);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=100&keyword=ランク価格なし");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).every((p) => p.productCode !== "P-NO-RANK-MAP")).toBe(true);
    });

    test("GET /products/estimate は該当なしのときメッセージ付き空配列", async () => {
        await writeJson("estimates.json", []);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate?estimateId=NO-SUCH-EST");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toEqual([]);
        expect(String(res.body.message || "")).toContain("該当");
    });

    test("POST /cart-details は cart が配列でないと400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({ cart: "not-array" });
        expect(res.statusCode).toBe(400);
    });

    test("POST /cart-details はマスタにない商品をスキップする", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent
            .post("/cart-details")
            .send({ cart: [{ productCode: "___UNKNOWN___", quantity: 1 }] });
        expect(res.statusCode).toBe(200);
        expect(res.body.cartDetails).toEqual([]);
    });

    test("GET /products/frequent は注文ゼロのときメッセージのみ", async () => {
        await writeJson("orders.json", []);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent?limit=5");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toEqual([]);
        expect(String(res.body.message || "")).toContain("注文履歴");
    });

    test("GET /products は rank_prices.json 欠落時も read の catch で継続する", async () => {
        const rankPath = path.join(DATA_ROOT, "rank_prices.json");
        const orig = await fs.readFile(rankPath, "utf-8");
        try {
            await fs.unlink(rankPath);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products?page=1&limit=5");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body.items)).toBe(true);
        } finally {
            await fs.writeFile(rankPath, orig, "utf-8");
        }
    });

    test("GET /products/frequent は orders.json 欠落時も空配列へフォールバックする", async () => {
        const ordersPath = path.join(DATA_ROOT, "orders.json");
        const orig = await fs.readFile(ordersPath, "utf-8");
        try {
            await fs.unlink(ordersPath);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products/frequent?limit=3");
            expect(res.statusCode).toBe(200);
            expect(res.body.items).toEqual([]);
        } finally {
            await fs.writeFile(ordersPath, orig, "utf-8");
        }
    });

    test("GET /products/frequent は同一商品の最新注文日を lastOrdered に使う", async () => {
        await writeJson("orders.json", [
            {
                orderId: 99001,
                customerId: "TEST001",
                orderDate: "2025-01-01T00:00:00.000Z",
                items: [{ code: "P001", quantity: 1 }]
            },
            {
                orderId: 99002,
                customerId: "TEST001",
                orderDate: "2026-03-15T12:00:00.000Z",
                items: [{ productCode: "P001", quantity: 2 }]
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent?limit=10");
        expect(res.statusCode).toBe(200);
        const p = (res.body.items || []).find((x) => x.productCode === "P001");
        expect(p && p.lastOrdered).toBeTruthy();
        expect(String(p.lastOrdered)).toContain("2026");
    });

    test("GET /products/frequent は明細にコードがない行を無視する", async () => {
        await writeJson("orders.json", [
            {
                orderId: 99003,
                customerId: "TEST001",
                orderDate: "2025-08-01T00:00:00.000Z",
                items: [{ quantity: 99 }, { code: "P002", quantity: 1 }]
            }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent?limit=10");
        expect(res.statusCode).toBe(200);
        expect((res.body.items || []).some((x) => x.productCode === "P002")).toBe(true);
    });

    test("GET /products/frequent は products.json 破損時500", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const orig = await fs.readFile(productsPath, "utf-8");
        try {
            await fs.writeFile(productsPath, "{not-json", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products/frequent?limit=5");
            expect(res.statusCode).toBe(500);
        } finally {
            await fs.writeFile(productsPath, orig, "utf-8");
        }
    });
});
