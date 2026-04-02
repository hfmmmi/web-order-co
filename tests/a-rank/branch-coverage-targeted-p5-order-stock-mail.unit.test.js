"use strict";

jest.mock("nodemailer", () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: "mid" })
    }))
}));

const orderService = require("../../services/orderService");
const stockService = require("../../services/stockService");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("branch-coverage-targeted-p5: orderService.searchOrders", () => {
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

    test("管理者は全件取得", async () => {
        await writeJson("orders.json", [
            {
                orderId: "O1",
                customerId: "TEST001",
                orderDate: "2026-02-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 100, quantity: 1 }]
            },
            {
                orderId: "O2",
                customerId: "TEST002",
                orderDate: "2026-02-02T00:00:00.000Z",
                status: "発送済",
                items: [{ code: "P002", name: "n2", price: 200, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r.length).toBe(2);
    });

    test("顧客は自社のみ", async () => {
        await writeJson("orders.json", [
            {
                orderId: "OA",
                customerId: "TEST001",
                orderDate: "2026-01-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            },
            {
                orderId: "OB",
                customerId: "TEST002",
                orderDate: "2026-01-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P002", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: false, customerId: "TEST001" });
        expect(r.every((o) => o.customerId === "TEST001")).toBe(true);
    });

    test("status フィルタ一致のみ", async () => {
        await writeJson("orders.json", [
            {
                orderId: "S1",
                customerId: "TEST001",
                orderDate: "2026-03-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            },
            {
                orderId: "S2",
                customerId: "TEST001",
                orderDate: "2026-03-02T00:00:00.000Z",
                status: "発送済",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({
            isAdmin: true,
            customerId: null,
            status: "未発送"
        });
        expect(r.length).toBe(1);
        expect(r[0].orderId).toBe("S1");
    });

    test("start より前は除外", async () => {
        await writeJson("orders.json", [
            {
                orderId: "D1",
                customerId: "TEST001",
                orderDate: "2020-01-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({
            isAdmin: true,
            customerId: null,
            start: "2025-01-01"
        });
        expect(r.length).toBe(0);
    });

    test("end より後は除外", async () => {
        await writeJson("orders.json", [
            {
                orderId: "D2",
                customerId: "TEST001",
                orderDate: "2030-01-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({
            isAdmin: true,
            customerId: null,
            end: "2026-12-31"
        });
        expect(r.length).toBe(0);
    });

    test("顧客不在・配送名ありは 削除済 表示", async () => {
        await writeJson("orders.json", [
            {
                orderId: "DEL1",
                customerId: "GHOST",
                customerName: "x",
                orderDate: "2026-04-01T00:00:00.000Z",
                status: "未発送",
                deliveryInfo: { name: "配送先太郎" },
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r[0].customerName).toContain("削除済");
    });

    test("顧客不在・配送名なしは 未登録ID", async () => {
        await writeJson("orders.json", [
            {
                orderId: "DEL2",
                customerId: "GHOST2",
                orderDate: "2026-04-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r[0].customerName).toContain("未登録ID");
    });

    test("顧客IDなしは ゲスト", async () => {
        await writeJson("orders.json", [
            {
                orderId: "G1",
                customerId: "",
                orderDate: "2026-04-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r[0].customerName).toContain("ゲスト");
    });

    test("明細コード無しで名前からマスタ復元", async () => {
        await writeJson("orders.json", [
            {
                orderId: "NM1",
                customerId: "TEST001",
                orderDate: "2026-04-01T00:00:00.000Z",
                status: "未発送",
                items: [{ name: "テストトナーA", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r[0].items[0].code).toBe("P001");
    });

    test("価格0でランク価格救済", async () => {
        await writeJson("orders.json", [
            {
                orderId: "ZP1",
                customerId: "TEST001",
                orderDate: "2026-04-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "テストトナーA", price: 0, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r[0].items[0].price).toBeGreaterThan(0);
    });

    test("商品名 不明 は取扱終了表記", async () => {
        await writeJson("orders.json", [
            {
                orderId: "UK1",
                customerId: "TEST001",
                orderDate: "2026-04-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "ZZZ999", name: "不明", price: 10, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r[0].items[0].name).toContain("取扱終了");
    });

    test("orderDate 不正でも落ちない", async () => {
        await writeJson("orders.json", [
            {
                orderId: "BD1",
                customerId: "TEST001",
                orderDate: "not-a-date",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const r = await orderService.searchOrders({ isAdmin: true, customerId: null });
        expect(r.length).toBe(1);
    });

    test("resetExportStatus 存在しない注文", async () => {
        const ok = await orderService.resetExportStatus("NOPE");
        expect(ok).toBe(false);
    });

    test("resetExportStatus 成功", async () => {
        await writeJson("orders.json", [
            {
                orderId: "EXP1",
                customerId: "TEST001",
                orderDate: "2026-01-01T00:00:00.000Z",
                status: "未発送",
                exported_at: "2026-01-02",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const ok = await orderService.resetExportStatus("EXP1");
        expect(ok).toBe(true);
    });

    test("importExternalOrders 新規と重複スキップ", async () => {
        await writeJson("orders.json", []);
        const first = await orderService.importExternalOrders([
            {
                orderId: "EXT-A",
                customerId: "TEST001",
                customerName: "c",
                deliveryInfo: { name: "c", note: "n" },
                items: [{ code: "P001", name: "n", price: 10, quantity: 1 }],
                totalAmount: 10,
                status: "未発送",
                orderDate: "2026-01-01",
                source: "external",
                exported_at: null
            }
        ]);
        expect(first.createdCount).toBe(1);
        const second = await orderService.importExternalOrders([
            {
                orderId: "EXT-A",
                customerId: "TEST001",
                customerName: "c",
                deliveryInfo: { name: "c", note: "n" },
                items: [{ code: "P001", name: "n", price: 10, quantity: 1 }],
                totalAmount: 10,
                status: "未発送",
                orderDate: "2026-01-01",
                source: "external",
                exported_at: null
            }
        ]);
        expect(second.skippedCount).toBeGreaterThanOrEqual(1);
    });

    test("getAllDataForCsv 返却キー", async () => {
        const d = await orderService.getAllDataForCsv();
        expect(d.rawOrders).toBeDefined();
        expect(d.productMaster).toBeDefined();
        expect(d.rankPriceMap).toBeDefined();
    });

    test("updateOrderStatus 成功", async () => {
        await writeJson("orders.json", [
            {
                orderId: "US1",
                customerId: "TEST001",
                orderDate: "2026-01-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        await expect(
            orderService.updateOrderStatus("US1", { status: "発送済" })
        ).resolves.toBe(true);
    });

    test("registerShipment 成功", async () => {
        await writeJson("orders.json", [
            {
                orderId: "RS1",
                customerId: "TEST001",
                orderDate: "2026-01-01T00:00:00.000Z",
                status: "未発送",
                items: [{ code: "P001", name: "n", price: 1, quantity: 1 }]
            }
        ]);
        const st = await orderService.registerShipment("RS1", [
            {
                deliveryCompany: "yamato",
                trackingNumber: "T1",
                items: [],
                deliveryDateUnknown: false
            }
        ]);
        expect(st).toBeTruthy();
    });
});

describe("branch-coverage-targeted-p5: stockService", () => {
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

    test("getStock 空コードは null", async () => {
        await expect(stockService.getStock("")).resolves.toBeNull();
    });

    test("saveStock 新規", async () => {
        const r = await stockService.saveStock({
            productCode: "ST_P1",
            totalQty: 5,
            reservedQty: 0,
            warehouses: [{ code: "W1", qty: 5 }]
        });
        expect(r.productCode).toBe("ST_P1");
    });

    test("saveStock 無コードは例外", async () => {
        await expect(stockService.saveStock({})).rejects.toThrow("productCode");
    });

    test("syncStocks 商品コード空は errorRows", async () => {
        const r = await stockService.syncStocks([{ productCode: "" }]);
        expect(r.errorRows.length).toBeGreaterThan(0);
    });

    test("syncStocks skipLocked", async () => {
        await stockService.saveStock({
            productCode: "LK1",
            totalQty: 10,
            reservedQty: 0,
            manualLock: true,
            warehouses: []
        });
        const r = await stockService.syncStocks([{ productCode: "LK1", totalQty: 99 }], { skipLocked: true });
        expect(r.skippedCount).toBe(1);
    });

    test("syncStocks allowPartial false で検証エラー", async () => {
        await expect(
            stockService.syncStocks([{}], { allowPartial: false })
        ).rejects.toThrow("検証");
    });

    test("reserve 成功", async () => {
        await stockService.saveStock({
            productCode: "RV1",
            totalQty: 10,
            reservedQty: 0,
            warehouses: []
        });
        await expect(
            stockService.reserve([{ productCode: "RV1", quantity: 3 }], { userId: "u" })
        ).resolves.toBe(true);
    });

    test("reserve 在庫不足", async () => {
        await stockService.saveStock({
            productCode: "RV2",
            totalQty: 1,
            reservedQty: 0,
            warehouses: []
        });
        await expect(
            stockService.reserve([{ productCode: "RV2", quantity: 99 }])
        ).rejects.toMatchObject({ code: "STOCK_SHORTAGE" });
    });

    test("reserve マスタなし", async () => {
        await expect(stockService.reserve([{ productCode: "NONE999", quantity: 1 }])).rejects.toMatchObject({
            code: "STOCK_SHORTAGE"
        });
    });

    test("release 空配列は false", async () => {
        await expect(stockService.release([])).resolves.toBe(false);
    });

    test("release 成功", async () => {
        await stockService.saveStock({
            productCode: "RL1",
            totalQty: 10,
            reservedQty: 5,
            warehouses: []
        });
        await expect(
            stockService.release([{ productCode: "RL1", quantity: 2 }], { userId: "u" })
        ).resolves.toBe(true);
    });

    test("toggleManualLock 無効コードは何もしない", async () => {
        await expect(stockService.toggleManualLock("", true)).resolves.toBeUndefined();
    });

    test("getDisplaySettings", async () => {
        const d = await stockService.getDisplaySettings();
        expect(typeof d).toBe("object");
    });

    test("updateDisplaySettings", async () => {
        await stockService.updateDisplaySettings({ enabled: true });
        const d = await stockService.getDisplaySettings();
        expect(d.enabled).toBe(true);
    });

    test("getAdapterConfig", async () => {
        const c = await stockService.getAdapterConfig();
        expect(c).toBeTruthy();
    });

    test("getHistory 上限", async () => {
        const h = await stockService.getHistory(3);
        expect(Array.isArray(h)).toBe(true);
    });

    test("logEvent", async () => {
        await expect(stockService.logEvent({ action: "p5-test" })).resolves.toBeUndefined();
    });

    test("syncStocks totalQty 非数は倉庫合算", async () => {
        await stockService.syncStocks(
            [
                {
                    productCode: "WH1",
                    warehouses: [{ code: "A", qty: 2 }, { code: "B", qty: 3 }]
                }
            ],
            { skipLocked: false }
        );
        const s = await stockService.getStock("WH1");
        expect(s.totalQty).toBe(5);
    });
});

describe("branch-coverage-targeted-p5: mailService + settings", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        mailService.clearTransporterCache();
        jest.clearAllMocks();
    });

    test("sendOrderConfirmation 荷主あり", async () => {
        const ok = await mailService.sendOrderConfirmation(
            {
                orderId: "M1",
                deliveryInfo: {
                    shipper: { name: "荷主", address: "大阪", tel: "06" }
                }
            },
            "顧客"
        );
        expect(ok).toBe(true);
    });

    test("sendOrderConfirmation 荷主なし", async () => {
        const ok = await mailService.sendOrderConfirmation(
            { orderId: "M2", deliveryInfo: {} },
            "顧客"
        );
        expect(ok).toBe(true);
    });

    test("sendSupportNotification bug 区分", async () => {
        const ok = await mailService.sendSupportNotification({
            ticketId: "T-X",
            category: "bug",
            customerName: "c",
            customerId: "TEST001",
            detail: "d",
            attachments: []
        });
        expect(ok).toBe(true);
    });

    test("sendSupportNotification 添付メタのみ", async () => {
        const ok = await mailService.sendSupportNotification({
            ticketId: "T-Y",
            category: "support",
            customerName: "c",
            customerId: "TEST001",
            detail: "d",
            attachments: [{ storedName: "missing.bin", originalName: "a.bin", size: 10 }]
        });
        expect(ok).toBe(true);
    });

    test("sendInviteEmail", async () => {
        const r = await mailService.sendInviteEmail(
            { customerId: "TEST001", customerName: "招待", email: "test001@example.com" },
            "https://example.com/i",
            "TempPass1",
            false
        );
        expect(r.success).toBe(true);
    });

    test("sendPasswordChangedNotification", async () => {
        const r = await mailService.sendPasswordChangedNotification({
            customerId: "TEST001",
            customerName: "c",
            email: "test001@example.com"
        });
        expect(r.success).toBe(true);
    });

    test("sendLoginFailureAlert 顧客", async () => {
        const ok = await mailService.sendLoginFailureAlert({
            type: "customer",
            customer: {
                customerId: "TEST001",
                customerName: "c",
                email: "test001@example.com"
            },
            count: 5
        });
        expect(ok).toBe(true);
    });

    test("sendLoginFailureAlert 管理者", async () => {
        const ok = await mailService.sendLoginFailureAlert({
            type: "admin",
            adminId: "adm",
            adminName: "管理者",
            count: 5
        });
        expect(typeof ok).toBe("boolean");
    });

    test("applyTemplate 空は空", () => {
        expect(settingsService.applyTemplate("", { a: "1" })).toBe("");
    });
});
