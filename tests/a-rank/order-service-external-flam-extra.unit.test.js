/**
 * orderService.importExternalOrders / importFlamData の残分岐
 */
"use strict";

const orderService = require("../../services/orderService");
const settingsService = require("../../services/settingsService");
const iconv = require("iconv-lite");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const ORDERS_DB = dbPath("orders.json");

describe("Aランク: orderService 外部取込・FLAM 分岐", () => {
    let origOrders;

    beforeEach(async () => {
        origOrders = await fs.readFile(ORDERS_DB, "utf-8").catch(() => "[]");
    });

    afterEach(async () => {
        await fs.writeFile(ORDERS_DB, origOrders, "utf-8");
        jest.restoreAllMocks();
    });

    test("importExternalOrders は配列でないと例外", async () => {
        await expect(orderService.importExternalOrders(null)).rejects.toThrow("must be an array");
    });

    test("importFlamData は publicIdPattern が無効でもデフォルト正規表現にフォールバック", async () => {
        jest.spyOn(settingsService, "getLogisticsCsvImportConfig").mockResolvedValue({
            publicIdPattern: "[invalid(regex",
            memoFields: ["備考"],
            deliveryDate: ["納期"],
            orderNumber: ["注文番号"],
            customerName: ["顧客"],
            orderTotal: ["合計"],
            orderDate: ["日付"],
            importSourceLabel: "SRC"
        });
        const csv = "備考,納期,注文番号,顧客,合計,日付\nW00000000001,2025-01-01,ON1,C1,0,2025-01-01\n";
        const buf = iconv.encode(csv, "Shift_JIS");
        const r = await orderService.importFlamData(buf);
        expect(r.success).toBe(true);
    });
});
