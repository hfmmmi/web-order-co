"use strict";

const orderService = require("../../services/orderService");
const stockService = require("../../services/stockService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("orderService.updateOrderStatus キャンセル時の在庫解放分岐", () => {
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

    test("キャンセルで reservedItems があり release が成功すると snapshot を解放", async () => {
        const releaseSpy = jest.spyOn(stockService, "release").mockResolvedValue(undefined);
        await writeJson("orders.json", [
            {
                orderId: 99001,
                customerId: "TEST001",
                status: "未発送",
                items: [],
                deliveryInfo: {},
                stockSnapshot: {
                    released: false,
                    reservedItems: [{ productCode: "P001", quantity: 1 }]
                }
            }
        ]);
        await orderService.updateOrderStatus(99001, { status: "キャンセル済", performedBy: "admin-test" });
        expect(releaseSpy).toHaveBeenCalledWith(
            [{ productCode: "P001", quantity: 1 }],
            expect.objectContaining({ userId: "admin-test" })
        );
        const orders = await readJson("orders.json");
        const o = orders.find((x) => x.orderId === 99001);
        expect(o.stockSnapshot.released).toBe(true);
        expect(o.stockSnapshot.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("ステータスに「取消」を含むと在庫解放を試みる", async () => {
        const releaseSpy = jest.spyOn(stockService, "release").mockResolvedValue(undefined);
        await writeJson("orders.json", [
            {
                orderId: 99002,
                customerId: "TEST001",
                status: "未発送",
                items: [],
                deliveryInfo: {},
                stockSnapshot: {
                    released: false,
                    reservedItems: [{ productCode: "P002", quantity: 2 }]
                }
            }
        ]);
        await orderService.updateOrderStatus(99002, { status: "注文取消" });
        expect(releaseSpy).toHaveBeenCalled();
    });

    test("release が失敗しても updateOrderStatus は true（catch で握りつぶし）", async () => {
        jest.spyOn(stockService, "release").mockRejectedValueOnce(new Error("release fail"));
        await writeJson("orders.json", [
            {
                orderId: 99003,
                customerId: "TEST001",
                status: "未発送",
                items: [],
                deliveryInfo: {},
                stockSnapshot: {
                    released: false,
                    reservedItems: [{ productCode: "P001", quantity: 1 }]
                }
            }
        ]);
        await expect(orderService.updateOrderStatus(99003, { status: "キャンセル" })).resolves.toBe(true);
        const orders = await readJson("orders.json");
        const o = orders.find((x) => x.orderId === 99003);
        expect(o.stockSnapshot.released).not.toBe(true);
    });

    test("既に released のとき release は呼ばない", async () => {
        const releaseSpy = jest.spyOn(stockService, "release").mockResolvedValue(undefined);
        await writeJson("orders.json", [
            {
                orderId: 99004,
                customerId: "TEST001",
                status: "未発送",
                items: [],
                deliveryInfo: {},
                stockSnapshot: {
                    released: true,
                    reservedItems: [{ productCode: "P001", quantity: 1 }]
                }
            }
        ]);
        await orderService.updateOrderStatus(99004, { status: "キャンセル" });
        expect(releaseSpy).not.toHaveBeenCalled();
    });

    test("reservedItems が配列でないとき release は呼ばない", async () => {
        const releaseSpy = jest.spyOn(stockService, "release").mockResolvedValue(undefined);
        await writeJson("orders.json", [
            {
                orderId: 99005,
                customerId: "TEST001",
                status: "未発送",
                items: [],
                deliveryInfo: {},
                stockSnapshot: {
                    released: false,
                    reservedItems: null
                }
            }
        ]);
        await orderService.updateOrderStatus(99005, { status: "キャンセル" });
        expect(releaseSpy).not.toHaveBeenCalled();
    });
});
