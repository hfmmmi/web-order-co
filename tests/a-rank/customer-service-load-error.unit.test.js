"use strict";

const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const customerService = require("../../services/customerService");

const CUSTOMERS_PATH = dbPath("customers.json");

describe("customerService _loadAll エラー時は空配列", () => {
    test("customers.json が破損 JSON のとき検索は空配列相当", async () => {
        const orig = await fs.readFile(CUSTOMERS_PATH, "utf-8");
        try {
            await fs.writeFile(CUSTOMERS_PATH, "{not-json", "utf-8");
            const r = await customerService.searchCustomers("", 1, 10);
            expect(r.customers).toEqual([]);
            expect(r.totalCount).toBe(0);
        } finally {
            await fs.writeFile(CUSTOMERS_PATH, orig, "utf-8");
        }
    });
});
