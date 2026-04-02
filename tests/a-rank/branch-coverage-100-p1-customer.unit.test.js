"use strict";

const customerService = require("../../services/customerService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("branch coverage 100 P1: customerService", () => {
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

    test("searchCustomers は keyword で絞り込み", async () => {
        const r = await customerService.searchCustomers("TEST001", 1, 50);
        expect(r.customers.some((c) => c.customerId === "TEST001")).toBe(true);
    });

    test("searchCustomers は page 2 で空になりうる", async () => {
        const r = await customerService.searchCustomers("", 99, 50);
        expect(r.customers.length).toBe(0);
    });

    test("getAllCustomers は totalCount を返す", async () => {
        const r = await customerService.getAllCustomers("", 1);
        expect(r.totalCount).toBeGreaterThanOrEqual(2);
    });

    test("updateCustomer は存在しなければ失敗", async () => {
        const r = await customerService.updateCustomer({
            customerId: "__NO_999",
            customerName: "x",
            password: "",
            priceRank: "A",
            email: ""
        });
        expect(r.success).toBe(false);
    });

    test("addCustomer は新規 ID で成功", async () => {
        const id = "NCUST_" + Date.now();
        const r = await customerService.addCustomer({
            customerId: id,
            customerName: "新規",
            password: "CustPass123!",
            priceRank: "A",
            email: "n@example.com"
        });
        expect(r.success).toBe(true);
        const list = await readJson("customers.json");
        await writeJson(
            "customers.json",
            list.filter((c) => c.customerId !== id)
        );
    });
});
