const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson
} = require("../helpers/testSandbox");

describe("Sランク: 顧客登録/更新API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("管理者でない場合、顧客追加は拒否される", async () => {
        const res = await request(app)
            .post("/api/add-customer")
            .send({
                customerId: "NEW001",
                customerName: "新規顧客",
                password: "Pass1234!",
                priceRank: "A"
            });

        expect(res.statusCode).toBe(401);
    });

    test("管理者ログイン後、顧客追加と更新ができる", async () => {
        const agent = request.agent(app);

        const login = await agent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const addRes = await agent
            .post("/api/add-customer")
            .send({
                customerId: "NEW001",
                customerName: "新規顧客",
                password: "Pass1234!",
                priceRank: "A",
                email: "new001@example.com"
            });

        expect(addRes.statusCode).toBe(200);
        expect(addRes.body.success).toBe(true);

        const updateRes = await agent
            .post("/api/update-customer")
            .send({
                customerId: "NEW001",
                customerName: "更新後顧客",
                password: "Pass5678!",
                priceRank: "B",
                email: "updated001@example.com"
            });

        expect(updateRes.statusCode).toBe(200);
        expect(updateRes.body.success).toBe(true);

        const customers = await readJson("customers.json");
        const updated = customers.find((c) => c.customerId === "NEW001");
        expect(updated).toBeTruthy();
        expect(updated.customerName).toBe("更新後顧客");
        expect(updated.priceRank).toBe("B");
        expect(updated.email).toBe("updated001@example.com");
    });
});
