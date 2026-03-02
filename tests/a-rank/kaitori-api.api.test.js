// Aランク: 買取API（kaitori-api.js）回帰防止・カバレッジ向上
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const fs = require("fs").promises;
const path = require("path");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

const ROOT = path.join(__dirname, "../..");
function abs(rel) { return path.join(ROOT, rel); }

describe("Aランク: 買取API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
    });

    describe("POST /kaitori-request", () => {
        test("未ログインで401", async () => {
            const res = await request(app)
                .post("/kaitori-request")
                .send({ items: [{ name: "トナー", quantity: 1 }] });
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toContain("ログイン");
        });

        test("顧客ログイン後は申請成功", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/kaitori-request").send({
                items: [{ name: "テスト品", quantity: 2 }],
                note: "テスト備考"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(typeof res.body.requestId).toBe("number");

            const requests = await readJson("kaitori_requests.json");
            expect(requests.length).toBe(1);
            expect(requests[0].customerId).toBe("TEST001");
            expect(requests[0].status).toBe("未対応");
            expect(requests[0].items).toEqual([{ name: "テスト品", quantity: 2 }]);
            expect(requests[0].note).toBe("テスト備考");
        });
    });

    describe("GET /admin/kaitori-list", () => {
        test("未認証で401", async () => {
            const res = await request(app).get("/admin/kaitori-list");
            expect(res.statusCode).toBe(401);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test("管理者は一覧取得できる", async () => {
            await writeJson("kaitori_requests.json", [
                { requestId: 1, customerId: "TEST001", status: "未対応", requestDate: new Date().toISOString() }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/admin/kaitori-list");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(1);
            expect(res.body[0].requestId).toBe(1);
        });

        test("DB読込失敗時は空配列", async () => {
            await writeJson("kaitori_requests.json", "{ invalid");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/admin/kaitori-list");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(0);
        });
    });

    describe("POST /admin/kaitori-update", () => {
        test("未認証で401", async () => {
            const res = await request(app).post("/admin/kaitori-update").send({ requestId: 1, status: "対応済" });
            expect(res.statusCode).toBe(401);
        });

        test("存在しないrequestIdで404", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-update").send({
                requestId: 999999,
                status: "対応済"
            });
            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("見つかりません");
        });

        test("管理者はステータス・メモを更新できる", async () => {
            await writeJson("kaitori_requests.json", [
                { requestId: 100, customerId: "TEST001", status: "未対応", internalMemo: "", customerNote: "", requestDate: new Date().toISOString() }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-update").send({
                requestId: 100,
                status: "対応済",
                internalMemo: "社内メモ",
                customerNote: "顧客向けメモ"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);

            const requests = await readJson("kaitori_requests.json");
            const r = requests.find(x => x.requestId === 100);
            expect(r.status).toBe("対応済");
            expect(r.internalMemo).toBe("社内メモ");
            expect(r.customerNote).toBe("顧客向けメモ");
        });
    });

    describe("GET /kaitori-master", () => {
        test("未ログインで401", async () => {
            const res = await request(app).get("/kaitori-master");
            expect(res.statusCode).toBe(401);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test("顧客ログインでマスタ取得", async () => {
            const masterPath = path.join(path.dirname(require.resolve("../../routes/kaitori-api")), "../kaitori_master.json");
            await fs.writeFile(masterPath, JSON.stringify([{ id: "K1", maker: "メーカー", name: "品名", type: "タイプ", price: 100, destination: "大阪" }], null, 2), "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/kaitori-master");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].id).toBe("K1");
        });

        test("管理者ログインでマスタ取得", async () => {
            await writeJson("kaitori_master.json", []);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/kaitori-master");
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual([]);
        });

        test("読込失敗時は空配列", async () => {
            await fs.writeFile(abs("kaitori_master.json"), "{ broken", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/kaitori-master");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(0);
        });
    });

    describe("POST /admin/kaitori-master/import", () => {
        test("未認証で401", async () => {
            const res = await request(app).post("/admin/kaitori-master/import").send({ masterData: [] });
            expect(res.statusCode).toBe(401);
        });

        test("masterDataが配列でないと400", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/import").send({ masterData: "not-array" });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain("形式");
        });

        test("管理者はマスタ一括更新できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/import").send({
                masterData: [
                    { maker: "M1", name: "品1", type: "T1", price: 100 },
                    { maker: "M2", name: "品2", price: 200 }
                ]
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(2);

            const master = await readJson("kaitori_master.json");
            expect(master.length).toBe(2);
            expect(master[0].destination).toBe("大阪");
            expect(master[1].price).toBe(200);
        });
    });

    describe("POST /admin/kaitori-master/add", () => {
        test("未認証で401", async () => {
            const res = await request(app).post("/admin/kaitori-master/add").send({ maker: "M", name: "N" });
            expect(res.statusCode).toBe(401);
        });

        test("管理者は1件追加できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/add").send({
                maker: "追加メーカー",
                name: "追加品",
                type: "タイプ",
                price: 150
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.item).toBeDefined();
            expect(res.body.item.destination).toBe("大阪");

            const master = await readJson("kaitori_master.json");
            expect(master.length).toBe(1);
        });
    });

    describe("POST /admin/kaitori-master/edit", () => {
        test("未認証で401", async () => {
            const res = await request(app).post("/admin/kaitori-master/edit").send({ id: "K1", name: "変更" });
            expect(res.statusCode).toBe(401);
        });

        test("存在しないidで404", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/edit").send({ id: "NOEXIST", name: "x" });
            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
        });

        test("管理者は編集できる", async () => {
            await writeJson("kaitori_master.json", [{ id: "E1", maker: "M", name: "N", type: "T", price: 100, destination: "大阪" }]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/edit").send({ id: "E1", name: "変更後", price: 200 });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);

            const master = await readJson("kaitori_master.json");
            expect(master[0].name).toBe("変更後");
            expect(master[0].price).toBe(200);
        });
    });

    describe("POST /admin/kaitori-master/delete", () => {
        test("未認証で401", async () => {
            const res = await request(app).post("/admin/kaitori-master/delete").send({ id: "K1" });
            expect(res.statusCode).toBe(401);
        });

        test("存在しないidで404", async () => {
            await writeJson("kaitori_master.json", [{ id: "X1", maker: "M", name: "N", type: "T", price: 0, destination: "大阪" }]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/delete").send({ id: "NOEXIST" });
            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
        });

        test("管理者は削除できる", async () => {
            await writeJson("kaitori_master.json", [
                { id: "D1", maker: "M", name: "N", type: "T", price: 0, destination: "大阪" },
                { id: "D2", maker: "M2", name: "N2", type: "T", price: 0, destination: "大阪" }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/delete").send({ id: "D1" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);

            const master = await readJson("kaitori_master.json");
            expect(master.length).toBe(1);
            expect(master[0].id).toBe("D2");
        });
    });

    describe("GET /my-kaitori-history", () => {
        test("未ログインで401", async () => {
            const res = await request(app).get("/my-kaitori-history");
            expect(res.statusCode).toBe(401);
        });

        test("顧客は自分の履歴のみ取得", async () => {
            await writeJson("kaitori_requests.json", [
                { requestId: 1, customerId: "TEST001", status: "未対応", requestDate: new Date().toISOString() },
                { requestId: 2, customerId: "TEST002", status: "未対応", requestDate: new Date().toISOString() }
            ]);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/my-kaitori-history");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(1);
            expect(res.body[0].customerId).toBe("TEST001");
        });

        test("読込失敗時は空配列", async () => {
            await fs.writeFile(abs("kaitori_requests.json"), "not json", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/my-kaitori-history");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(0);
        });
    });
});
