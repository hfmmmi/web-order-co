"use strict";

const customerService = require("../../services/customerService");
const { backupDbFiles, restoreDbFiles, writeJson, seedBaseData } = require("../helpers/testSandbox");

describe("customerService 検索・更新の分岐", () => {
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

    test("searchCustomers は customerName が無い顧客も id 検索できる", async () => {
        await writeJson("customers.json", [
            {
                customerId: "NONAME1",
                password: "x",
                priceRank: "A",
                email: "n@example.com"
            }
        ]);
        const r = await customerService.searchCustomers("noname1", 1, 50);
        expect(r.customers.length).toBe(1);
        expect(r.customers[0].customerId).toBe("NONAME1");
    });

    test("searchCustomers は customerId が無い顧客も名前でヒット", async () => {
        await writeJson("customers.json", [
            {
                customerName: "名前のみ株式会社",
                password: "x",
                priceRank: "",
                email: ""
            }
        ]);
        const r = await customerService.searchCustomers("名前のみ", 1, 50);
        expect(r.customers.length).toBe(1);
    });

    test("updateCustomer は email 引数省略で既存メールを維持", async () => {
        await writeJson("customers.json", [
            {
                customerId: "E1",
                customerName: "旧名",
                password: "$2a$10$abcdefghijklmnopqrstuv",
                priceRank: "A",
                email: "keep@example.com"
            }
        ]);
        const res = await customerService.updateCustomer({
            customerId: "E1",
            customerName: "新名"
        });
        expect(res.success).toBe(true);
        const list = JSON.parse(
            await require("fs").promises.readFile(
                require("../../dbPaths").dbPath("customers.json"),
                "utf-8"
            )
        );
        const c = list.find((x) => x.customerId === "E1");
        expect(c.email).toBe("keep@example.com");
        expect(c.customerName).toBe("新名");
    });

    test("updateCustomer は priceRank 空でクリア", async () => {
        await writeJson("customers.json", [
            {
                customerId: "PR",
                customerName: "p",
                password: "$2a$10$abcdefghijklmnopqrstuv",
                priceRank: "B",
                email: ""
            }
        ]);
        await customerService.updateCustomer({
            customerId: "PR",
            customerName: "p",
            priceRank: ""
        });
        const list = JSON.parse(
            await require("fs").promises.readFile(
                require("../../dbPaths").dbPath("customers.json"),
                "utf-8"
            )
        );
        expect(list.find((x) => x.customerId === "PR").priceRank).toBe("");
    });
});
