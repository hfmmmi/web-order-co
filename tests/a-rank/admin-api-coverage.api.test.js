/**
 * admin-api.js のカバレッジ向上用テスト（分岐・行）
 * GET/PUT admin/account・customers・proxy・send-invite-email などの経路
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const path = require("path");
const fs = require("fs").promises;
const { app } = require("../../server");
const { DATA_ROOT } = require("../../dbPaths");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Aランク: admin-api カバレッジ", () => {
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

    test("GET /api/admin/account 未ログインは 401", async () => {
        const res = await request(app).get("/api/admin/account");
        expect(res.statusCode).toBe(401);
    });

    test("GET /api/admin/account ログイン後は先頭管理者を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/account");
        expect(res.statusCode).toBe(200);
        expect(res.body.adminId).toBe("test-admin");
        expect(res.body.name).toBe("テスト管理者");
        expect(typeof res.body.passwordSet).toBe("boolean");
    });

    test("GET /api/admin/account は admins が空配列なら空フィールドを返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await writeJson("admins.json", []);
        const res = await agent.get("/api/admin/account");
        expect(res.statusCode).toBe(200);
        expect(res.body.adminId).toBe("");
        expect(res.body.passwordSet).toBe(false);
    });

    test("GET /api/admin/account は admins.json 欠落時 ENOENT で空フィールド", async () => {
        const p = path.join(DATA_ROOT, "admins.json");
        const orig = await fs.readFile(p, "utf-8");
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        try {
            await fs.unlink(p);
            const res = await agent.get("/api/admin/account");
            expect(res.statusCode).toBe(200);
            expect(res.body.adminId).toBe("");
        } finally {
            await fs.writeFile(p, orig, "utf-8");
        }
    });

    test("GET /api/admin/account は admins.json 読込が EACCES で500", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const origReadFile = fs.readFile;
        const spy = jest.spyOn(fs, "readFile").mockImplementation(async (targetPath, enc) => {
            if (String(targetPath).replace(/\\/g, "/").includes("admins.json")) {
                const e = new Error("denied");
                e.code = "EACCES";
                throw e;
            }
            return origReadFile.call(fs, targetPath, enc);
        });
        const res = await agent.get("/api/admin/account");
        expect(res.statusCode).toBe(500);
        spy.mockRestore();
    });

    test("PUT /api/admin/account 初回作成でパスワード不足なら 400", async () => {
        await seedBaseData();
        const agent = request.agent(app);
        const login = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);
        await writeJson("admins.json", []);
        const res = await agent
            .put("/api/admin/account")
            .send({ adminId: "new-admin", name: "新管理者" });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("パスワードを4文字以上");
    });

    test("PUT /api/admin/account 正常で name/email 更新", async () => {
        await seedBaseData();
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .put("/api/admin/account")
            .send({ adminId: "test-admin", name: "名前変更", email: "admin@example.com", password: "AdminPass123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        const admins = await readJson("admins.json");
        expect(admins[0].name).toBe("名前変更");
        expect(admins[0].email).toBe("admin@example.com");
    });

    test("PUT /api/admin/account email 空文字で未設定にできる", async () => {
        await writeJson("admins.json", [
            { adminId: "test-admin", password: await require("bcryptjs").hash("AdminPass123!", 10), name: "テスト", email: "old@ex.com" }
        ]);
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent
            .put("/api/admin/account")
            .send({ adminId: "test-admin", email: "" });
        expect(res.statusCode).toBe(200);
        const admins = await readJson("admins.json");
        expect(admins[0].email).toBeUndefined();
    });

    test("GET /api/admin/customers keyword と page で取得", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/customers?keyword=TEST&page=1");
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("customers");
        expect(Array.isArray(res.body.customers)).toBe(true);
    });

    test("POST /api/admin/send-invite-email customerId なしで失敗", async () => {
        await seedBaseData();
        const agent = request.agent(app);
        const login = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);
        const res = await agent.post("/api/admin/send-invite-email").send({});
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("指定されていません");
    });

    test("POST /api/admin/send-invite-email 顧客がいない", async () => {
        await seedBaseData();
        const agent = request.agent(app);
        const login = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);
        const res = await agent.post("/api/admin/send-invite-email").send({ customerId: "NOEXIST" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("見つかりません");
    });

    test("POST /api/admin/send-invite-email 顧客にメール未登録なら失敗", async () => {
        await seedBaseData();
        const bcrypt = require("bcryptjs");
        const customers = await readJson("customers.json");
        customers.push({
            customerId: "NOMAIL",
            password: await bcrypt.hash("Pass123!", 10),
            customerName: "メールなし",
            priceRank: "A",
            email: ""
        });
        await writeJson("customers.json", customers);
        const agent = request.agent(app);
        const login = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);
        const res = await agent.post("/api/admin/send-invite-email").send({ customerId: "NOMAIL" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/メールアドレスが登録されていません|顧客が見つかりません/);
    });

    test("POST /api/admin/proxy-request customerId なしで 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/proxy-request").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("顧客IDを指定");
    });

    test("POST /api/admin/proxy-request 顧客がいない", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/proxy-request").send({ customerId: "NOEXIST" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("見つかりません");
    });

    test("GET /api/admin/proxy-request-status customerId なしで status none", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/proxy-request-status");
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("none");
    });

    test("GET /api/admin/proxy-request-status 申請なしで none", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("none");
    });

    test("POST /api/admin/proxy-login customerId なしで 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/proxy-login").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("顧客IDを指定");
    });

    test("POST /api/admin/proxy-login 許可なしで失敗", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("許可がまだありません");
    });

    test("POST /api/admin/proxy-logout 代理中でないと 400", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/proxy-logout");
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain("代理ログイン中ではありません");
    });
});
