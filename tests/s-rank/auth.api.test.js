const request = require("supertest");
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Sランク: 認証API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("顧客ログインが成功する", async () => {
        const res = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.redirectUrl).toBe("products.html");
    });

    test("管理者ログインが成功する", async () => {
        const res = await request(app)
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.redirectUrl).toBe("admin/admin-dashboard.html");
    });

    test("ログインAPIはunknown keyを400で拒否する", async () => {
        const res = await request(app)
            .post("/api/login")
            .send({
                id: "TEST001",
                pass: "CustPass123!",
                unexpected: "x"
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });
});
