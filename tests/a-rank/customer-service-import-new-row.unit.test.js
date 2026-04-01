/**
 * customerService.importFromExcel の新規行追加分岐（else ブロック）
 */
"use strict";

jest.mock("../../utils/excelReader", () => ({
    readToRowArrays: jest.fn()
}));

const { readToRowArrays } = require("../../utils/excelReader");
const customerService = require("../../services/customerService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: customerService importFromExcel 新規行", () => {
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

    test("既存にない顧客IDは新規追加される", async () => {
        readToRowArrays.mockResolvedValue([
            ["ID", "PASS", "NAME", "RANK", "MAIL"],
            ["BRANDNEW999", "Secret123!", "新規太郎", "b", "new@example.com"]
        ]);
        const r = await customerService.importFromExcel(Buffer.from([1]));
        expect(r.success).toBe(true);
        expect(r.message).toContain("新規");
        const list = JSON.parse(await fs.readFile(dbPath("customers.json"), "utf-8"));
        const row = list.find((c) => c.customerId === "BRANDNEW999");
        expect(row).toBeDefined();
        expect(row.customerName).toBe("新規太郎");
        expect(row.priceRank).toBe("B");
    });
});
