"use strict";

/**
 * catalogRoutes: 価格表DL・頻繁購入・カートエラー・見積フォールバック等
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData, readJson, writeJson } = require("../helpers/testSandbox");

describe("分岐90向け: catalog 価格表・頻度・カート", () => {
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

    test("GET /download-my-pricelist はログインで CSV", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/download-my-pricelist");
        expect(res.status).toBe(200);
        expect(String(res.headers["content-type"] || "")).toMatch(/csv/);
        expect(res.text).toContain("商品コード");
    });

    test("GET /download-my-pricelist は読込失敗で500", async () => {
        const fsp = require("fs").promises;
        const origRead = jest.requireActual("fs").promises.readFile;
        jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("products.json")) {
                throw new Error("eio");
            }
            return origRead(p, enc);
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/download-my-pricelist");
        expect(res.status).toBe(500);
    });

    test("GET /products/frequent は注文履歴ありで items を返す", async () => {
        const orders = await readJson("orders.json");
        orders.push({
            orderId: "O-FREQ-1",
            customerId: "TEST001",
            orderDate: new Date().toISOString(),
            items: [{ code: "P001", productCode: "P001", quantity: 2 }]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 5 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items.length).toBeGreaterThan(0);
    });

    test("GET /products/frequent は内部エラーで500", async () => {
        const fsp = require("fs").promises;
        const origRead = jest.requireActual("fs").promises.readFile;
        jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("products.json")) {
                throw new Error("eio");
            }
            return origRead(p, enc);
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent");
        expect(res.status).toBe(500);
    });

    test("POST /cart-details は読込失敗で500", async () => {
        const fsp = require("fs").promises;
        const origRead = jest.requireActual("fs").promises.readFile;
        jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("prices.json")) {
                throw new Error("eio");
            }
            return origRead(p, enc);
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({
            cart: [{ productCode: "P001", quantity: 1 }]
        });
        expect(res.status).toBe(500);
    });

    test("GET /products/estimate は見積行にマスタ無しでもフォールバックで返す", async () => {
        const estimates = await readJson("estimates.json");
        const row = {
            estimateId: "EST-GAP90",
            customerId: "TEST001",
            productCode: "NOMASTER99",
            productName: "見積のみ商品",
            manufacturer: "Mkr",
            unitPrice: 500,
            validUntil: "2099-12-31",
            subject: "件名テスト"
        };
        estimates.push(row);
        await writeJson("estimates.json", estimates);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate").query({ estimateId: "EST-GAP90" });
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeGreaterThanOrEqual(1);
        expect(res.body.items[0].productCode).toBe("NOMASTER99");
    });

    test("GET /products は priceRank 空の顧客でも一覧取得できる", async () => {
        const customers = await readJson("customers.json");
        const pw = customers.find((c) => c.customerId === "TEST001").password;
        customers.push({
            customerId: "TESTNORANK",
            password: pw,
            customerName: "ランクなし",
            priceRank: "",
            email: "norank@example.com"
        });
        await writeJson("customers.json", customers);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TESTNORANK", pass: "CustPass123!" });
        const res = await agent.get("/products").query({ page: 1, limit: 5 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
    });

    test("GET /products/estimate は manufacturer・subject 省略でも返す", async () => {
        const estimates = await readJson("estimates.json");
        estimates.push({
            estimateId: "EST-MINFLD",
            customerId: "TEST001",
            productCode: "NOMASTER98",
            productName: "最小フィールド",
            unitPrice: 100,
            validUntil: ""
        });
        await writeJson("estimates.json", estimates);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate").query({ estimateId: "EST-MINFLD" });
        expect(res.status).toBe(200);
        expect(res.body.items[0].manufacturer).toBe("見積品");
        expect(res.body.estimateInfo.subject).toBe("");
    });

    test("POST /cart-details は stockStatus 無し商品を取寄として返す", async () => {
        const products = await readJson("products.json");
        products.push({
            productCode: "PNOSTK",
            name: "在庫表示なし",
            manufacturer: "M",
            category: "純正",
            basePrice: 100,
            active: true
        });
        await writeJson("products.json", products);
        const rp = await readJson("rank_prices.json");
        rp.PNOSTK = { A: 120, B: 130 };
        await writeJson("rank_prices.json", rp);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({
            cart: [{ productCode: "PNOSTK", quantity: 1 }]
        });
        expect(res.status).toBe(200);
        expect(res.body.cartDetails[0].stockStatus).toBe("取寄");
    });

    test("GET /products/frequent は code 無しで productCode のみ集計する", async () => {
        const orders = await readJson("orders.json");
        orders.push({
            orderId: "O-FREQ-CODE",
            customerId: "TEST001",
            orderDate: new Date().toISOString(),
            items: [{ productCode: "P002", quantity: 3 }]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 10 });
        expect(res.status).toBe(200);
        const p2 = res.body.items.find((x) => x.productCode === "P002");
        expect(p2).toBeDefined();
        expect(p2.totalOrderedQty).toBeGreaterThanOrEqual(3);
    });

    test("GET /products/frequent は明細の quantity 省略を1として数える", async () => {
        const orders = await readJson("orders.json");
        orders.push({
            orderId: "O-FREQ-QTY",
            customerId: "TEST001",
            orderDate: new Date().toISOString(),
            items: [{ code: "P001" }]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 20 });
        expect(res.status).toBe(200);
        const p1 = res.body.items.find((x) => x.productCode === "P001");
        expect(p1).toBeDefined();
        expect(p1.totalOrderedQty).toBeGreaterThanOrEqual(1);
    });

    test("GET /products/frequent は明細が code のみでも productCode 同様に集計する", async () => {
        const orders = await readJson("orders.json");
        orders.push({
            orderId: "O-FREQ-CODEONLY",
            customerId: "TEST001",
            orderDate: new Date().toISOString(),
            items: [{ code: "P002", quantity: 5 }]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 15 });
        expect(res.status).toBe(200);
        const p2 = res.body.items.find((x) => x.productCode === "P002");
        expect(p2).toBeDefined();
    });

    test("GET /products/estimate はマスタにある商品コードならマスタ情報を優先", async () => {
        const estimates = await readJson("estimates.json");
        estimates.push({
            estimateId: "EST-HASMASTER",
            customerId: "TEST001",
            productCode: "P001",
            productName: "見積名よりマスタ優先",
            unitPrice: 777,
            validUntil: "2099-06-01",
            subject: "S",
            manufacturer: "見積メーカー"
        });
        await writeJson("estimates.json", estimates);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/estimate").query({ estimateId: "EST-HASMASTER" });
        expect(res.status).toBe(200);
        expect(res.body.items[0].name).toBe("テストトナーA");
        expect(res.body.items[0].manufacturer).toBe("TestMaker");
    });

    test("GET /products/frequent は注文JSON読込失敗時は空履歴メッセージ", async () => {
        const fsp = require("fs").promises;
        const origRead = jest.requireActual("fs").promises.readFile;
        jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("orders.json")) {
                throw new Error("eio");
            }
            return origRead(p, enc);
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent");
        expect(res.status).toBe(200);
        expect(res.body.items).toEqual([]);
        expect(String(res.body.message || "")).toMatch(/履歴/);
        jest.restoreAllMocks();
    });

    test("GET /products/frequent は非アクティブ商品を結果から除く", async () => {
        const products = await readJson("products.json");
        const p = products.find((x) => x.productCode === "P002");
        p.active = false;
        await writeJson("products.json", products);
        const orders = await readJson("orders.json");
        orders.push({
            orderId: "O-FREQ-INA",
            customerId: "TEST001",
            orderDate: new Date().toISOString(),
            items: [{ code: "P002", quantity: 1 }]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 20 });
        expect(res.status).toBe(200);
        expect(res.body.items.every((x) => x.productCode !== "P002")).toBe(true);
    });

    test("GET /download-my-pricelist はメーカー・規格が無い商品も空欄で出力する", async () => {
        const products = await readJson("products.json");
        products.push({
            productCode: "PNOFIELD",
            name: "フィールド無し",
            category: "純正",
            basePrice: 500,
            stockStatus: "即納",
            active: true
        });
        await writeJson("products.json", products);
        const rp = await readJson("rank_prices.json");
        rp.PNOFIELD = { A: 400, B: 450 };
        await writeJson("rank_prices.json", rp);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/download-my-pricelist");
        expect(res.status).toBe(200);
        expect(res.text).toContain("PNOFIELD");
        const line = res.text.split("\n").find((l) => l.startsWith("PNOFIELD"));
        expect(line).toBeDefined();
        expect(line.split(",").length).toBeGreaterThanOrEqual(5);
    });

    async function ensureTestNoRank() {
        const customers = await readJson("customers.json");
        if (!customers.some((c) => c.customerId === "TESTNORANK")) {
            const pw = customers.find((c) => c.customerId === "TEST001").password;
            customers.push({
                customerId: "TESTNORANK",
                password: pw,
                customerName: "ランクなし",
                priceRank: "",
                email: "norank@example.com"
            });
            await writeJson("customers.json", customers);
        }
    }

    test("POST /cart-details は priceRank 空のセッションでも計算できる", async () => {
        await ensureTestNoRank();
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TESTNORANK", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({
            cart: [{ productCode: "P001", quantity: 1 }]
        });
        expect(res.status).toBe(200);
        expect(res.body.cartDetails[0].price).toBeGreaterThanOrEqual(0);
    });

    test("GET /products/frequent は priceRank 空でも履歴から返す", async () => {
        await ensureTestNoRank();
        const orders = await readJson("orders.json");
        orders.push({
            orderId: "O-FREQ-NR",
            customerId: "TESTNORANK",
            orderDate: new Date().toISOString(),
            items: [{ productCode: "P001", quantity: 1 }]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TESTNORANK", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 5 });
        expect(res.status).toBe(200);
        expect(res.body.items.some((x) => x.productCode === "P001")).toBe(true);
    });

    test("GET /download-my-pricelist は category 無し商品の規格欄を空に近い形で出す", async () => {
        const products = await readJson("products.json");
        products.push({
            productCode: "PNOCAT",
            name: "規格省略",
            manufacturer: "MK",
            basePrice: 300,
            stockStatus: "即納",
            active: true
        });
        await writeJson("products.json", products);
        const rp = await readJson("rank_prices.json");
        rp.PNOCAT = { A: 250, B: 260 };
        await writeJson("rank_prices.json", rp);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/download-my-pricelist");
        expect(res.status).toBe(200);
        expect(res.text).toContain("PNOCAT");
    });

    test("GET /products/frequent は明細に code キーが無く productCode のみでも集計", async () => {
        const orders = await readJson("orders.json");
        const line = Object.create(null);
        line.productCode = "P001";
        line.quantity = 4;
        orders.push({
            orderId: "O-PRODONLY",
            customerId: "TEST001",
            orderDate: new Date().toISOString(),
            items: [line]
        });
        await writeJson("orders.json", orders);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent").query({ limit: 25 });
        expect(res.status).toBe(200);
        const p1 = res.body.items.find((x) => x.productCode === "P001");
        expect(p1).toBeDefined();
    });

    test("GET /download-my-pricelist は最終価格0の行をCSVから省く", async () => {
        const products = await readJson("products.json");
        products.push({
            productCode: "PZERO",
            name: "零円特価",
            manufacturer: "M",
            category: "純正",
            basePrice: 999,
            stockStatus: "即納",
            active: true
        });
        await writeJson("products.json", products);
        const rp = await readJson("rank_prices.json");
        rp.PZERO = { A: 1, B: 1 };
        await writeJson("rank_prices.json", rp);
        const prices = await readJson("prices.json");
        prices.push({ customerId: "TEST001", productCode: "PZERO", specialPrice: 0 });
        await writeJson("prices.json", prices);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/download-my-pricelist");
        expect(res.status).toBe(200);
        expect(res.text).not.toContain("PZERO");
    });
});
