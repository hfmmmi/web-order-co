jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    writeJson
} = require("../helpers/testSandbox");

describe("Bランク: 在庫表示組合せAPI", () => {
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

    test("publish・warehousePresets・stale判定を組み合わせて正しく返す", async () => {
        const stockService = require("../../services/stockService");
        await stockService.updateDisplaySettings({
            enabled: true,
            hiddenMessage: "在庫情報は非公開です",
            showStocklessLabel: true,
            stocklessLabel: "仕入先直送",
            allowOrderingWhenZero: true,
            highlightThresholdMinutes: 60,
            warehousePresets: [
                { code: "NAGANO", name: "長野倉庫" },
                { code: "OSAKA", name: "大阪倉庫" }
            ]
        });
        await writeJson("config/stocks-adapters.json", {
            version: 1,
            updatedAt: new Date().toISOString(),
            display: {
                enabled: true,
                hiddenMessage: "在庫情報は非公開です",
                showStocklessLabel: true,
                stocklessLabel: "仕入先直送",
                allowOrderingWhenZero: true,
                highlightThresholdMinutes: 60,
                warehousePresets: [
                    { code: "NAGANO", name: "長野倉庫" },
                    { code: "OSAKA", name: "大阪倉庫" }
                ]
            },
            adapters: []
        });
        await writeJson("stocks.json", [
            {
                productCode: "P001",
                totalQty: 10,
                reservedQty: 2,
                publish: true,
                hiddenMessage: "",
                lastSyncedAt: new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString(),
                source: "manual",
                manualLock: false,
                warehouses: [
                    { code: "NAGANO", name: "倉庫A", qty: 6 },
                    { code: "OSAKA", name: "倉庫B", qty: 4 }
                ]
            },
            {
                productCode: "P002",
                totalQty: 5,
                reservedQty: 1,
                publish: false,
                hiddenMessage: "この商品は在庫非公開です",
                lastSyncedAt: new Date().toISOString(),
                source: "manual",
                manualLock: false,
                warehouses: [{ code: "NAGANO", name: "倉庫A", qty: 5 }]
            }
        ]);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");

        expect(res.statusCode).toBe(200);
        expect(res.body.stockUi.enabled).toBe(true);
        const p1 = res.body.items.find((p) => p.productCode === "P001");
        const p2 = res.body.items.find((p) => p.productCode === "P002");
        expect(p1).toBeTruthy();
        expect(p2).toBeTruthy();

        expect(p1.stockInfo.visible).toBe(true);
        expect(p1.stockInfo.publish).toBe(true);
        expect(p1.stockInfo.availableQty).toBe(8);
        expect(p1.stockInfo.isStale).toBe(true);
        expect(p1.stockInfo.warehouses.map((w) => w.name)).toEqual(["長野倉庫", "大阪倉庫"]);

        expect(p2.stockInfo.visible).toBe(false);
        expect(p2.stockInfo.publish).toBe(false);
        expect(p2.stockInfo.message).toContain("在庫非公開");
    });

    test("stockUi.enabled=false のとき在庫表示を抑止する", async () => {
        await writeJson("config/stocks-adapters.json", {
            version: 1,
            updatedAt: null,
            display: {
                enabled: false,
                hiddenMessage: "仕入先直送のため在庫表示は行っておりません",
                showStocklessLabel: true,
                stocklessLabel: "仕入先直送",
                allowOrderingWhenZero: true,
                highlightThresholdMinutes: 180,
                warehousePresets: []
            },
            adapters: []
        });
        await writeJson("stocks.json", [
            {
                productCode: "P001",
                totalQty: 10,
                reservedQty: 0,
                publish: true,
                hiddenMessage: "",
                lastSyncedAt: new Date().toISOString(),
                source: "manual",
                manualLock: false,
                warehouses: []
            }
        ]);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");
        expect(res.statusCode).toBe(200);
        expect(res.body.stockUi.enabled).toBe(false);

        const p1 = res.body.items.find((p) => p.productCode === "P001");
        expect(p1.stockInfo.visible).toBe(false);
        expect(p1.stockInfo.publish).toBe(false);
        expect(p1.stockInfo.message).toContain("在庫表示");
    });

    test("lastSyncedAt 不正値/null と倉庫コード未定義、reservedQty>totalQty を安全に処理する", async () => {
        await writeJson("config/stocks-adapters.json", {
            version: 1,
            updatedAt: null,
            display: {
                enabled: true,
                hiddenMessage: "在庫情報は非公開です",
                showStocklessLabel: true,
                stocklessLabel: "仕入先直送",
                allowOrderingWhenZero: true,
                highlightThresholdMinutes: 180,
                warehousePresets: [
                    { code: "KNOWN", name: "既知倉庫" }
                ]
            },
            adapters: []
        });

        await writeJson("stocks.json", [
            {
                productCode: "P001",
                totalQty: 10,
                reservedQty: 20,
                publish: true,
                hiddenMessage: "",
                lastSyncedAt: "not-a-date",
                source: "manual",
                manualLock: false,
                warehouses: [
                    { code: "UNKNOWN", name: "", qty: 3 }
                ]
            },
            {
                productCode: "P002",
                totalQty: 5,
                reservedQty: 0,
                publish: true,
                hiddenMessage: "",
                lastSyncedAt: null,
                source: "manual",
                manualLock: false,
                warehouses: [
                    { code: "KNOWN", name: "任意名", qty: 5 }
                ]
            }
        ]);

        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/products?page=1&limit=10");

        expect(res.statusCode).toBe(200);
        const p1 = res.body.items.find((p) => p.productCode === "P001");
        const p2 = res.body.items.find((p) => p.productCode === "P002");
        expect(p1).toBeTruthy();
        expect(p2).toBeTruthy();

        // reservedQty > totalQty でも availableQty は負数にならない
        expect(p1.stockInfo.totalQty).toBe(10);
        expect(p1.stockInfo.reservedQty).toBe(20);
        expect(p1.stockInfo.availableQty).toBe(0);

        // 不正日時・null は stale 強調を行わない（false固定）
        expect(p1.stockInfo.lastSyncedAt).toBe("not-a-date");
        expect(p1.stockInfo.isStale).toBe(false);
        expect(p2.stockInfo.lastSyncedAt).toBeNull();
        expect(p2.stockInfo.isStale).toBe(false);

        // 倉庫コードが presets 未定義の場合は code へフォールバック
        expect(p1.stockInfo.warehouses[0].name).toBe("UNKNOWN");
        // presets 定義済みコードは表示名を presets 優先
        expect(p2.stockInfo.warehouses[0].name).toBe("既知倉庫");
    });
});
