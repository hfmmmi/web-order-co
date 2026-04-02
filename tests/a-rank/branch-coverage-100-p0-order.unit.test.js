"use strict";

/**
 * 分岐100本計画 P0: orderService 8本
 */
const orderService = require("../../services/orderService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("branch coverage 100 P0: orderService", () => {
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

    test("importExternalOrders は配列でなければ例外", async () => {
        await expect(orderService.importExternalOrders(null)).rejects.toThrow("array");
    });

    test("importExternalOrders は重複 orderId をスキップ", async () => {
        await writeJson("orders.json", [{ orderId: 50001, customerId: "TEST001", items: [], status: "未発送" }]);
        const r = await orderService.importExternalOrders([
            { orderId: 50001, customerId: "TEST001", items: [], status: "未発送" },
            { orderId: 50002, customerId: "TEST001", items: [], status: "未発送" }
        ]);
        expect(r.skippedCount).toBeGreaterThanOrEqual(1);
        expect(r.createdIds).toContain(50002);
    });

    test("importExternalOrders は orderId 欠損をスキップ", async () => {
        const r = await orderService.importExternalOrders([{ customerId: "X" }, { orderId: 50003, customerId: "TEST001", items: [], status: "未発送" }]);
        expect(r.skippedCount).toBeGreaterThanOrEqual(1);
    });

    test("resetExportStatus は該当注文で true", async () => {
        await writeJson("orders.json", [
            { orderId: 50010, customerId: "TEST001", exported_at: "2020-01-01T00:00:00.000Z", items: [], status: "未発送" }
        ]);
        const ok = await orderService.resetExportStatus(50010);
        expect(ok).toBe(true);
        const orders = await readJson("orders.json");
        const o = orders.find((x) => x.orderId === 50010);
        expect(o.exported_at).toBeNull();
    });

    test("resetExportStatus は無い注文で false", async () => {
        const ok = await orderService.resetExportStatus(999999991);
        expect(ok).toBe(false);
    });

    test("getAllDataForCsv は rawOrders を含む", async () => {
        await writeJson("orders.json", [{ orderId: 50020, customerId: "TEST001", items: [], status: "未発送" }]);
        const d = await orderService.getAllDataForCsv();
        expect(d.rawOrders.some((o) => o.orderId === 50020)).toBe(true);
        expect(Array.isArray(d.productMaster)).toBe(true);
    });

    test("getAllOrders は配列を返す", async () => {
        const list = await orderService.getAllOrders();
        expect(Array.isArray(list)).toBe(true);
    });

    test("markOrdersAsExported は exported_at を付与", async () => {
        await writeJson("orders.json", [{ orderId: 50030, customerId: "TEST001", items: [], status: "未発送" }]);
        await orderService.markOrdersAsExported([50030]);
        const orders = await readJson("orders.json");
        const o = orders.find((x) => x.orderId === 50030);
        expect(o.exported_at).toBeTruthy();
    });
});
