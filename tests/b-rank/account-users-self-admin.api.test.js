const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData
} = require("../helpers/testSandbox");

describe("Bランク: 顧客側ユーザーアカウント管理", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("未ログインは GET /api/account/users で401", async () => {
        const res = await request(app).get("/api/account/users");
        expect(res.statusCode).toBe(401);
    });

    test("一般ユーザーは POST /api/account/users で403", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({
            id: "test003@example.com",
            pass: "CustPass123!"
        });
        const res = await agent.post("/api/account/users").send({
            email: "newuser@example.com",
            displayName: "新規",
            role: "user",
            password: "Pass1234!"
        });
        expect(res.statusCode).toBe(403);
    });

    test("企業管理者は自社ユーザーを追加できる", async () => {
        const agent = request.agent(app);
        const login = await agent.post("/api/login").send({
            id: "test001@example.com",
            pass: "CustPass123!"
        });
        expect(login.body.success).toBe(true);

        const add = await agent.post("/api/account/users").send({
            email: "member001@example.com",
            displayName: "追加担当",
            role: "user",
            password: "Pass1234!"
        });
        expect(add.statusCode).toBe(200);
        expect(add.body.success).toBe(true);

        const list = await agent.get("/api/account/users");
        expect(list.body.success).toBe(true);
        expect(list.body.users.some((u) => u.email === "member001@example.com")).toBe(true);

        const loginNew = await request.agent(app).post("/api/login").send({
            id: "member001@example.com",
            pass: "Pass1234!"
        });
        expect(loginNew.body.success).toBe(true);
    });
});
