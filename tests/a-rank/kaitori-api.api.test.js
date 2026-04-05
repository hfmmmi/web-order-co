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
const { DATA_ROOT } = require("../../dbPaths");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

function abs(rel) { return path.join(DATA_ROOT, rel); }

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
            expect(typeof res.body.requestId).toBe("string");
            expect(res.body.requestId).toMatch(/^KR-\d+-[a-f0-9]{8}$/);

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

        test("items 配列を渡すと明細を更新できる", async () => {
            await writeJson("kaitori_requests.json", [
                {
                    requestId: 200,
                    customerId: "TEST001",
                    status: "未対応",
                    items: [{ name: "旧" }],
                    requestDate: new Date().toISOString()
                }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-update").send({
                requestId: 200,
                items: [{ name: "新アイテム", quantity: 3 }]
            });
            expect(res.statusCode).toBe(200);
            const requests = await readJson("kaitori_requests.json");
            const r = requests.find((x) => x.requestId === 200);
            expect(r.items).toEqual([{ name: "新アイテム", quantity: 3 }]);
        });
    });

    describe("GET /kaitori-master", () => {
        test("未ログインで401", async () => {
            const res = await request(app).get("/kaitori-master");
            expect(res.statusCode).toBe(401);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test("顧客ログインでマスタ取得", async () => {
            const masterPath = path.join(DATA_ROOT, "kaitori_master.json");
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

        test("マスタ一括更新でファイル書込が失敗すると500", async () => {
            const fsp = require("fs").promises;
            const origWrite = fsp.writeFile.bind(fsp);
            let masterWrites = 0;
            jest.spyOn(fsp, "writeFile").mockImplementation(async (p, ...args) => {
                if (String(p).replace(/\\/g, "/").includes("kaitori_master.json")) {
                    masterWrites += 1;
                    if (masterWrites === 1) {
                        throw new Error("simulated write failure");
                    }
                }
                return origWrite(p, ...args);
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/import").send({
                masterData: [{ maker: "M", name: "N", price: 1 }]
            });
            expect(res.statusCode).toBe(500);
            expect(String(res.body.message || "")).toMatch(/マスタ|失敗/);
            jest.restoreAllMocks();
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

        test("JSONが配列でなければ空配列", async () => {
            await writeJson("kaitori_requests.json", { x: 1 });
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/my-kaitori-history");
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    describe("分岐追加: 非配列JSON・importの既定値", () => {
        test("POST /kaitori-request は既存がオブジェクトでも配列に正規化して追記", async () => {
            await fs.writeFile(abs("kaitori_requests.json"), "{}", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/kaitori-request").send({ items: [{ name: "x", quantity: 1 }] });
            expect(res.statusCode).toBe(200);
            const list = await readJson("kaitori_requests.json");
            expect(Array.isArray(list)).toBe(true);
            expect(list.length).toBe(1);
        });

        test("POST /kaitori-request は壊JSONでも新規配列として続行", async () => {
            await fs.writeFile(abs("kaitori_requests.json"), "{bad", "utf-8");
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/kaitori-request").send({ items: [{ name: "y", quantity: 1 }] });
            expect(res.statusCode).toBe(200);
            const list = await readJson("kaitori_requests.json");
            expect(list.length).toBe(1);
        });

        test("POST /admin/kaitori-update はDBがオブジェクトでも配列化して404", async () => {
            await fs.writeFile(abs("kaitori_requests.json"), "{}", "utf-8");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-update").send({ requestId: "nope", status: "対応済" });
            expect(res.statusCode).toBe(404);
        });

        test("POST /admin/kaitori-update で items が配列でなければ明細は更新しない", async () => {
            await writeJson("kaitori_requests.json", [
                {
                    requestId: 300,
                    customerId: "TEST001",
                    status: "未対応",
                    items: [{ name: "keep" }],
                    requestDate: new Date().toISOString()
                }
            ]);
            // POST 前に読み直して書き込み完了を確認（Windows 等で稀に直後の HTTP が空 DB を読むのを避ける）
            const seeded = await readJson("kaitori_requests.json");
            expect(seeded.find((x) => x && x.requestId == 300)).toBeTruthy();

            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-update").send({
                requestId: 300,
                items: "not-array",
                status: "対応済"
            });
            expect(res.statusCode).toBe(200);
            const requests = await readJson("kaitori_requests.json");
            const r = requests.find((x) => x.requestId === 300);
            expect(r.items).toEqual([{ name: "keep" }]);
            expect(r.status).toBe("対応済");
        });

        test("POST /admin/kaitori-master/add はマスタがオブジェクトでも配列化", async () => {
            await fs.writeFile(abs("kaitori_master.json"), "{}", "utf-8");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/add").send({
                id: "preset-k",
                maker: "M",
                name: "N",
                type: "T",
                price: 50,
                destination: "名古屋"
            });
            expect(res.statusCode).toBe(200);
            const master = await readJson("kaitori_master.json");
            expect(master.length).toBe(1);
            expect(master[0].id).toBe("preset-k");
            expect(master[0].destination).toBe("名古屋");
        });

        test("POST /admin/kaitori-master/add は壊JSONでも空配列から追加", async () => {
            await fs.writeFile(abs("kaitori_master.json"), "{bad", "utf-8");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/add").send({ maker: "M2", name: "N2", price: 1 });
            expect(res.statusCode).toBe(200);
            const master = await readJson("kaitori_master.json");
            expect(master.length).toBe(1);
        });

        test("POST /admin/kaitori-master/import で id・destination 等が揃っている項目はそのまま使う", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/import").send({
                masterData: [
                    {
                        id: "FULL-1",
                        maker: "Canon",
                        name: "品",
                        type: "純正",
                        price: "123",
                        destination: "東京"
                    }
                ]
            });
            expect(res.statusCode).toBe(200);
            const master = await readJson("kaitori_master.json");
            expect(master[0].id).toBe("FULL-1");
            expect(master[0].destination).toBe("東京");
            expect(master[0].price).toBe(123);
        });

        test("POST /admin/kaitori-master/edit はマスタがオブジェクトなら404", async () => {
            await fs.writeFile(abs("kaitori_master.json"), "{}", "utf-8");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/edit").send({ id: "ANY", name: "x" });
            expect(res.statusCode).toBe(404);
        });

        test("POST /admin/kaitori-master/delete はマスタがオブジェクトなら削除対象なし", async () => {
            await fs.writeFile(abs("kaitori_master.json"), "{}", "utf-8");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/delete").send({ id: "X" });
            expect(res.statusCode).toBe(404);
        });
    });

    describe("分岐追加: エラー系", () => {
        test("POST /kaitori-request は書込失敗で500", async () => {
            const fsp = require("fs").promises;
            const origWrite = jest.requireActual("fs").promises.writeFile;
            jest.spyOn(fsp, "writeFile").mockImplementation(async (p, ...args) => {
                if (String(p).replace(/\\/g, "/").includes("kaitori_requests.json")) {
                    throw new Error("write fail");
                }
                return origWrite(p, ...args);
            });
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/kaitori-request").send({ items: [{ name: "a", quantity: 1 }] });
            expect(res.statusCode).toBe(500);
            jest.restoreAllMocks();
        });

        test("POST /admin/kaitori-update は内部例外で500", async () => {
            await writeJson("kaitori_requests.json", [
                { requestId: "U500", customerId: "TEST001", status: "未対応", requestDate: new Date().toISOString() }
            ]);
            const fsp = require("fs").promises;
            const origRead = jest.requireActual("fs").promises.readFile;
            jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
                if (String(p).replace(/\\/g, "/").includes("kaitori_requests.json")) {
                    throw new Error("eio");
                }
                return origRead(p, enc);
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-update").send({ requestId: "U500", status: "対応済" });
            expect(res.statusCode).toBe(500);
            jest.restoreAllMocks();
        });

        test("POST /admin/kaitori-master/add は書込失敗で500", async () => {
            const fsp = require("fs").promises;
            const origWrite = jest.requireActual("fs").promises.writeFile;
            jest.spyOn(fsp, "writeFile").mockImplementation(async (p, ...args) => {
                if (String(p).replace(/\\/g, "/").includes("kaitori_master.json")) {
                    throw new Error("write fail");
                }
                return origWrite(p, ...args);
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/add").send({ maker: "M", name: "N" });
            expect(res.statusCode).toBe(500);
            jest.restoreAllMocks();
        });

        test("POST /admin/kaitori-master/edit は読込例外で500", async () => {
            const fsp = require("fs").promises;
            const origRead = jest.requireActual("fs").promises.readFile;
            jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
                if (String(p).replace(/\\/g, "/").includes("kaitori_master.json")) {
                    throw new Error("eio");
                }
                return origRead(p, enc);
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/edit").send({ id: "E1", name: "x" });
            expect(res.statusCode).toBe(500);
            jest.restoreAllMocks();
        });

        test("POST /admin/kaitori-master/delete は読込例外で500", async () => {
            const fsp = require("fs").promises;
            const origRead = jest.requireActual("fs").promises.readFile;
            jest.spyOn(fsp, "readFile").mockImplementation(async (p, enc) => {
                if (String(p).replace(/\\/g, "/").includes("kaitori_master.json")) {
                    throw new Error("eio");
                }
                return origRead(p, enc);
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/kaitori-master/delete").send({ id: "D1" });
            expect(res.statusCode).toBe(500);
            jest.restoreAllMocks();
        });
    });
});
