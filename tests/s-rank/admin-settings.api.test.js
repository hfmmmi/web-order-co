const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson
} = require("../helpers/testSandbox");

describe("Sランク: 管理設定更新API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("未ログイン時は設定更新できない", async () => {
        const res = await request(app)
            .put("/api/admin/settings")
            .send({ features: { orders: false } });

        expect(res.statusCode).toBe(401);
    });

    test("管理者ログイン後は設定更新できる", async () => {
        const agent = request.agent(app);
        const login = await agent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const res = await agent
            .put("/api/admin/settings")
            .send({ features: { orders: false, support: true } });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        const settings = await readJson("settings.json");
        expect(settings.features.orders).toBe(false);
        expect(settings.features.support).toBe(true);
    });

    test("管理設定更新はunknown keyを400で拒否する", async () => {
        const agent = request.agent(app);
        const login = await agent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const res = await agent
            .put("/api/admin/settings")
            .send({
                features: { orders: true },
                unexpectedField: "x"
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });
});
