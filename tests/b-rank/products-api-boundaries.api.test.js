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
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Bランク: 商品API境界", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
    });

    test("products は未ログインで401", async () => {
        const res = await request(app).get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(401);
    });

    test("products/estimate はestimateId未指定で400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const res = await agent.get("/products/estimate");
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("見積番号");
    });

    test("products/estimate は該当なしで空itemsとメッセージを返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const res = await agent.get("/products/estimate?estimateId=NOEXIST123");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items.length).toBe(0);
        expect(res.body.message).toBeTruthy();
    });

    test("GET /products は keyword で検索できる", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10&keyword=トナー");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.pagination).toBeDefined();
    });

    test("GET /products/frequent はログイン顧客でよく注文する商品を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(Array.isArray(res.body.items)).toBe(true);
    });

    test("GET /products/frequent は未ログインで401", async () => {
        const res = await request(app).get("/products/frequent");
        expect(res.statusCode).toBe(401);
    });

    test("GET /cart-details はログイン顧客でカート詳細を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({ cart: [{ productCode: "P001", quantity: 1 }] });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("cartDetails");
        expect(Array.isArray(res.body.cartDetails)).toBe(true);
    });

    test("GET /products は keyword で0件でも 200 と items/pagination を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10&keyword=存在しない商品名xyz999");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items.length).toBe(0);
        expect(res.body.pagination).toBeDefined();
    });

    test("POST /cart-details は不正 productCode でも 200 で cartDetails を返す（該当なしはマスタから補完）", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({ cart: [{ productCode: "INVALID_CODE_999", quantity: 1 }] });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("cartDetails");
        expect(Array.isArray(res.body.cartDetails)).toBe(true);
    });

    // 第2期Phase2: products-api 分岐強化（DATA_DIR 時は DATA_ROOT の rank_prices を破損させる）
    test("GET /products は rank_prices.json 破損時（parse失敗）に500を返す", async () => {
        const rankPath = path.join(DATA_ROOT, "rank_prices.json");
        const orig = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
        try {
            await fs.writeFile(rankPath, "{invalid", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products?page=1&limit=10");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("読み込みに失敗");
        } finally {
            await fs.writeFile(rankPath, orig, "utf-8");
        }
    });

    test("GET /products/frequent は limit パラメータで件数制限する", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products/frequent?limit=5");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items.length).toBeLessThanOrEqual(5);
    });

    test("POST /cart-details は cart が配列でない場合 400 を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.post("/cart-details").send({ cart: "not-array" });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("Invalid");
    });

    // Phase 5: 未カバー分岐（在庫非公開・keyword空・読込失敗・frequent空・download失敗）
    // 第2期Phase2: GET /products の filter で active === false の商品を除外する分岐
    test("GET /products は active:false の商品を一覧に含めない", async () => {
        const products = await readJson("products.json");
        const inactive = { productCode: "P-INACTIVE", name: "非表示商品", manufacturer: "Test", category: "テスト", basePrice: 0, stockStatus: "取寄", active: false };
        await writeJson("products.json", [...products, inactive]);
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=50");
        expect(res.statusCode).toBe(200);
        const found = (res.body.items || []).find((p) => p.productCode === "P-INACTIVE");
        expect(found).toBeUndefined();
    });

    test("GET /products は keyword なしで全件検索（フィルタなし分岐）", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(res.body.pagination).toBeDefined();
        expect(res.body.stockUi).toBeDefined();
    });

    test("GET /products は products.json 読込失敗時500を返す", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const orig = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
        try {
            await fs.writeFile(productsPath, "{invalid", "utf-8");
            const content = await fs.readFile(productsPath, "utf-8");
            expect(content).toBe("{invalid");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products?page=1&limit=10");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("読み込みに失敗");
        } finally {
            await fs.writeFile(productsPath, orig, "utf-8");
        }
    });

    // 第2期Phase2: getStockContext 失敗時（stockService が reject）は500を返す分岐
    test("GET /products は getStockContext（在庫取得）失敗時500を返す", async () => {
        const stockService = require("../../services/stockService");
        jest.spyOn(stockService, "getAllStocks").mockRejectedValueOnce(new Error("在庫読込失敗"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(500);
        expect(res.body.message).toContain("読み込みに失敗");
        stockService.getAllStocks.mockRestore();
    });

    test("GET /products は getDisplaySettings 失敗時500を返す", async () => {
        const stockService = require("../../services/stockService");
        jest.spyOn(stockService, "getDisplaySettings").mockRejectedValueOnce(new Error("設定読込失敗"));
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(500);
        expect(res.body.message).toContain("読み込みに失敗");
        stockService.getDisplaySettings.mockRestore();
    });

    // 第2期Phase2: rank_prices 読込が reject した場合の .catch(() => "{}") 分岐（200で空ランク価格で続行）
    test("GET /products は rank_prices 読込失敗時も空オブジェクトで200を返す", async () => {
        const fsMod = require("fs").promises;
        const origRead = fsMod.readFile;
        jest.spyOn(fsMod, "readFile").mockImplementation((filePath, ...args) => {
            if (typeof filePath === "string" && filePath.includes("rank_prices.json")) {
                return Promise.reject(new Error("ENOENT"));
            }
            return origRead.call(fsMod, filePath, ...args);
        });
        try {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products?page=1&limit=10");
            expect(res.statusCode).toBe(200);
            expect(res.body.items).toBeDefined();
            expect(Array.isArray(res.body.items)).toBe(true);
        } finally {
            fsMod.readFile.mockRestore();
        }
    });

    // 第2期Phase2: buildStockInfo の productCode が空の分岐（visible:false, message）
    test("GET /products は productCode が空の商品で stockInfo.visible が false になる", async () => {
        const products = await readJson("products.json");
        const emptyCode = { productCode: "", name: "空コード商品", manufacturer: "Test", category: "テスト", basePrice: 0, stockStatus: "取寄", active: true };
        await writeJson("products.json", [...products, emptyCode]);
        // 一覧は rank_prices に存在する商品のみ返すため、空コード用のエントリを追加
        const rankPrices = await readJson("rank_prices.json");
        await writeJson("rank_prices.json", { ...rankPrices, "": { A: 0 } });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=50");
        expect(res.statusCode).toBe(200);
        const emptyItem = (res.body.items || []).find((p) => p.productCode === "");
        expect(emptyItem).toBeDefined();
        expect(emptyItem.stockInfo).toBeDefined();
        expect(emptyItem.stockInfo.visible).toBe(false);
        expect(emptyItem.stockInfo.message).toBeDefined();
    });

    // 第2期Phase2: buildStockInfo の stock.warehouses が配列でない場合の分岐（[] に正規化）
    test("GET /products は stock.warehouses が配列でなくても stockInfo.warehouses は配列で返る", async () => {
        await writeJson("stocks.json", [{ productCode: "P001", totalQty: 5, reservedQty: 0, publish: true, warehouses: {} }]);
        const stockService = require("../../services/stockService");
        jest.spyOn(stockService, "getDisplaySettings").mockResolvedValueOnce({
            enabled: true, hiddenMessage: "非公開", showStocklessLabel: true, stocklessLabel: "直送",
            allowOrderingWhenZero: true, highlightThresholdMinutes: 180, warehousePresets: []
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(200);
        const p001 = (res.body.items || []).find((p) => p.productCode === "P001");
        expect(p001).toBeDefined();
        expect(Array.isArray(p001.stockInfo.warehouses)).toBe(true);
        stockService.getDisplaySettings.mockRestore();
    });

    // 第2期Phase2: buildStockUiConfig の showStocklessLabel/allowOrderingWhenZero が false の分岐
    test("GET /products は stockUi に showStocklessLabel false を返せる", async () => {
        const stockService = require("../../services/stockService");
        jest.spyOn(stockService, "getDisplaySettings").mockResolvedValueOnce({
            enabled: false, hiddenMessage: "非公開", showStocklessLabel: false, stocklessLabel: "直送",
            allowOrderingWhenZero: false, highlightThresholdMinutes: 120, warehousePresets: []
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(200);
        expect(res.body.stockUi).toBeDefined();
        expect(res.body.stockUi.showStocklessLabel).toBe(false);
        expect(res.body.stockUi.allowOrderingWhenZero).toBe(false);
        stockService.getDisplaySettings.mockRestore();
    });

    // 第2期Phase2: buildStockInfo の lastSyncedAt ありで isNaN(synced) の分岐（isStale を更新しない）
    test("GET /products は lastSyncedAt が不正日付でも stockInfo を返す", async () => {
        await writeJson("stocks.json", [{ productCode: "P001", totalQty: 5, reservedQty: 0, publish: true, lastSyncedAt: "invalid-date" }]);
        const stockService = require("../../services/stockService");
        jest.spyOn(stockService, "getDisplaySettings").mockResolvedValueOnce({
            enabled: true, hiddenMessage: "非公開", showStocklessLabel: true, stocklessLabel: "直送",
            allowOrderingWhenZero: true, highlightThresholdMinutes: 180, warehousePresets: []
        });
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(200);
        const p001 = (res.body.items || []).find((p) => p.productCode === "P001");
        expect(p001).toBeDefined();
        expect(p001.stockInfo.visible).toBe(true);
        expect(p001.stockInfo.isStale).toBe(false);
        stockService.getDisplaySettings.mockRestore();
    });

    test("GET /products/frequent は注文履歴がまだない場合に空itemsとメッセージを返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const ordersPath = path.join(DATA_ROOT, "orders.json");
        const origOrders = await fs.readFile(ordersPath, "utf-8").catch(() => "[]");
        try {
            await fs.writeFile(ordersPath, "[]", "utf-8");
            const res = await agent.get("/products/frequent");
            expect(res.statusCode).toBe(200);
            expect(res.body.items).toEqual([]);
            expect(res.body.message).toContain("まだ注文履歴がありません");
        } finally {
            await fs.writeFile(ordersPath, origOrders, "utf-8");
        }
    });

    // 第2期Phase4 分岐70%: GET /products/frequent の getStockContext 失敗時 catch 500 分岐（注文履歴ありで getStockContext を呼ぶ経路を通す）
    test("GET /products/frequent は getStockContext 失敗時500を返す", async () => {
        const ordersPath = path.join(DATA_ROOT, "orders.json");
        const origOrders = await readJson("orders.json").catch(() => []);
        await writeJson("orders.json", [
            { orderId: 1, customerId: "TEST001", orderDate: "2025-01-01", items: [{ code: "P001", quantity: 1 }] }
        ]);
        const stockService = require("../../services/stockService");
        const spy = jest.spyOn(stockService, "getDisplaySettings").mockRejectedValueOnce(new Error("DB"));
        try {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products/frequent");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("データの取得に失敗");
        } finally {
            spy.mockRestore();
            await writeJson("orders.json", origOrders);
        }
    });

    test("GET /download-my-pricelist は未ログインで401", async () => {
        const res = await request(app).get("/download-my-pricelist");
        expect(res.statusCode).toBe(401);
    });

    test("GET /download-my-pricelist は products.json 読込失敗時500を返す", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const orig = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        try {
            await fs.writeFile(productsPath, "{invalid", "utf-8");
            const res = await agent.get("/download-my-pricelist");
            expect(res.statusCode).toBe(500);
        } finally {
            await fs.writeFile(productsPath, orig, "utf-8");
        }
    });

    test("POST /cart-details は商品DB読込失敗時500を返す", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const orig = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        try {
            await fs.writeFile(productsPath, "{invalid", "utf-8");
            const res = await agent.post("/cart-details").send({ cart: [{ productCode: "P001", quantity: 1 }] });
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
        } finally {
            await fs.writeFile(productsPath, orig, "utf-8");
        }
    });

    // estimate ルートの catch 500: estimateItems が1件以上ある場合に productData を読むため、見積1件＋products 破損で 500
    test("GET /products/estimate は見積ありで productData 読込失敗時500を返す", async () => {
        const productsPath = path.join(DATA_ROOT, "products.json");
        const estimatesPath = path.join(DATA_ROOT, "estimates.json");
        const origProducts = await fs.readFile(productsPath, "utf-8").catch(() => "[]");
        const origEstimates = await fs.readFile(estimatesPath, "utf-8").catch(() => "[]");
        try {
            await fs.writeFile(estimatesPath, JSON.stringify([{
                estimateId: "EST500",
                customerId: "TEST001",
                productCode: "P001",
                productName: "テスト",
                unitPrice: 1000,
                validUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                subject: "Test"
            }], null, 2), "utf-8");
            await fs.writeFile(productsPath, "{invalid", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/products/estimate?estimateId=EST500");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("エラーが発生");
        } finally {
            await fs.writeFile(productsPath, origProducts, "utf-8");
            await fs.writeFile(estimatesPath, origEstimates, "utf-8");
        }
    });
});
