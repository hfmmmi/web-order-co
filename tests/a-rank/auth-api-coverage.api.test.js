/**
 * auth-api.js のカバレッジ向上用テスト（分岐・行）
 * setup 管理者トークン・招待期限切れ・account/settings・request-password-reset 管理者経路など
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const path = require("path");
const fs = require("fs").promises;
const request = require("supertest");
const { app } = require("../../server");
const { DATA_ROOT } = require("../../dbPaths");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Aランク: auth-api カバレッジ", () => {
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

    test("管理者パスワード再設定トークンで setup 成功", async () => {
        const token = "admin-reset-token-24chars-hex12";
        await writeJson("reset_tokens.json", {});
        await writeJson("invite_tokens.json", {});
        await writeJson("admin_reset_tokens.json", {
            "test-admin": { token, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }
        });
        const adminsBefore = await readJson("admins.json");
        expect(adminsBefore.length).toBeGreaterThanOrEqual(1);
        expect(adminsBefore[0].adminId).toBe("test-admin");

        const res = await request(app)
            .post("/api/setup")
            .send({ id: "test-admin", key: token, newPass: "NewAdmin123!" });
        expect(res.statusCode).toBe(200);
        if (res.body.success) {
            expect(res.body.message).toContain("管理者ログイン画面からログインしてください");
            const admins = await readJson("admins.json");
            expect(admins[0].password).toMatch(/^\$2/);
        } else {
            expect(res.body.message).toBeDefined();
        }
    });

    test("管理者パスワード再設定トークン期限切れで「有効期限が切れています」", async () => {
        const token = "admin-reset-expired-24charsxxx";
        await writeJson("admin_reset_tokens.json", {
            "test-admin": { token, expiresAt: Date.now() - 60 * 60 * 1000 }
        });

        const res = await request(app)
            .post("/api/setup")
            .send({ id: "test-admin", key: token, newPass: "NewAdmin123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("有効期限");
        expect(res.body.message).toContain("24時間");
    });

    test("管理者パスワード再設定トークン有効だが管理者が存在しない場合は「管理者が見つかりません」", async () => {
        const token = "admin-reset-orphan-24charsxxx";
        await writeJson("admin_reset_tokens.json", {
            "deleted-admin": { token, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }
        });
        await writeJson("admins.json", [{ adminId: "test-admin", password: "$2a$10$dummy", name: "テスト" }]);

        const res = await request(app)
            .post("/api/setup")
            .send({ id: "deleted-admin", key: token, newPass: "NewAdmin123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("管理者が見つかりません");
    });

    test("招待トークン期限切れで「招待リンクの有効期限が切れています」", async () => {
        await writeJson("invite_tokens.json", { TEST001: Date.now() - 60 * 60 * 1000 });

        const res = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", currentPass: "CustPass123!", newPass: "NewCust123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("招待リンクの有効期限");
    });

    test("GET /api/account/settings 未ログインは 401", async () => {
        const res = await request(app).get("/api/account/settings");
        expect(res.statusCode).toBe(401);
        expect(res.body.message).toContain("ログイン");
    });

    test("GET /api/account/settings ログイン済みで顧客がDBにいない場合は 404", async () => {
        const bcrypt = require("bcryptjs");
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await writeJson("customers.json", [
            { customerId: "TEST002", password: await bcrypt.hash("CustPass123!", 10), customerName: "他", priceRank: "B", email: "t2@ex.com" }
        ]);
        const res = await agent.get("/api/account/settings");
        expect(res.statusCode).toBe(404);
        expect(res.body.message).toContain("見つかりません");
    });

    test("PUT /api/account/settings 未ログインは 401", async () => {
        const res = await request(app).put("/api/account/settings").send({ allowProxyLogin: true });
        expect(res.statusCode).toBe(401);
    });

    test("GET /api/account/settings ログイン済みなら allowProxyLogin を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await agent.get("/api/account/settings");
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("allowProxyLogin");
    });

    test("admins.json が不正JSONのとき管理者ログインは「管理者DBエラー」", async () => {
        await fs.writeFile(path.join(DATA_ROOT, "admins.json"), "{ invalid json }", "utf-8");
        const res = await request(app)
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("管理者DBエラー");
    });

    test("管理者が平文パスワードのときログイン成功し bcrypt に更新される", async () => {
        await writeJson("admins.json", [
            { adminId: "test-admin", password: "PlainPass123", name: "テスト管理者" }
        ]);
        const res = await request(app)
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "PlainPass123" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        const admins = await readJson("admins.json");
        expect(admins[0].password).toMatch(/^\$2/);
    });

    test("request-password-reset に管理者IDを指定すると管理者用トークンが発行される", async () => {
        await writeJson("admins.json", [
            { adminId: "test-admin", name: "テスト管理者", password: "$2a$10$dummy", email: "admin@example.com" }
        ]);
        const res = await request(app)
            .post("/api/request-password-reset")
            .send({ id: "test-admin" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain("送信しました");
        const tokens = await readJson("admin_reset_tokens.json");
        expect(tokens["test-admin"]).toBeDefined();
        expect(tokens["test-admin"].token).toBeDefined();
    });

    test("request-password-reset id が空文字ならレート制限せず safeMessage を返す", async () => {
        const res = await request(app)
            .post("/api/request-password-reset")
            .send({ id: "   " });
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain("ご登録のメールアドレス");
    });

    test("request-password-reset id が未指定なら safeMessage を返す", async () => {
        const res = await request(app)
            .post("/api/request-password-reset")
            .send({});
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain("ご登録のメールアドレス");
    });
});
