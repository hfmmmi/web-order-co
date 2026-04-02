"use strict";

jest.mock("../../utils/excelReader", () => ({
    readToRowArrays: jest.fn()
}));

const { readToRowArrays } = require("../../utils/excelReader");
const customerService = require("../../services/customerService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData, readJson } = require("../helpers/testSandbox");

describe("customerService 追加分岐", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        readToRowArrays.mockReset();
    });

    test("importFromExcel は readToRowArrays 失敗時にラップして再throw", async () => {
        readToRowArrays.mockRejectedValueOnce(new Error("corrupt"));
        await expect(customerService.importFromExcel(Buffer.from([1]))).rejects.toThrow(/Excelファイルの読み込みに失敗/);
    });

    test("addCustomer は同一 customerId で失敗", async () => {
        const r = await customerService.addCustomer({
            customerId: "TEST001",
            customerName: "dup",
            password: "x",
            priceRank: "A",
            email: "x@test"
        });
        expect(r.success).toBe(false);
        expect(r.message).toContain("既に使用");
    });

    test("updateCustomer は存在しないIDで失敗", async () => {
        const r = await customerService.updateCustomer({
            customerId: "NO_SUCH",
            customerName: "x",
            password: "",
            priceRank: "A",
            email: "a@test"
        });
        expect(r.success).toBe(false);
    });

    test("updateCustomer は password 空ならハッシュを更新しない", async () => {
        const before = await readJson("customers.json");
        const prevHash = before.find((c) => c.customerId === "TEST001").password;
        const r = await customerService.updateCustomer({
            customerId: "TEST001",
            customerName: "改名",
            password: "",
            priceRank: "B",
            email: "test001@example.com"
        });
        expect(r.success).toBe(true);
        const after = await readJson("customers.json");
        expect(after.find((c) => c.customerId === "TEST001").password).toBe(prevHash);
        expect(after.find((c) => c.customerId === "TEST001").customerName).toBe("改名");
    });

    test("updateCustomer は email が undefined のとき既存メールを維持", async () => {
        const r = await customerService.updateCustomer({
            customerId: "TEST001",
            customerName: "テスト顧客",
            password: "",
            priceRank: "A"
        });
        expect(r.success).toBe(true);
        const after = await readJson("customers.json");
        expect(after.find((c) => c.customerId === "TEST001").email).toBe("test001@example.com");
    });

    test("updateCustomerPassword は存在しないIDで失敗", async () => {
        const r = await customerService.updateCustomerPassword("GHOST", "NewPass123!");
        expect(r.success).toBe(false);
    });

    test("getCustomerById は存在しないとき null", async () => {
        expect(await customerService.getCustomerById("NONE")).toBeNull();
    });

    test("updateCustomerAllowProxy は存在しない顧客で失敗", async () => {
        const r = await customerService.updateCustomerAllowProxy("NONE", true);
        expect(r.success).toBe(false);
    });

    test("searchCustomers は keyword を省略しても動作する", async () => {
        const r = await customerService.searchCustomers(undefined, 1, 50);
        expect(r.totalCount).toBeGreaterThanOrEqual(2);
    });

    test("getAllCustomers は searchCustomers のショートカット", async () => {
        const r = await customerService.getAllCustomers();
        expect(r.customers.length).toBeGreaterThanOrEqual(1);
    });

    test("updateCustomer は email に空文字を渡すとメールを空にできる", async () => {
        const r = await customerService.updateCustomer({
            customerId: "TEST001",
            customerName: "テスト顧客",
            password: "",
            priceRank: "A",
            email: ""
        });
        expect(r.success).toBe(true);
        const after = await readJson("customers.json");
        expect(after.find((c) => c.customerId === "TEST001").email).toBe("");
    });

    test("importFromExcel は既存顧客にメール列があれば email を更新する", async () => {
        readToRowArrays.mockResolvedValueOnce([
            ["ID", "パスワード", "名前", "ランク", "メール"],
            ["TEST001", "x", "名前", "A", "newmail@example.com"]
        ]);
        const r = await customerService.importFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        const after = await readJson("customers.json");
        expect(after.find((c) => c.customerId === "TEST001").email).toBe("newmail@example.com");
    });

    test("importFromExcel は行が短い場合スキップする", async () => {
        readToRowArrays.mockResolvedValueOnce([
            ["ID", "パスワード"],
            ["ONLY_ID"]
        ]);
        const r = await customerService.importFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        expect(r.message).toMatch(/0件/);
    });
});
