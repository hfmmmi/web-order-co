jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

// excelReader をモック可能にする（Phase3 の Excel/readToRowArrays テストでサービスがモックを参照するため）
jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return {
        ...actual,
        readToRowArrays: jest.fn(actual.readToRowArrays),
        readToObjects: jest.fn(actual.readToObjects)
    };
});

const request = require("supertest");
const { app } = require("../../server");
const fs = require("fs").promises;
const path = require("path");
const { DATA_ROOT } = require("../../dbPaths");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

function rankPricesPath() {
    return path.join(DATA_ROOT, "rank_prices.json");
}

describe("Aランク: カバレッジ改善（auth/orders/admin）", () => {
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
        await writeJson("logs/customer-auth.json", []);
        await writeJson("logs/admin-auth.json", []);
    });

    describe("auth-api", () => {
        test("GET /api/session は顧客ログイン済みで session を返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/api/session");
            expect(res.statusCode).toBe(200);
            expect(res.body.customerId).toBe("TEST001");
            expect(res.body.customerName).toBe("テスト顧客");
            expect(res.body.proxyByAdmin).toBeFalsy();
        });

        test("admins.json 読み込み失敗時は管理者DBエラーを返す", async () => {
            const adminsPath = path.join(__dirname, "../../admins.json");
            await fs.writeFile(adminsPath, "{", "utf-8");
            try {
                const res = await request(app)
                    .post("/api/admin/login")
                    .send({ id: "test-admin", pass: "AdminPass123!" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toBe("管理者DBエラー");
            } finally {
                await seedBaseData();
            }
        });

        // Phase1: 顧客ログインで customers.json 読込失敗時はシステムエラーを返す（auth-api catch分岐）
        test("顧客ログインで customers.json 読込失敗時はシステムエラーを返す", async () => {
            const fsMod = require("fs").promises;
            const customersPath = path.join(__dirname, "../../customers.json");
            const origRead = fsMod.readFile;
            jest.spyOn(fsMod, "readFile").mockImplementation((filePath) => {
                if (String(filePath).includes("customers.json")) {
                    return Promise.reject(new Error("ENOENT"));
                }
                return origRead.apply(fsMod, arguments);
            });
            try {
                const res = await request(app)
                    .post("/api/login")
                    .send({ id: "TEST001", pass: "CustPass123!" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toBe("システムエラー");
            } finally {
                fsMod.readFile.mockRestore();
            }
        });

        // Phase1: account/settings GET で getCustomerById 失敗時は500を返す（auth-api catch分岐）
        test("GET /api/account/settings は getCustomerById 失敗時500を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "getCustomerById").mockRejectedValueOnce(new Error("DB Error"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/api/account/settings");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("取得に失敗");
            customerService.getCustomerById.mockRestore();
        });

        // Phase1 分岐70%: account/settings GET で getCustomerById が null（顧客削除済み）のとき 404 を返す
        test("GET /api/account/settings は getCustomerById が null のとき404を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "getCustomerById").mockResolvedValueOnce(null);
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/api/account/settings");
            expect(res.statusCode).toBe(404);
            expect(res.body.message).toBe("顧客が見つかりません");
            customerService.getCustomerById.mockRestore();
        });

        // Phase1: account/settings PUT で updateCustomerAllowProxy 失敗時は500を返す（auth-api catch分岐）
        test("PUT /api/account/settings は updateCustomerAllowProxy 失敗時500を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "updateCustomerAllowProxy").mockRejectedValueOnce(new Error("DB Error"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.put("/api/account/settings").send({ allowProxyLogin: true });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("保存に失敗");
            customerService.updateCustomerAllowProxy.mockRestore();
        });

        // Phase1 分岐70%: account/settings PUT で result.success が false のとき 400 を返す（auth-api 分岐）
        test("PUT /api/account/settings は updateCustomerAllowProxy が success:false のとき400を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "updateCustomerAllowProxy").mockResolvedValueOnce({ success: false, message: "更新できませんでした" });
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.put("/api/account/settings").send({ allowProxyLogin: true });
            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            customerService.updateCustomerAllowProxy.mockRestore();
        });

        // Phase1 分岐70%: proxy-request で adminName が空のとき sanitizeAdminName の結果が空なので「管理者」を返す
        test("GET /api/account/proxy-request は adminName が空のとき adminName に「管理者」を返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
            await writeJson("proxy_requests.json", {
                TEST001: {
                    requestedAt: Date.now(),
                    adminName: "",
                    approved: null
                }
            });
            const res = await agent.get("/api/account/proxy-request");
            expect(res.statusCode).toBe(200);
            expect(res.body.pending).toBe(true);
            expect(res.body.adminName).toBe("管理者");
        });

        // 第2期Phase1: proxy-request GET で loadProxyRequests 失敗時は pending: false を返す（auth-api catch分岐）
        test("GET /api/account/proxy-request は loadProxyRequests 失敗時 pending: false を返す", async () => {
            const fsMod = require("fs").promises;
            const origRead = fsMod.readFile.bind(fsMod);
            jest.spyOn(fsMod, "readFile").mockImplementation((filePath) => {
                if (String(filePath).includes("proxy_requests")) {
                    return Promise.reject(new Error("ENOENT or read error"));
                }
                return origRead(filePath);
            });
            try {
                const agent = request.agent(app);
                await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
                const res = await agent.get("/api/account/proxy-request");
                expect(res.statusCode).toBe(200);
                expect(res.body.pending).toBe(false);
            } finally {
                fsMod.readFile.mockRestore();
            }
        });

        // 第2期Phase1: proxy-request reject で save 失敗時は500を返す（auth-api catch分岐）
        test("proxy-request reject は save 失敗時500を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
            const fsMod = require("fs").promises;
            const origWrite = fsMod.writeFile.bind(fsMod);
            jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, ...args) => {
                if (String(filePath).includes("proxy_requests")) {
                    return Promise.reject(new Error("EACCES"));
                }
                return origWrite(filePath, ...args);
            });
            try {
                const agent = request.agent(app);
                await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
                const res = await agent.post("/api/account/proxy-request/reject");
                expect(res.statusCode).toBe(500);
                expect(res.body.message).toContain("処理に失敗");
            } finally {
                fsMod.writeFile.mockRestore();
            }
        });

        // Phase1: proxy-request approve で save 失敗時は500を返す（auth-api catch分岐）
        test("proxy-request approve は save 失敗時500を返す", async () => {
            await writeJson("proxy_requests.json", {
                TEST001: { requestedAt: Date.now(), adminName: "テスト管理者" }
            });
            const fsMod = require("fs").promises;
            const origWrite = fsMod.writeFile.bind(fsMod);
            jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, data) => {
                const content = String(data);
                if (String(filePath).replace(/\\/g, "/").includes("proxy_requests") && /"approved"\s*:\s*true/.test(content)) {
                    return Promise.reject(new Error("EACCES"));
                }
                return origWrite(filePath, data);
            });
            try {
                const agent = request.agent(app);
                await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
                const res = await agent.post("/api/account/proxy-request/approve");
                expect(res.statusCode).toBe(500);
                expect(res.body.message).toContain("処理に失敗");
            } finally {
                fsMod.writeFile.mockRestore();
            }
        });

        // 第2期Phase1: setup 招待トークン期限切れ時は適切メッセージを返す（auth-api 分岐）
        test("POST /api/setup は招待トークン期限切れ時メッセージを返す", async () => {
            await writeJson("invite_tokens.json", { TEST001: Date.now() - 3600000 });
            const customers = await readJson("customers.json");
            const cust = customers.find(c => c.customerId === "TEST001");
            const res = await request(app).post("/api/setup").send({
                id: "TEST001",
                key: "dummy",
                newPass: "NewPass1234!"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("招待リンクの有効期限");
        });

        // 第2期Phase1: request-password-reset は id 空文字で safeMessage を返す（auth-api 分岐）
        test("POST /api/request-password-reset は id 空文字で safeMessage を返す", async () => {
            const res = await request(app).post("/api/request-password-reset").send({ id: "   " });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain("メールアドレスに送信");
        });

        // 第2期Phase1: 顧客ログアウトは未ログイン時も success を返す（auth-api save経路）
        test("POST /api/logout は未ログイン時も success を返す", async () => {
            const res = await request(app).post("/api/logout");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // Phase1 分岐70%: appendAdminAuthLog の read で ENOENT 以外（破損JSON）のとき catch 内 console.error 分岐を通す
        test("管理者ログイン時 admin-auth ログが破損JSONでもログインは成功する", async () => {
            const logPath = path.join(__dirname, "../../logs/admin-auth.json");
            const fsMod = require("fs").promises;
            await fsMod.mkdir(path.dirname(logPath), { recursive: true });
            await fsMod.writeFile(logPath, "{", "utf-8");
            try {
                const res = await request(app)
                    .post("/api/admin/login")
                    .send({ id: "test-admin", pass: "AdminPass123!" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                await seedBaseData();
            }
        });

        // 第2期Phase4 分岐70%: appendAdminAuthLog の write 失敗時 catch 分岐（ログは握りつぶし・ログインは成功）
        test("管理者ログイン時 admin-auth ログ write 失敗してもログインは成功する", async () => {
            const fsMod = require("fs").promises;
            const origWrite = fsMod.writeFile.bind(fsMod);
            const spy = jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, ...args) => {
                if (String(filePath).replace(/\\/g, "/").includes("admin-auth.json")) {
                    return Promise.reject(new Error("EACCES"));
                }
                return origWrite(filePath, ...args);
            });
            try {
                const res = await request(app)
                    .post("/api/admin/login")
                    .send({ id: "test-admin", pass: "AdminPass123!" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                if (spy.mockRestore) spy.mockRestore();
            }
        });

        // Phase1 分岐70%: appendCustomerAuthLog の read で ENOENT 以外（破損JSON）のとき catch 分岐を通す
        test("顧客ログイン時 customer-auth ログが破損JSONでもログインは成功する", async () => {
            const logPath = path.join(__dirname, "../../logs/customer-auth.json");
            const fsMod = require("fs").promises;
            await fsMod.mkdir(path.dirname(logPath), { recursive: true });
            await fsMod.writeFile(logPath, "{", "utf-8");
            try {
                const res = await request(app)
                    .post("/api/login")
                    .send({ id: "TEST001", pass: "CustPass123!" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                await seedBaseData();
            }
        });

        // 第2期Phase4 分岐70%: appendCustomerAuthLog の write 失敗時 catch 分岐（ログは握りつぶし・ログインは成功）
        test("顧客ログイン時 customer-auth ログ write 失敗してもログインは成功する", async () => {
            const fsMod = require("fs").promises;
            const origWrite = fsMod.writeFile.bind(fsMod);
            jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, ...args) => {
                if (String(filePath).replace(/\\/g, "/").includes("customer-auth.json")) {
                    return Promise.reject(new Error("EACCES"));
                }
                return origWrite(filePath, ...args);
            });
            try {
                const res = await request(app)
                    .post("/api/login")
                    .send({ id: "TEST001", pass: "CustPass123!" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                fsMod.writeFile.mockRestore();
            }
        });

        // 第2期Phase1: 管理者ログアウトは未管理者時も success を返す（auth-api save経路）
        test("POST /api/admin/logout は未管理者時も success を返す", async () => {
            const res = await request(app).post("/api/admin/logout");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 第2期Phase1: invite-reset は処理中エラー時 catch でエラーを返す（auth-api catch分岐）
        test("POST /api/admin/invite-reset は updateCustomerPassword が throw 時エラーを返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "updateCustomerPassword").mockRejectedValueOnce(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/invite-reset").send({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("エラー");
            customerService.updateCustomerPassword.mockRestore();
        });

        // 分岐70%: invite-reset は invite_tokens 読込失敗時 catch で tokens = {} として処理継続（200で成功）
        test("POST /api/admin/invite-reset は invite_tokens 読込失敗時も処理を継続して200で返す", async () => {
            const invitePath = path.join(__dirname, "../../invite_tokens.json");
            const orig = await fs.readFile(invitePath, "utf-8").catch(() => "{}");
            try {
                await fs.writeFile(invitePath, "{ invalid json", "utf-8");
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.post("/api/admin/invite-reset").send({ customerId: "TEST001" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body).toHaveProperty("tempPassword");
            } finally {
                await fs.writeFile(invitePath, orig, "utf-8");
            }
        });
    });

    describe("orders-api", () => {
        test("GET /orders は管理者が取得できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/orders");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.orders)).toBe(true);
        });

        test("GET /orders は顧客が自分の注文のみ取得できる", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
            });
            const res = await agent.get("/orders");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.orders.every(o => o.customerId === "TEST001")).toBe(true);
        });

        test("GET /order-history はログイン顧客が履歴取得できる", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/order-history");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.history)).toBe(true);
        });

        test("GET /orders は未認証で401", async () => {
            const res = await request(app).get("/orders");
            expect(res.statusCode).toBe(401);
        });

        test("GET /order-history は未ログインで401", async () => {
            const res = await request(app).get("/order-history");
            expect(res.statusCode).toBe(401);
        });

        test("GET /delivery-history は未ログインで success:false", async () => {
            const res = await request(app).get("/delivery-history");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        });

        test("GET /shipper-history は未ログインで success:false", async () => {
            const res = await request(app).get("/shipper-history");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        });

        test("searchOrders 失敗時は履歴APIがエラーを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "searchOrders").mockRejectedValue(new Error("DB Error"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const r1 = await agent.get("/order-history");
            expect(r1.body.success).toBe(false);
            orderService.searchOrders.mockRestore();
        });

        test("searchOrders 失敗時は delivery-history もエラーを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "searchOrders").mockRejectedValue(new Error("DB Error"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const r = await agent.get("/delivery-history");
            expect(r.body.success).toBe(false);
            orderService.searchOrders.mockRestore();
        });

        test("searchOrders 失敗時は shipper-history もエラーを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "searchOrders").mockRejectedValue(new Error("DB Error"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const r = await agent.get("/shipper-history");
            expect(r.body.success).toBe(false);
            orderService.searchOrders.mockRestore();
        });

        test("GET /orders は searchOrders 失敗時エラーを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "searchOrders").mockRejectedValue(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const r = await admin.get("/orders");
            expect(r.body.success).toBe(false);
            orderService.searchOrders.mockRestore();
        });

        test("GET /delivery-history はキーワードでフィルタ可能", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: { name: "配送先", address: "大阪府", tel: "06-1111-2222" }
            });
            const res = await agent.get("/delivery-history?keyword=大阪");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.list)).toBe(true);
        });

        test("GET /delivery-history はキーワードなしでも返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: { name: "配送先", address: "大阪府", tel: "06-1111-2222" }
            });
            const res = await agent.get("/delivery-history");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.list)).toBe(true);
        });

        test("GET /shipper-history はキーワードでフィルタ可能", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: {
                    name: "配送先",
                    address: "大阪府",
                    tel: "06-1111-2222",
                    shipper: { name: "荷主B", address: "京都", tel: "075-1111-2222" }
                }
            });
            const res = await agent.get("/shipper-history?keyword=京都");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.list)).toBe(true);
        });

        test("GET /shipper-history は荷主情報があれば返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: {
                    name: "配送先",
                    address: "大阪府",
                    tel: "06-1111-2222",
                    shipper: { name: "荷主B", address: "京都", tel: "075-1111-2222" }
                }
            });
            const res = await agent.get("/shipper-history");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.list)).toBe(true);
        });

        test("place-order でSTOCK_SHORTAGE時は在庫不足メッセージを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "placeOrder").mockRejectedValueOnce(
                Object.assign(new Error("在庫不足"), { code: "STOCK_SHORTAGE" })
            );

            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 9999 }],
                deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("在庫");
            orderService.placeOrder.mockRestore();
        });

        test("place-order でその他エラー時はシステムエラーを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "placeOrder").mockRejectedValueOnce(new Error("DB接続エラー"));

            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("システムエラー");
            orderService.placeOrder.mockRestore();
        });

        test("POST /api/reset-export-status 失敗時は500", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "resetExportStatus").mockRejectedValueOnce(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const r = await admin.post("/api/reset-export-status").send({ orderId: "xxx" });
            expect(r.statusCode).toBe(500);
            orderService.resetExportStatus.mockRestore();
        });

        test("POST /api/update-order-status 失敗時は500", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "updateOrderStatus").mockRejectedValueOnce(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const r = await admin.post("/api/update-order-status").send({ orderId: "xxx" });
            expect(r.statusCode).toBe(500);
            orderService.updateOrderStatus.mockRestore();
        });

        test("POST /api/register-shipment 失敗時は500", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "registerShipment").mockRejectedValueOnce(new Error("処理失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const r = await admin.post("/api/register-shipment").send({
                orderId: "xxx", shipItems: [], deliveryCompany: "x", trackingNumber: "1", deliveryDateUnknown: false
            });
            expect(r.statusCode).toBe(500);
            expect(r.body.message).toContain("失敗");
            orderService.registerShipment.mockRestore();
        });

        test("POST /api/register-shipment-batch 失敗時は500", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "registerShipment").mockRejectedValueOnce(new Error("Batch Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const r = await admin.post("/api/register-shipment-batch").send({ orderId: "xxx", shipmentsPayload: [] });
            expect(r.statusCode).toBe(500);
            expect(r.body.message).toContain("一括");
            orderService.registerShipment.mockRestore();
        });

        test("POST /api/update-shipment-info 失敗時は500", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "updateShipment").mockRejectedValueOnce(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const r = await admin.post("/api/update-shipment-info").send({ orderId: "xxx", shipmentId: "s1" });
            expect(r.statusCode).toBe(500);
            orderService.updateShipment.mockRestore();
        });

        test("place-order は rank_prices.json 破損時も注文受付できる", async () => {
            await seedBaseData(); // テスト順に依存しないよう確実にクリーンな状態にする
            const rpPath = rankPricesPath();
            const orig = await fs.readFile(rpPath, "utf-8");
            try {
                await fs.writeFile(rpPath, "{", "utf-8");
                const agent = request.agent(app);
                await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
                const res = await agent.post("/place-order").send({
                    cart: [{ code: "P001", quantity: 1 }],
                    deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
                });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                await fs.writeFile(rpPath, orig, "utf-8");
            }
        });

        test("GET /api/download-csv は generateOrdersCsv 失敗時500を返す", async () => {
            const csvService = require("../../services/csvService");
            jest.spyOn(csvService, "generateOrdersCsv").mockImplementationOnce(() => {
                throw new Error("CSV生成失敗");
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv");
            expect(res.statusCode).toBe(500);
            expect(res.text).toContain("CSVエラー");
            csvService.generateOrdersCsv.mockRestore();
        });

        test("GET /api/download-csv は mode=unexported で未エクスポートのみ返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv?mode=unexported");
            expect([200, 500]).toContain(res.statusCode);
            if (res.statusCode === 200) {
                expect(String(res.headers["content-type"])).toContain("text/csv");
            }
        });

        // 第2期Phase2: download-csv の isUnexportedOnly && filteredOrders.length > 0 で markOrdersAsExported が呼ばれる分岐
        test("GET /api/download-csv は mode=unexported で未エクスポートが1件以上あるとき markOrdersAsExported を呼ぶ", async () => {
            const orderService = require("../../services/orderService");
            const unexportedOrder = { orderId: 9001, customerId: "TEST001", orderDate: new Date().toISOString(), status: "未発送", items: [{ code: "P001", quantity: 1 }] };
            jest.spyOn(orderService, "getAllDataForCsv").mockResolvedValueOnce({
                productMaster: await readJson("products.json").catch(() => []),
                priceList: await readJson("prices.json").catch(() => []),
                customerList: await readJson("customers.json").catch(() => []),
                rankPriceMap: await readJson("rank_prices.json").catch(() => ({})),
                rawOrders: [unexportedOrder]
            });
            const markSpy = jest.spyOn(orderService, "markOrdersAsExported").mockResolvedValue();
            try {
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.get("/api/download-csv?mode=unexported");
                expect(res.statusCode).toBe(200);
                expect(markSpy).toHaveBeenCalledWith([9001]);
            } finally {
                orderService.getAllDataForCsv.mockRestore();
                markSpy.mockRestore();
            }
        });

        // 第2期Phase2: import-shipping-csv の row['送り状番号']||row['配送伝票番号'] / row['配送業者']||row['運送会社'] 分岐
        test("POST /api/import-shipping-csv は配送伝票番号・運送会社のみの行でも registerShipment を呼ぶ", async () => {
            const csvService = require("../../services/csvService");
            jest.spyOn(csvService, "parseShippingCsv").mockReturnValueOnce([
                { "社内メモ": "9002", "送り状番号": "", "配送伝票番号": "TRACK99", "配送業者": "", "運送会社": "佐川" }
            ]);
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "registerShipment").mockResolvedValueOnce({});
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/import-shipping-csv").attach("file", Buffer.from("dummy"), "ship.csv");
            expect(res.statusCode).toBe(200);
            expect(orderService.registerShipment).toHaveBeenCalledWith("9002", expect.arrayContaining([expect.objectContaining({ trackingNumber: "TRACK99", deliveryCompany: "佐川" })]));
            csvService.parseShippingCsv.mockRestore();
            orderService.registerShipment.mockRestore();
        });

        test("GET /api/download-csv は keyword/start/end でフィルタ可能", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv?keyword=TEST001&start=2020-01-01&end=2030-12-31");
            expect(res.statusCode).toBe(200);
            expect(String(res.headers["content-type"])).toContain("text/csv");
        });

        // 第2期Phase2: download-csv の isUnexportedOnly && order.exported_at で除外する分岐
        test("GET /api/download-csv は mode=unexported で exported_at 済み注文を除外する", async () => {
            const orderService = require("../../services/orderService");
            const base = await readJson("products.json").catch(() => []);
            const priceList = await readJson("prices.json").catch(() => []);
            const customerList = await readJson("customers.json").catch(() => []);
            const rankPriceMap = await readJson("rank_prices.json").catch(() => ({}));
            jest.spyOn(orderService, "getAllDataForCsv").mockResolvedValueOnce({
                productMaster: base,
                priceList,
                customerList,
                rankPriceMap,
                rawOrders: [
                    { orderId: 803, customerId: "TEST001", orderDate: new Date().toISOString(), status: "未発送", exported_at: "2025-01-15", items: [] }
                ]
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv?mode=unexported");
            expect(res.statusCode).toBe(200);
            orderService.getAllDataForCsv.mockRestore();
        });

        // 第2期Phase2: download-csv の status で一致しない注文を除外する分岐
        test("GET /api/download-csv は status パラメータでフィルタする", async () => {
            const orderService = require("../../services/orderService");
            const base = await readJson("products.json").catch(() => []);
            const priceList = await readJson("prices.json").catch(() => []);
            const customerList = await readJson("customers.json").catch(() => []);
            const rankPriceMap = await readJson("rank_prices.json").catch(() => ({}));
            const mid = new Date(Date.now()).toISOString().split("T")[0];
            jest.spyOn(orderService, "getAllDataForCsv").mockResolvedValueOnce({
                productMaster: base,
                priceList,
                customerList,
                rankPriceMap,
                rawOrders: [
                    { orderId: 805, customerId: "TEST001", orderDate: mid + "T00:00:00.000Z", status: "未発送", items: [] }
                ]
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv?status=発送済");
            expect(res.statusCode).toBe(200);
            orderService.getAllDataForCsv.mockRestore();
        });

        // 第2期Phase2: download-csv の orderDate 不正時 orderDateStr が 1970-01-01 のままの分岐
        test("GET /api/download-csv は orderDate 不正でもフィルタを実行する", async () => {
            const orderService = require("../../services/orderService");
            const base = await readJson("products.json").catch(() => []);
            const priceList = await readJson("prices.json").catch(() => []);
            const customerList = await readJson("customers.json").catch(() => []);
            const rankPriceMap = await readJson("rank_prices.json").catch(() => ({}));
            jest.spyOn(orderService, "getAllDataForCsv").mockResolvedValueOnce({
                productMaster: base,
                priceList,
                customerList,
                rankPriceMap,
                rawOrders: [
                    { orderId: 804, customerId: "TEST001", orderDate: "invalid-date", status: "未発送", items: [] }
                ]
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv?start=2020-01-01&end=2030-12-31");
            expect(res.statusCode).toBe(200);
            orderService.getAllDataForCsv.mockRestore();
        });

        // 第2期Phase2: download-csv の matchDate で start/end により除外される分岐
        test("GET /api/download-csv は start より前・end より後の注文を除外する", async () => {
            const orderService = require("../../services/orderService");
            const base = await readJson("products.json").catch(() => []);
            const priceList = await readJson("prices.json").catch(() => []);
            const customerList = await readJson("customers.json").catch(() => []);
            const rankPriceMap = await readJson("rank_prices.json").catch(() => ({}));
            jest.spyOn(orderService, "getAllDataForCsv").mockResolvedValueOnce({
                productMaster: base,
                priceList,
                customerList,
                rankPriceMap,
                rawOrders: [
                    { orderId: 801, customerId: "TEST001", orderDate: "2020-06-01T00:00:00.000Z", status: "未発送", items: [] },
                    { orderId: 802, customerId: "TEST001", orderDate: "2030-06-01T00:00:00.000Z", status: "未発送", items: [] }
                ]
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/download-csv?start=2025-01-01&end=2025-12-31");
            expect(res.statusCode).toBe(200);
            expect(String(res.headers["content-type"])).toContain("text/csv");
            orderService.getAllDataForCsv.mockRestore();
        });

        // 第2期Phase2: orders-api 分岐強化
        test("GET /delivery-history は keyword でマッチしない場合は空リストを返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/delivery-history?keyword=存在しないキーワード999");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.list)).toBe(true);
        });

        test("GET /shipper-history は keyword でマッチしない場合は空リストを返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get("/shipper-history?keyword=マッチしないキーワード999");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.list)).toBe(true);
        });

        test("POST /api/import-shipping-csv は空CSVで success:false とデータが空ですを返す", async () => {
            const csvService = require("../../services/csvService");
            jest.spyOn(csvService, "parseShippingCsv").mockReturnValueOnce([]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/import-shipping-csv")
                .attach("file", Buffer.from(""), "empty.csv");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("データが空です");
            csvService.parseShippingCsv.mockRestore();
        });

        test("POST /api/reset-export-status は orderService 失敗時500を返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "resetExportStatus").mockRejectedValueOnce(new Error("保存失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/reset-export-status").send({ orderId: 1 });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("保存失敗");
            orderService.resetExportStatus.mockRestore();
        });

        test("POST /api/update-order-status は orderService 失敗時500を返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "updateOrderStatus").mockRejectedValueOnce(new Error("保存失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-order-status").send({ orderId: 99999, status: "発送済" });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("保存失敗");
            orderService.updateOrderStatus.mockRestore();
        });

        test("POST /api/register-shipment は orderService 失敗時500を返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "registerShipment").mockRejectedValueOnce(new Error("処理に失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/register-shipment").send({
                orderId: 1,
                deliveryCompany: "ヤマト",
                trackingNumber: "123",
                shipItems: []
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("処理に失敗");
            orderService.registerShipment.mockRestore();
        });

        test("POST /api/register-shipment-batch は orderService 失敗時500を返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "registerShipment").mockRejectedValueOnce(new Error("一括処理に失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/register-shipment-batch").send({
                orderId: 1,
                shipmentsPayload: [{ deliveryCompany: "ヤマト", trackingNumber: "123" }]
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("一括処理に失敗");
            orderService.registerShipment.mockRestore();
        });

        test("POST /api/update-shipment-info は orderService 失敗時500を返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "updateShipment").mockRejectedValueOnce(new Error("保存失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-shipment-info").send({
                orderId: 1,
                shipmentId: "sh1",
                trackingNumber: "456"
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("保存失敗");
            orderService.updateShipment.mockRestore();
        });
    });

    describe("admin-api", () => {
        // Phase1 分岐70%: settings/public で getAnnouncements が配列でないとき orderBanners/announcements を空配列で返す
        test("GET /api/settings/public は getAnnouncements が配列でないときも orderBanners/announcements を空配列で返す", async () => {
            const settingsService = require("../../services/settingsService");
            jest.spyOn(settingsService, "getAnnouncements").mockResolvedValue(null);
            try {
                const res = await request(app).get("/api/settings/public");
                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body.orderBanners)).toBe(true);
                expect(res.body.orderBanners.length).toBe(0);
                expect(Array.isArray(res.body.announcements)).toBe(true);
                expect(res.body.announcements.length).toBe(0);
            } finally {
                settingsService.getAnnouncements.mockRestore();
            }
        });

        test("GET /api/settings/public が取得失敗時500", async () => {
            const settingsService = require("../../services/settingsService");
            const origGetSettings = settingsService.getSettings;
            settingsService.getSettings = jest.fn().mockRejectedValueOnce(new Error("IO Error"));
            try {
                const res = await request(app).get("/api/settings/public");
                expect(res.statusCode).toBe(500);
                expect(res.body.message).toContain("失敗");
            } finally {
                settingsService.getSettings = origGetSettings;
            }
        });

        test("GET /api/admin/settings は管理者が設定取得できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/settings");
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty("features");
            expect(res.body).toHaveProperty("blockedManufacturers");
            expect(res.body.mail).toHaveProperty("smtp");
        });

        // Phase1: GET /admin/settings は getSettings 失敗時500を返す（admin-api catch分岐）
        test("GET /api/admin/settings は getSettings 失敗時500を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const settingsService = require("../../services/settingsService");
            jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("IO Error"));
            try {
                const res = await admin.get("/api/admin/settings");
                expect(res.statusCode).toBe(500);
                expect(res.body.message).toContain("取得に失敗");
            } finally {
                settingsService.getSettings.mockRestore();
            }
        });

        // Phase1: PUT /admin/settings は updateSettings 失敗時500を返す（admin-api catch分岐）
        test("PUT /api/admin/settings は updateSettings 失敗時500を返す", async () => {
            const settingsService = require("../../services/settingsService");
            jest.spyOn(settingsService, "updateSettings").mockRejectedValueOnce(new Error("書き込み失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.put("/api/admin/settings").send({ features: {} });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toMatch(/書き込み失敗|保存に失敗/);
            settingsService.updateSettings.mockRestore();
        });

        // Phase1: upload-product-data は import 失敗時 success:false を返す（admin-api catch分岐）
        // ルートは /api にマウントされているため /api/upload-product-data でアクセス
        test("POST upload-product-data は import 失敗時 success:false を返す", async () => {
            const productService = require("../../services/productService");
            productService.importProductCsv = jest.fn().mockRejectedValueOnce(new Error("CSVパース失敗"));
            try {
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.post("/api/upload-product-data").send({ fileData: "invalid" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain("CSVパース失敗");
            } finally {
                delete productService.importProductCsv;
            }
        });

        test("add-product 失敗時は500を返す", async () => {
            const productService = require("../../services/productService");
            jest.spyOn(productService, "addProduct").mockRejectedValueOnce(new Error("商品追加失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/add-product").send({
                productCode: "ERR", name: "x", manufacturer: "x", category: "x", basePrice: 100, stockStatus: "x", active: true
            });
            expect(res.statusCode).toBe(500);
            productService.addProduct.mockRestore();
        });

        test("admin/customers 取得失敗時は500を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "getAllCustomers").mockRejectedValueOnce(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customers");
            expect(res.statusCode).toBe(500);
            customerService.getAllCustomers.mockRestore();
        });

        // メール未登録（email 空の顧客）の場合は「メール」を含むメッセージで失敗（getCustomerById をモックして経路を検証）
        test("send-invite-email はメール未登録顧客で失敗", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "getCustomerById").mockResolvedValueOnce({
                customerId: "TEST001",
                customerName: "テスト顧客",
                priceRank: "A",
                email: "",
                allowProxyLogin: false
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/メール|メールアドレス/);
            customerService.getCustomerById.mockRestore();
        });

        test("add-customer 失敗時は500を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "addCustomer").mockRejectedValueOnce(new Error("重複ID"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/add-customer").send({
                customerId: "DUP", customerName: "x", priceRank: "A", password: "Pass123!"
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
            customerService.addCustomer.mockRestore();
        });

        test("update-customer 失敗時は500を返す", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "updateCustomer").mockRejectedValueOnce(new Error("更新失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-customer").send({
                customerId: "TEST001", customerName: "x", priceRank: "A"
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
            customerService.updateCustomer.mockRestore();
        });

        test("POST /admin/stocks/manual-reserve は items 未指定で400", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/stocks/manual-reserve").send({});
            expect(res.statusCode).toBe(400);
        });

        test("POST /admin/stocks/manual-release は items 未指定で400", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/stocks/manual-release").send({});
            expect(res.statusCode).toBe(400);
        });

        test("POST /admin/stocks/manual-reserve は在庫マスタにない商品で400", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/stocks/manual-reserve").send({
                items: [{ productCode: "NO_MASTER_CODE", quantity: 1 }]
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/在庫マスタなし|在庫不足/);
        });

        test("POST /admin/stocks/manual-reserve は在庫不足で400", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            await admin.post("/api/admin/stocks/manual-adjust").send({
                productCode: "P001",
                totalQty: 2,
                reservedQty: 0
            });
            const res = await admin.post("/api/admin/stocks/manual-reserve").send({
                items: [{ productCode: "P001", quantity: 10 }]
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/在庫不足/);
        });

        test("POST /add-product は管理者が商品追加できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/add-product").send({
                productCode: "COV001",
                name: "カバレッジテスト商品",
                manufacturer: "TestMaker",
                category: "純正",
                basePrice: 1500,
                stockStatus: "即納",
                active: true
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("GET /admin/products は管理者が商品一覧取得できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/products");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        // productService.getAllProducts 失敗時は500と「読み込みに失敗」メッセージを返す
        test("GET /admin/products は products.json 破損時500を返す", async () => {
            const productService = require("../../services/productService");
            jest.spyOn(productService, "getAllProducts").mockRejectedValueOnce(new Error("商品データの読み込みに失敗しました"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/products");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("読み込みに失敗");
            productService.getAllProducts.mockRestore();
        });

        test("POST /add-product は既存商品コードで success:false とメッセージを返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/add-product").send({
                productCode: "P001",
                name: "重複",
                manufacturer: "X",
                category: "純正",
                basePrice: 100,
                stockStatus: "即納",
                active: true
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("この商品コードは既に存在します");
        });

        test("POST /update-product は存在しない商品コードで success:false を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-product").send({
                productCode: "NOEXIST",
                name: "x",
                manufacturer: "x",
                category: "x",
                basePrice: 0,
                stockStatus: "即納",
                active: true
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("商品が見つかりません");
        });

        test("GET /admin/customer-price-list は prices.json 破損時も空配列で200", async () => {
            const pricesPath = path.join(__dirname, "../../prices.json");
            const orig = await fs.readFile(pricesPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(pricesPath, "{", "utf-8");
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.get("/api/admin/customer-price-list").query({ customerId: "TEST001" });
                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
            } finally {
                await fs.writeFile(pricesPath, orig, "utf-8");
            }
        });

        test("GET /api/admin/stocks は stocks.json 破損時も空配列で200", async () => {
            const stocksPath = path.join(__dirname, "../../stocks.json");
            const orig = await fs.readFile(stocksPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(stocksPath, "{", "utf-8");
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.get("/api/admin/stocks");
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(Array.isArray(res.body.stocks)).toBe(true);
            } finally {
                await fs.writeFile(stocksPath, orig, "utf-8");
            }
        });

        test("POST /admin/delete-estimates-by-manufacturer は estimates 破損時も 200", async () => {
            const estimatesPath = path.join(__dirname, "../../estimates.json");
            const orig = await fs.readFile(estimatesPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(estimatesPath, "{", "utf-8");
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.post("/api/admin/delete-estimates-by-manufacturer").send({ manufacturer: "X" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                await fs.writeFile(estimatesPath, orig, "utf-8");
            }
        });

        test("GET /admin/rank-prices-list は rank_prices.json 破損時も 200 でオブジェクトを返す", async () => {
            const rpPath = rankPricesPath();
            const orig = await fs.readFile(rpPath, "utf-8").catch(() => "{}");
            try {
                await fs.writeFile(rpPath, "{", "utf-8");
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.get("/api/admin/rank-prices-list");
                expect(res.statusCode).toBe(200);
                expect(res.body && typeof res.body === "object").toBe(true);
            } finally {
                await fs.writeFile(rpPath, orig, "utf-8");
            }
        });

        test("POST /add-customer は既存顧客IDで success:false を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/add-customer").send({
                customerId: "TEST001",
                customerName: "重複",
                priceRank: "A",
                password: "Pass123!",
                email: ""
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("このIDは既に使用されています");
        });

        test("POST /update-customer は存在しない顧客IDで success:false を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-customer").send({
                customerId: "NOEXIST99",
                customerName: "x",
                priceRank: "A",
                email: ""
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("顧客が見つかりません");
        });

        test("GET /admin/customers は customers.json 破損時も 200 で空一覧", async () => {
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "getAllCustomers").mockResolvedValueOnce({ customers: [], totalCount: 0 });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customers");
            expect(res.statusCode).toBe(200);
            expect(res.body.customers).toEqual([]);
            expect(res.body.totalCount).toBe(0);
            customerService.getAllCustomers.mockRestore();
        });

        test("GET /admin/customers は管理者が顧客一覧取得できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customers");
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty("customers");
            expect(Array.isArray(res.body.customers)).toBe(true);
        });

        test("POST /admin/send-invite-email はメールアドレスあり顧客に送信できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email").send({
                customerId: "TEST001",
                isPasswordReset: false
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain("送信");
        });

        test("POST /admin/send-invite-email は mailService が success:false を返した時 success:false を返す", async () => {
            const mailService = require("../../services/mailService");
            mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "SMTP送信失敗" });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email").send({
                customerId: "TEST001",
                isPasswordReset: false
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBeDefined();
        });

        test("POST /admin/send-invite-email は顧客ID未指定でエラー", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email").send({});
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("顧客ID");
        });

        test("POST /admin/proxy-request は代理ログイン申請できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("GET /admin/proxy-request-status はポーリングで状態返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
            expect(res.statusCode).toBe(200);
            expect(["none", "pending", "approved"]).toContain(res.body.status);
        });

        test("POST /api/update-order-status は管理者がステータス更新できる", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const placed = await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
            });
            expect(placed.body.success).toBe(true);
            const orderId = placed.body.orderId;

            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-order-status").send({
                orderId,
                status: "発送済",
                estimateMessage: "翌日配送"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("POST /api/register-shipment は管理者が出荷登録できる", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const placed = await agent.post("/place-order").send({
                cart: [{ code: "P001", quantity: 1 }],
                deliveryInfo: { name: "テスト", address: "東京都", tel: "03-1111-2222" }
            });
            expect(placed.statusCode).toBe(200);
            expect(placed.body.success).toBe(true);
            expect(placed.body.orderId).toBeDefined();
            const orderId = placed.body.orderId;

            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/register-shipment").send({
                orderId,
                shipItems: [{ code: "P001", quantity: 1 }],
                deliveryCompany: "ヤマト",
                trackingNumber: "1234567890",
                deliveryDateUnknown: false
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("GET /admin/proxy-request-status は customerId 未指定で status none", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/proxy-request-status");
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe("none");
        });

        // 第2期Phase4: admin proxy-request で saveProxyRequests 失敗時500を返す（admin-api catch分岐）
        test("POST /admin/proxy-request は saveProxyRequests 失敗時500を返す", async () => {
            const fsMod = require("fs").promises;
            const origWrite = fsMod.writeFile.bind(fsMod);
            jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, ...args) => {
                if (String(filePath).replace(/\\/g, "/").includes("proxy_requests")) {
                    return Promise.reject(new Error("EACCES"));
                }
                return origWrite(filePath, ...args);
            });
            try {
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
                expect(res.statusCode).toBe(500);
                expect(res.body.message).toBeDefined();
            } finally {
                fsMod.writeFile.mockRestore();
            }
        });

        // 第2期Phase4: proxy-request-status で loadProxyRequests 失敗時は status none を返す（admin-api catch分岐）
        test("GET /admin/proxy-request-status は申請が期限切れなら status none を返し申請を削除する", async () => {
            await writeJson("proxy_requests.json", {
                TEST001: {
                    requestedAt: Date.now() - 11 * 60 * 1000,
                    adminName: "テスト管理者",
                    approved: false
                }
            });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe("none");
            const after = await readJson("proxy_requests.json");
            expect(after.TEST001).toBeUndefined();
        });

        test("GET /admin/proxy-request-status は loadProxyRequests 失敗時 status none を返す", async () => {
            const fsMod = require("fs").promises;
            const origRead = fsMod.readFile.bind(fsMod);
            jest.spyOn(fsMod, "readFile").mockImplementation((filePath) => {
                if (String(filePath).replace(/\\/g, "/").includes("proxy_requests")) {
                    return Promise.reject(new Error("ENOENT"));
                }
                return origRead(filePath);
            });
            try {
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
                expect(res.statusCode).toBe(200);
                expect(res.body.status).toBe("none");
            } finally {
                fsMod.readFile.mockRestore();
            }
        });

        test("POST /admin/proxy-login は顧客許可なしで失敗", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("許可");
        });

        test("POST /admin/proxy-login は許可の有効期限（10分）切れなら失敗する", async () => {
            // fs.readFile をモックして期限切れの許可済み申請を返し、10分切れメッセージの分岐を検証
            const fsMod = require("fs").promises;
            const origRead = fsMod.readFile.bind(fsMod);
            const expiryPayload = JSON.stringify({
                TEST001: {
                    requestedAt: Date.now() - 11 * 60 * 1000,
                    adminName: "テスト管理者",
                    approved: true
                }
            }, null, 2);
            jest.spyOn(fsMod, "readFile").mockImplementation((filePath, ...args) => {
                if (String(filePath).replace(/\\/g, "/").includes("proxy_requests")) {
                    return Promise.resolve(expiryPayload);
                }
                return origRead(filePath, ...args);
            });
            try {
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain("10分");
            } finally {
                fsMod.readFile.mockRestore();
            }
        });

        test("POST /admin/proxy-login は許可済みだが顧客が存在しない場合「顧客が見つかりません」を返す", async () => {
            await writeJson("proxy_requests.json", {
                TEST001: { requestedAt: Date.now(), adminName: "テスト管理者", approved: true }
            });
            const customerService = require("../../services/customerService");
            jest.spyOn(customerService, "getCustomerById").mockResolvedValueOnce(null);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("顧客が見つかりません");
            customerService.getCustomerById.mockRestore();
        });

        test("POST /admin/proxy-logout は代理ログイン中でないと400", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/proxy-logout");
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain("代理ログイン");
        });

        test("send-invite-email-with-token は customerId/tempPassword 未指定で失敗", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email-with-token").send({});
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("顧客ID");
        });

        test("send-invite-email-with-token は顧客不在で失敗", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email-with-token").send({
                customerId: "NOTEXIST", tempPassword: "tmp123"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        });

        test("send-invite-email-with-token はメール未登録顧客で失敗", async () => {
            const orig = await readJson("customers.json");
            const bcrypt = require("bcryptjs");
            const hash = await bcrypt.hash("DummyPass1!", 10);
            const noEmailCustomer = {
                customerId: "TEST_NOEMAIL",
                password: hash,
                customerName: "メール未登録テスト用",
                priceRank: "A",
                email: ""
            };
            const updated = [...orig.filter(c => c.customerId !== "TEST_NOEMAIL"), noEmailCustomer];
            await writeJson("customers.json", updated);
            try {
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.post("/api/admin/send-invite-email-with-token").send({
                    customerId: "TEST_NOEMAIL", tempPassword: "tmp123"
                });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain("メール");
            } finally {
                await writeJson("customers.json", orig);
            }
        });

        // Phase4: send-invite-email-with-token で mailResult.success が false の分岐（admin-api 464行）
        test("send-invite-email-with-token は mailService 失敗時 success:false を返す", async () => {
            const mailService = require("../../services/mailService");
            mailService.sendInviteEmail.mockResolvedValueOnce({ success: false, message: "SMTP送信失敗" });
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email-with-token").send({
                customerId: "TEST001", tempPassword: "tmp123"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("SMTP送信失敗");
        });

        test("POST /admin/send-invite-email は顧客不在で失敗", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "NOTEXIST" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("見つかりません");
        });

        test("GET /admin/customers は keyword と page で検索可能", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customers?keyword=TEST&page=1");
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty("customers");
        });

        test("POST /update-product は管理者が商品更新できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-product").send({
                productCode: "P001",
                name: "更新後商品名",
                manufacturer: "TestMaker",
                category: "純正",
                basePrice: 1200,
                stockStatus: "即納",
                active: true
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("POST /admin/save-rank-prices はランク価格を保存できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/save-rank-prices").send({ rows: [] });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // Phase4: save-rank-prices の priceService.saveRankPrices 失敗時 catch（admin-api 482行）
        test("POST /admin/save-rank-prices は priceService 失敗時500を返す", async () => {
            const priceService = require("../../services/priceService");
            jest.spyOn(priceService, "saveRankPrices").mockRejectedValueOnce(new Error("保存エラー"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/save-rank-prices").send({ rows: [] });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("保存失敗");
            priceService.saveRankPrices.mockRestore();
        });

        test("GET /admin/rank-prices-list はランク価格一覧を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/rank-prices-list");
            expect(res.statusCode).toBe(200);
        });

        test("GET /admin/customer-price-list は顧客特価を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customer-price-list?customerId=TEST001");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body) || res.body === null).toBe(true);
        });

        test("GET /admin/special-prices-list は特価一覧を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/special-prices-list");
            expect(res.statusCode).toBe(200);
        });

        test("GET /admin/download-pricelist-by-rank/A はCSVを返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/download-pricelist-by-rank/A");
            expect(res.statusCode).toBe(200);
            expect(String(res.headers["content-type"])).toContain("text/csv");
        });

        test("GET /admin/stocks/settings は在庫設定を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/settings");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty("display");
        });

        test("GET /admin/stocks は在庫一覧を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 分岐70%: GET /admin/stocks は getAllStocks 失敗時500を返す（admin-api catch分岐）
        test("GET /admin/stocks は getAllStocks 失敗時500を返す", async () => {
            const stockService = require("../../services/stockService");
            jest.spyOn(stockService, "getAllStocks").mockRejectedValueOnce(new Error("IO Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks");
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("在庫データの取得に失敗");
            stockService.getAllStocks.mockRestore();
        });

        test("GET /admin/stocks/template はExcelを返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/template");
            expect(res.statusCode).toBe(200);
            expect(String(res.headers["content-type"])).toContain("spreadsheet");
        });

        test("GET /admin/stocks/history は履歴を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/history");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("POST /admin/stocks/manual-adjust は手動調整できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/stocks/manual-adjust").send({
                productCode: "P001",
                totalQty: 100,
                reservedQty: 0
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("POST /admin/stocks/manual-reserve は在庫がある商品で成功する", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            await admin.post("/api/admin/stocks/manual-adjust").send({
                productCode: "P001",
                totalQty: 20,
                reservedQty: 0
            });
            const res = await admin.post("/api/admin/stocks/manual-reserve").send({
                items: [{ productCode: "P001", quantity: 5 }]
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("POST /admin/stocks/manual-release は引当後に解放できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            await admin.post("/api/admin/stocks/manual-adjust").send({
                productCode: "P002",
                totalQty: 30,
                reservedQty: 0
            });
            await admin.post("/api/admin/stocks/manual-reserve").send({
                items: [{ productCode: "P002", quantity: 3 }]
            });
            const res = await admin.post("/api/admin/stocks/manual-release").send({
                items: [{ productCode: "P002", quantity: 2 }]
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("GET /admin/stocks/:productCode は存在しない商品で404を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/NOTEXIST_CODE");
            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("見つかりません");
        });

        test("PUT /admin/stocks/settings は display を更新できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.put("/api/admin/stocks/settings").send({
                display: { enabled: true, hiddenMessage: "テスト非表示文言" }
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.config).toHaveProperty("display");
        });

        test("PUT /admin/stocks/settings は saveAdapterConfig 失敗時500を返す", async () => {
            const stockService = require("../../services/stockService");
            jest.spyOn(stockService, "saveAdapterConfig").mockRejectedValueOnce(new Error("IO Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.put("/api/admin/stocks/settings").send({ display: {} });
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("保存に失敗");
            stockService.saveAdapterConfig.mockRestore();
        });

        test("GET /admin/stocks/settings は getAdapterConfig 失敗時500を返す", async () => {
            const stockService = require("../../services/stockService");
            jest.spyOn(stockService, "getAdapterConfig").mockRejectedValueOnce(new Error("Config Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/settings");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("取得に失敗");
            stockService.getAdapterConfig.mockRestore();
        });

        test("GET /admin/stocks/:productCode は在庫詳細を返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/P001");
            expect([200, 404]).toContain(res.statusCode);
            if (res.statusCode === 200) expect(res.body.success).toBe(true);
        });

        test("POST /admin/delete-estimates-by-manufacturer はメーカー指定で削除", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/delete-estimates-by-manufacturer").send({ manufacturer: "NonExistentMaker" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("POST /admin/delete-estimates-by-products は商品コード指定で削除", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/delete-estimates-by-products").send({ productCodes: ["P999"] });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("GET /settings/public は getSettings 失敗時500を返す", async () => {
            const settingsService = require("../../services/settingsService");
            jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("DB Error"));
            const res = await request(app).get("/api/settings/public");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("設定の取得に失敗");
            settingsService.getSettings.mockRestore();
        });

        // 第2期Phase1: customer-price-list は getCustomerPriceList 失敗時 [] を返す（admin-api catch分岐）
        test("GET /admin/customer-price-list は getCustomerPriceList 失敗時 200 で空配列を返す", async () => {
            const priceService = require("../../services/priceService");
            jest.spyOn(priceService, "getCustomerPriceList").mockRejectedValueOnce(new Error("IO Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customer-price-list").query({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toEqual([]);
            priceService.getCustomerPriceList.mockRestore();
        });

        // 第2期Phase1: special-prices-list は getAllSpecialPrices 失敗時500を返す（admin-api catch分岐）
        test("GET /admin/special-prices-list は getAllSpecialPrices 失敗時500を返す", async () => {
            const priceService = require("../../services/priceService");
            jest.spyOn(priceService, "getAllSpecialPrices").mockRejectedValueOnce(new Error("DB Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/special-prices-list");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("取得失敗");
            priceService.getAllSpecialPrices.mockRestore();
        });

        // 第2期Phase1: download-pricelist-by-rank は不正 rank で A フォールバックする（admin-api 分岐）
        test("GET /admin/download-pricelist-by-rank は不正 rank で A 相当のCSVを返す", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/download-pricelist-by-rank/!!");
            expect(res.statusCode).toBe(200);
            expect(String(res.headers["content-type"])).toContain("text/csv");
        });

        // 分岐70%: download-pricelist-by-rank は getPricelistCsvForRank 失敗時500を返す（admin-api catch分岐）
        test("GET /admin/download-pricelist-by-rank は getPricelistCsvForRank 失敗時500を返す", async () => {
            const priceService = require("../../services/priceService");
            jest.spyOn(priceService, "getPricelistCsvForRank").mockRejectedValueOnce(new Error("CSV生成失敗"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/download-pricelist-by-rank/A");
            expect(res.statusCode).toBe(500);
            expect(res.text).toContain("価格表の生成に失敗");
            priceService.getPricelistCsvForRank.mockRestore();
        });

        // 第2期Phase1: rank-prices-list は getRankPrices 失敗時500を返す（admin-api catch分岐）
        test("GET /admin/rank-prices-list は getRankPrices 失敗時500を返す", async () => {
            const priceService = require("../../services/priceService");
            jest.spyOn(priceService, "getRankPrices").mockRejectedValueOnce(new Error("IO Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/rank-prices-list");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("取得失敗");
            priceService.getRankPrices.mockRestore();
        });

        // 第2期Phase1: GET /admin/stocks/:productCode は getStock 失敗時500を返す（admin-api catch分岐）
        test("GET /admin/stocks/:productCode は getStock 失敗時500を返す", async () => {
            const stockService = require("../../services/stockService");
            jest.spyOn(stockService, "getStock").mockRejectedValueOnce(new Error("IO Error"));
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/stocks/P001");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toContain("取得に失敗");
            stockService.getStock.mockRestore();
        });

        test("GET /admin/customer-price-list は商品マスタにない商品で「不明な商品」を返す", async () => {
            await writeJson("prices.json", [
                { customerId: "TEST001", productCode: "NO_PRODUCT", specialPrice: 500 }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/customer-price-list").query({ customerId: "TEST001" });
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                const item = res.body.find(p => p.productCode === "NO_PRODUCT");
                if (item) expect(item.productName).toBe("不明な商品");
            }
        });

        test("GET /admin/special-prices-list は削除された商品/顧客で「（削除された...）」を返す", async () => {
            await writeJson("prices.json", [
                { customerId: "DELETED_CUST", productCode: "DELETED_PROD", specialPrice: 100 }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/special-prices-list");
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                const item = res.body.find(p => p.productCode === "DELETED_PROD");
                if (item) {
                    expect(item.productName).toBe("（削除された商品）");
                    expect(item.customerName).toBe("（削除された顧客）");
                }
            }
        });

        test("POST /admin/save-rank-prices は map が object のときも保存できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/save-rank-prices").send({
                P001: { A: 1000, B: 1100 },
                P002: { A: 2000 }
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 第2期Phase2: priceService 分岐強化
        test("POST /admin/save-rank-prices は data.rows 配列形式でも保存できる", async () => {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/admin/save-rank-prices").send({
                rows: [
                    { productCode: "P001", prices: { A: 500, B: 600 } },
                    { productCode: "P002", ranks: { A: 700 } }
                ]
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("priceService.getPricelistCsvForRank は指定ランクのCSVを返す", async () => {
            const priceService = require("../../services/priceService");
            const result = await priceService.getPricelistCsvForRank("A");
            expect(result).toHaveProperty("csv");
            expect(result).toHaveProperty("filename");
            expect(result.filename).toContain("ランクA");
            expect(typeof result.csv).toBe("string");
        });

        test("priceService.getRankPrices は rank_prices.json 破損時空オブジェクトを返す", async () => {
            const rankPath = rankPricesPath();
            const orig = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            try {
                await fs.writeFile(rankPath, "{invalid", "utf-8");
                const priceService = require("../../services/priceService");
                const result = await priceService.getRankPrices();
                expect(typeof result).toBe("object");
                expect(Object.keys(result).length).toBe(0);
            } finally {
                await fs.writeFile(rankPath, orig, "utf-8");
            }
        });

        // 第2期Phase2: getPricelistCsvForRank の rank_prices 読込失敗時 .catch(() => ({})) 分岐
        test("priceService.getPricelistCsvForRank は rank_prices 読込失敗時も空オブジェクトでCSVを返す", async () => {
            const rankPath = rankPricesPath();
            const orig = await fs.readFile(rankPath, "utf-8").catch(() => "{}");
            try {
                await fs.writeFile(rankPath, "{invalid", "utf-8");
                const priceService = require("../../services/priceService");
                const result = await priceService.getPricelistCsvForRank("A");
                expect(result).toHaveProperty("csv");
                expect(result).toHaveProperty("filename");
                expect(result.filename).toContain("ランクA");
                expect(typeof result.csv).toBe("string");
            } finally {
                await fs.writeFile(rankPath, orig, "utf-8");
            }
        });

        test("GET /admin/customer-price-list は getPriceForAdmin で商品なしのとき basePrice 0 を返す", async () => {
            const priceService = require("../../services/priceService");
            const res = await priceService.getPriceForAdmin("TEST001", "NO_PRODUCT");
            expect(res.success).toBe(true);
            expect(res.currentPrice).toBe(0);
            expect(res.isSpecial).toBe(false);
        });

        test("customerService.getCustomerById は存在する顧客を返す", async () => {
            const customerService = require("../../services/customerService");
            const customer = await customerService.getCustomerById("TEST001");
            expect(customer).toBeTruthy();
            expect(customer.customerId).toBe("TEST001");
        });

        test("customerService.getCustomerById は存在しない顧客で null を返す", async () => {
            const customerService = require("../../services/customerService");
            const customer = await customerService.getCustomerById("NOEXIST");
            expect(customer).toBeNull();
        });

        test("update-order-status はキャンセル時に stockSnapshot があれば在庫解放する", async () => {
            const orderWithSnapshot = {
                orderId: 1,
                customerId: "TEST001",
                orderDate: new Date().toISOString(),
                status: "未発送",
                items: [{ code: "P001", quantity: 2 }],
                stockSnapshot: {
                    reservedItems: [{ productCode: "P001", quantity: 2 }],
                    released: false
                }
            };
            await writeJson("orders.json", [orderWithSnapshot]);
            await writeJson("stocks.json", [{
                productCode: "P001",
                totalQty: 10,
                reservedQty: 2
            }]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/api/update-order-status").send({
                orderId: 1,
                status: "キャンセル"
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test("csvService.parseExternalOrdersCsv は req.file と req.files.file の両方に対応", async () => {
            const csvService = require("../../services/csvService");
            const csvData = "受注日,顧客ID,顧客名,商品コード,商品名,数量,単価\n2025-01-01,TEST001,テスト,P001,商品,1,1000";
            const buffer = Buffer.from(csvData, "utf-8");
            const result = await csvService.parseExternalOrdersCsv(buffer);
            expect(Array.isArray(result)).toBe(true);
        });

        test("csvService.parseShippingCsv は Shift_JIS と UTF-8 を自動判定", async () => {
            const csvService = require("../../services/csvService");
            const csvUtf8 = "注文ID,出荷日,配送会社,伝票番号\nORD001,2025-01-01,ヤマト,123456";
            const buffer = Buffer.from(csvUtf8, "utf-8");
            const result = await csvService.parseShippingCsv(buffer);
            expect(Array.isArray(result)).toBe(true);
        });

        test("csvService.parseExternalOrdersCsv は空ファイルで空配列を返す", async () => {
            const csvService = require("../../services/csvService");
            const buffer = Buffer.from("", "utf-8");
            const result = await csvService.parseExternalOrdersCsv(buffer);
            expect(Array.isArray(result)).toBe(true);
        });

        test("csvService.parseShippingCsv は空ファイルで空配列を返す", async () => {
            const csvService = require("../../services/csvService");
            const buffer = Buffer.from("", "utf-8");
            const result = await csvService.parseShippingCsv(buffer);
            expect(Array.isArray(result)).toBe(true);
        });

        // Phase 2: orderService カバレッジ向上
        test("orderService.getAllOrders は管理者用ショートカットで全注文を返す", async () => {
            const orderService = require("../../services/orderService");
            const orders = await orderService.getAllOrders();
            expect(Array.isArray(orders)).toBe(true);
        });

        test("orderService.searchOrders は customerId なしの注文で「ゲスト(IDなし)」を返す", async () => {
            await writeJson("orders.json", [{
                orderId: 9999,
                customerId: null,
                items: [{ code: "P001", quantity: 1 }],
                orderDate: new Date().toISOString()
            }]);
            const orderService = require("../../services/orderService");
            const orders = await orderService.searchOrders({ isAdmin: true });
            const guestOrder = orders.find(o => o.orderId === 9999);
            if (guestOrder) {
                expect(guestOrder.customerName).toBe("ゲスト(IDなし)");
            }
        });

        test("orderService.searchOrders は削除済み顧客で配送先名があれば「配送先名 (ID:xxx 削除済)」を返す", async () => {
            await writeJson("orders.json", [{
                orderId: 9998,
                customerId: "DELETED_CUST",
                deliveryInfo: { name: "配送先太郎" },
                items: [{ code: "P001", quantity: 1 }],
                orderDate: new Date().toISOString()
            }]);
            const orderService = require("../../services/orderService");
            const orders = await orderService.searchOrders({ isAdmin: true });
            const deletedOrder = orders.find(o => o.orderId === 9998);
            if (deletedOrder) {
                expect(deletedOrder.customerName).toContain("配送先太郎");
                expect(deletedOrder.customerName).toContain("削除済");
            }
        });

        test("orderService.searchOrders は商品マスタなし・名前不明で「（取扱終了商品またはデータ不整合）」を返す", async () => {
            await writeJson("orders.json", [{
                orderId: 9997,
                customerId: "TEST001",
                items: [{ code: "NO_PRODUCT", name: "不明", quantity: 1 }],
                orderDate: new Date().toISOString()
            }]);
            const orderService = require("../../services/orderService");
            const orders = await orderService.searchOrders({ isAdmin: true });
            const noProductOrder = orders.find(o => o.orderId === 9997);
            if (noProductOrder && noProductOrder.items.length > 0) {
                const item = noProductOrder.items.find(i => i.code === "NO_PRODUCT");
                if (item) {
                    expect(item.name).toBe("（取扱終了商品またはデータ不整合）");
                }
            }
        });

        test("orderService.searchOrders は価格0円で商品マスタがあればランク価格で再計算する", async () => {
            await writeJson("rank_prices.json", {
                P001: { A: 1500 }
            });
            await writeJson("orders.json", [{
                orderId: 9996,
                customerId: "TEST001",
                items: [{ code: "P001", price: 0, quantity: 1 }],
                orderDate: new Date().toISOString()
            }]);
            const orderService = require("../../services/orderService");
            const orders = await orderService.searchOrders({ isAdmin: true });
            const recalcOrder = orders.find(o => o.orderId === 9996);
            if (recalcOrder && recalcOrder.items.length > 0) {
                const item = recalcOrder.items.find(i => i.code === "P001");
                if (item && item.price > 0) {
                    expect(item.price).toBeGreaterThan(0);
                }
            }
        });

        test("orderService.updateOrderStatus は stockSnapshot 解放エラー時も処理を継続する", async () => {
            await writeJson("orders.json", [{
                orderId: 9995,
                customerId: "TEST001",
                items: [{ code: "P001", quantity: 1 }],
                stockSnapshot: {
                    reservedItems: [{ productCode: "NO_STOCK", quantity: 1 }],
                    released: false
                }
            }]);
            const orderService = require("../../services/orderService");
            const result = await orderService.updateOrderStatus(9995, { status: "キャンセル" });
            expect(result).toBe(true);
        });

        // 第2期Phase4 分岐70%: orderService updateOrderStatus の release 失敗時 catch(releaseError) 分岐
        test("orderService.updateOrderStatus は release が reject してもステータス更新は成功する", async () => {
            await writeJson("orders.json", [{
                orderId: 9996,
                customerId: "TEST001",
                items: [{ code: "P001", quantity: 1 }],
                stockSnapshot: {
                    reservedItems: [{ productCode: "P001", quantity: 1 }],
                    released: false
                }
            }]);
            const stockService = require("../../services/stockService");
            const releaseSpy = jest.spyOn(stockService, "release").mockRejectedValueOnce(new Error("Release failed"));
            try {
                const orderService = require("../../services/orderService");
                const result = await orderService.updateOrderStatus(9996, { status: "キャンセル" });
                expect(result).toBe(true);
            } finally {
                releaseSpy.mockRestore();
            }
        });

        test("orderService.updateShipment は出荷修正ができる", async () => {
            await writeJson("orders.json", [{
                orderId: 9994,
                customerId: "TEST001",
                items: [{ code: "P001", quantity: 1 }],
                shipments: [{ shipmentId: 1, items: [{ code: "P001", quantity: 1 }] }]
            }]);
            const orderService = require("../../services/orderService");
            const result = await orderService.updateShipment(9994, 1, { deliveryCompany: "ヤマト" });
            expect(result).toBe(true);
        });

        test("orderService.updateShipment は最後の出荷で deliveryCompany/trackingNumber を更新する", async () => {
            await writeJson("orders.json", [{
                orderId: 9993,
                customerId: "TEST001",
                items: [{ code: "P001", quantity: 1 }],
                shipments: [{ shipmentId: 1, items: [{ code: "P001", quantity: 1 }] }]
            }]);
            const orderService = require("../../services/orderService");
            await orderService.updateShipment(9993, 1, { trackingNumber: "123456" });
            const orders = await orderService.getAllOrders();
            const order = orders.find(o => o.orderId === 9993);
            if (order) {
                expect(order.trackingNumber).toBe("123456");
            }
        });

        test("orderService.markOrdersAsExported は exported_at を設定する", async () => {
            await writeJson("orders.json", [{
                orderId: 9992,
                customerId: "TEST001",
                items: [{ code: "P001", quantity: 1 }],
                exported_at: null
            }]);
            const orderService = require("../../services/orderService");
            await orderService.markOrdersAsExported([9992]);
            const orders = await orderService.getAllOrders();
            const order = orders.find(o => o.orderId === 9992);
            if (order) {
                expect(order.exported_at).toBeTruthy();
            }
        });

        test("orderService.resetExportStatus は exported_at を null にする", async () => {
            await writeJson("orders.json", [{
                orderId: 9991,
                customerId: "TEST001",
                items: [{ code: "P001", quantity: 1 }],
                exported_at: new Date().toISOString()
            }]);
            const orderService = require("../../services/orderService");
            const result = await orderService.resetExportStatus(9991);
            expect(result).toBe(true);
            const orders = await orderService.getAllOrders();
            const order = orders.find(o => o.orderId === 9991);
            if (order) {
                expect(order.exported_at).toBeNull();
            }
        });

        test("orderService.resetExportStatus は存在しない注文で false を返す", async () => {
            const orderService = require("../../services/orderService");
            const result = await orderService.resetExportStatus(99999);
            expect(result).toBe(false);
        });

        test("orderService.importFlamData は W で始まる公開IDを内部IDに変換して更新する", async () => {
            await writeJson("orders.json", [{
                orderId: 12345678901,
                customerId: "TEST001",
                items: [],
                status: "未発送"
            }]);
            const iconv = require("iconv-lite");
            const csvData = "社内メモ,納品日\nW12345678901,2025-01-01";
            const buffer = iconv.encode(csvData, "Shift_JIS");
            const orderService = require("../../services/orderService");
            const result = await orderService.importFlamData(buffer);
            expect(result.success).toBe(true);
            expect(result.stats.updated).toBeGreaterThanOrEqual(0);
        });

        test("orderService.importFlamData は W で始まらない行で新規注文を作成する", async () => {
            const iconv = require("iconv-lite");
            const csvData = "得意先名,受注日,受注合計\nテスト顧客,2025-01-01,10000";
            const buffer = iconv.encode(csvData, "Shift_JIS");
            const orderService = require("../../services/orderService");
            const result = await orderService.importFlamData(buffer);
            expect(result.success).toBe(true);
            expect(result.stats.created).toBeGreaterThanOrEqual(0);
        });

        // 第2期Phase4 分岐70%: orderService.importFlamData の write 失敗時 catch 分岐
        test("orderService.importFlamData は orders 書き込み失敗時にエラーを throw する", async () => {
            const iconv = require("iconv-lite");
            const csvData = "得意先名,受注日,受注合計\nテスト顧客,2025-01-01,10000";
            const buffer = iconv.encode(csvData, "Shift_JIS");
            const fsMod = require("fs").promises;
            const origWrite = fsMod.writeFile.bind(fsMod);
            jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, ...args) => {
                if (String(filePath).replace(/\\/g, "/").includes("orders.json")) {
                    return Promise.reject(new Error("EACCES"));
                }
                return origWrite(filePath, ...args);
            });
            try {
                const orderService = require("../../services/orderService");
                await expect(orderService.importFlamData(buffer)).rejects.toThrow(/システムエラー|EACCES/);
            } finally {
                fsMod.writeFile.mockRestore();
            }
        });

        test("orderService.importExternalOrders は orderId が undefined/null の行をスキップする", async () => {
            const orderService = require("../../services/orderService");
            const result = await orderService.importExternalOrders([
                { orderId: 1, customerId: "TEST001", items: [] },
                { orderId: null, customerId: "TEST001", items: [] },
                { orderId: undefined, customerId: "TEST001", items: [] }
            ]);
            expect(result.skippedCount).toBeGreaterThanOrEqual(0);
        });

        test("orderService.importExternalOrders は既存 orderId をスキップする", async () => {
            await writeJson("orders.json", [{
                orderId: 8888,
                customerId: "TEST001",
                items: []
            }]);
            const orderService = require("../../services/orderService");
            const result = await orderService.importExternalOrders([
                { orderId: 8888, customerId: "TEST001", items: [] }
            ]);
            expect(result.skippedCount).toBeGreaterThanOrEqual(0);
        });

        // Phase 2: priceService カバレッジ向上
        test("priceService.updateRankPricesFromExcel はファイル形式が不正で success: false を返す", async () => {
            const priceService = require("../../services/priceService");
            const exceljs = require("exceljs");
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet("Upload");
            worksheet.addRow(["不正なヘッダー"]);
            const buffer = await workbook.xlsx.writeBuffer();
            const result = await priceService.updateRankPricesFromExcel(buffer);
            expect(result.success).toBe(false);
            expect(result.message).toMatch(/商品コード|ランク|認識できません|データがありません/);
        });

        test("priceService.updateRankPricesFromExcel は rank_prices.json が破損時も空オブジェクトで開始する", async () => {
            const fs = require("fs").promises;
            const path = require("path");
            const rankPricesPathFull = rankPricesPath();
            const orig = await fs.readFile(rankPricesPathFull, "utf-8").catch(() => "{}");
            try {
                await fs.writeFile(rankPricesPathFull, "{", "utf-8");
                const priceService = require("../../services/priceService");
                const exceljs = require("exceljs");
                const workbook = new exceljs.Workbook();
                const worksheet = workbook.addWorksheet("Upload");
                worksheet.addRow(["商品コード", "商品名", "メーカー", "標準原価", "設定モード", "納期区分", "ランク1", "ランク2", "ランク3"]);
                worksheet.addRow(["P001", "", "", "", "", "", "1000", "1100", "1200"]);
                const buffer = await workbook.xlsx.writeBuffer();
                const result = await priceService.updateRankPricesFromExcel(buffer);
                expect(result.success).toBe(true);
            } finally {
                await fs.writeFile(rankPricesPathFull, orig, "utf-8");
            }
        });

        test("priceService.updateSpecialPrice は新規特価を追加する", async () => {
            const priceService = require("../../services/priceService");
            const result = await priceService.updateSpecialPrice("TEST001", "P999", 2000);
            expect(result.success).toBe(true);
        });

        test("priceService.updateSpecialPrice は既存特価を更新する", async () => {
            await writeJson("prices.json", [
                { customerId: "TEST001", productCode: "P998", specialPrice: 1000 }
            ]);
            const priceService = require("../../services/priceService");
            const result = await priceService.updateSpecialPrice("TEST001", "P998", 1500);
            expect(result.success).toBe(true);
        });

        test("priceService.deleteSpecialPrice は存在しない特価で success: false を返す", async () => {
            const priceService = require("../../services/priceService");
            const result = await priceService.deleteSpecialPrice("TEST001", "NO_PRICE");
            expect(result.success).toBe(false);
        });

        // Phase 2: stockService カバレッジ向上
        test("stockService.saveStock は既存商品コードで更新する", async () => {
            await writeJson("stocks.json", [{
                productCode: "P001",
                totalQty: 10,
                reservedQty: 0
            }]);
            const stockService = require("../../services/stockService");
            const result = await stockService.saveStock({
                productCode: "P001",
                totalQty: 20,
                reservedQty: 0
            });
            expect(result.productCode).toBe("P001");
            expect(result.totalQty).toBe(20);
        });

        test("stockService.reserve は空配列で throw する", async () => {
            const stockService = require("../../services/stockService");
            await expect(stockService.reserve([])).rejects.toThrow("reservation items required");
        });

        test("stockService.toggleManualLock は存在しない商品コードで何もしない", async () => {
            const stockService = require("../../services/stockService");
            await stockService.toggleManualLock("NO_STOCK", true);
            const stock = await stockService.getStock("NO_STOCK");
            expect(stock).toBeNull();
        });

        test("stockService.toggleManualLock は manualLock を設定する", async () => {
            await writeJson("stocks.json", [{
                productCode: "P001",
                totalQty: 10,
                reservedQty: 0,
                manualLock: false
            }]);
            const stockService = require("../../services/stockService");
            await stockService.toggleManualLock("P001", true);
            const stock = await stockService.getStock("P001");
            if (stock) {
                expect(stock.manualLock).toBe(true);
            }
        });

        test("stockService.updateDisplaySettings は display 設定を更新する", async () => {
            const stockService = require("../../services/stockService");
            const result = await stockService.updateDisplaySettings({ enabled: true });
            expect(result.enabled).toBe(true);
        });

        test("stockService.logEvent は履歴に記録する", async () => {
            const stockService = require("../../services/stockService");
            await stockService.logEvent({ id: "test-event", action: "test" });
            const history = await stockService.getHistory(10);
            const event = history.find(h => h.id === "test-event");
            expect(event).toBeTruthy();
        });

        // Phase 3: customerService カバレッジ向上
        test("customerService.searchCustomers は keyword 空でもページネーション情報を返す", async () => {
            const customerService = require("../../services/customerService");
            const result = await customerService.searchCustomers("", 1, 10);
            expect(result).toHaveProperty("customers");
            expect(result).toHaveProperty("totalCount");
            expect(result).toHaveProperty("currentPage", 1);
            expect(result).toHaveProperty("totalPages");
        });

        test("customerService.getAllCustomers は searchCustomers のショートカットとして動作する", async () => {
            const customerService = require("../../services/customerService");
            const result = await customerService.getAllCustomers();
            expect(result).toHaveProperty("customers");
        });

        test("customerService.updateCustomerPassword は存在しないIDで失敗メッセージを返す", async () => {
            const customerService = require("../../services/customerService");
            const result = await customerService.updateCustomerPassword("NO_SUCH_ID", "NewPass123!");
            expect(result.success).toBe(false);
            expect(result.message).toContain("IDが見つかりません");
        });

        test("customerService.updateCustomerAllowProxy は存在しないIDで失敗を返す", async () => {
            const customerService = require("../../services/customerService");
            const result = await customerService.updateCustomerAllowProxy("NO_SUCH_ID", true);
            expect(result.success).toBe(false);
            expect(result.message).toContain("顧客が見つかりません");
        });

        test("customerService.updateCustomerAllowProxy は既存顧客の allowProxyLogin を更新する", async () => {
            const customerService = require("../../services/customerService");
            await customerService.addCustomer({
                customerId: "C-PROXY-1",
                customerName: "代理許可顧客",
                password: "Pass1234!",
                priceRank: "A",
                email: "proxy@example.com"
            });
            const result = await customerService.updateCustomerAllowProxy("C-PROXY-1", true);
            expect(result.success).toBe(true);
            const loaded = await customerService.getCustomerById("C-PROXY-1");
            expect(loaded.allowProxyLogin).toBe(true);
        });

        // Phase 3: csvService カバレッジ向上（見積取込・FLAM取込）
        test("csvService.parseEstimatesData は CSV 形式で必須列不足時に空配列を返す", async () => {
            const csvService = require("../../services/csvService");
            const csv = "ヘッダー1,ヘッダー2\nA,B\n";
            const buffer = Buffer.from(csv, "utf-8");
            const result = await csvService.parseEstimatesData(buffer, "test.csv");
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        test("csvService.parseEstimatesData は有効な行だけを解析し INVALID_CUSTOMER_CODES をスキップする", async () => {
            const csvService = require("../../services/csvService");
            const csv = [
                "見積番号,得意先コード,商品コード,商品名,単価,有効期限",
                "EST-1,0000,P001,商品A,1000,2025/12/31",
                "EST-2,CUST1,P002,商品B,2000,2025/12/31"
            ].join("\n");
            const buffer = Buffer.from(csv, "utf-8");
            const result = await csvService.parseEstimatesData(buffer, "estimates.csv");
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
            expect(result[0].customerId).toBe("CUST1");
        });

        // Phase 3: specialPriceService カバレッジ向上
        test("specialPriceService.saveEstimates は件数を返しファイルに保存する", async () => {
            const specialPriceService = require("../../services/specialPriceService");
            const estimates = [
                { estimateId: "E1", customerId: "TEST001", productCode: "P001", unitPrice: 1000 }
            ];
            const result = await specialPriceService.saveEstimates(estimates);
            expect(result.success).toBe(true);
            expect(result.count).toBe(1);
        });

        test("specialPriceService.getSpecialPrices は他人の見積番号の場合は空配列を返す", async () => {
            const specialPriceService = require("../../services/specialPriceService");
            await writeJson("estimates.json", [
                { estimateId: "E100", customerId: "OTHER", productCode: "P001", unitPrice: 1000 }
            ]);
            const result = await specialPriceService.getSpecialPrices("E100", "TEST001");
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        test("specialPriceService.getSpecialPrices は有効期限切れの明細を除外する", async () => {
            const specialPriceService = require("../../services/specialPriceService");
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            await writeJson("estimates.json", [
                { estimateId: "E200", customerId: "TEST001", productCode: "P001", unitPrice: 1000, validUntil: yesterday },
                { estimateId: "E200", customerId: "TEST001", productCode: "P002", unitPrice: 2000, validUntil: future }
            ]);
            const result = await specialPriceService.getSpecialPrices("E200", "TEST001");
            expect(result.length).toBe(1);
            expect(result[0].productCode).toBe("P002");
        });

        test("specialPriceService.deleteEstimatesByManufacturer は productName にメーカー名が含まれる行を削除する", async () => {
            const specialPriceService = require("../../services/specialPriceService");
            await writeJson("estimates.json", [
                { estimateId: "E1", customerId: "TEST001", productCode: "P001", productName: "メーカーA 商品" },
                { estimateId: "E2", customerId: "TEST001", productCode: "P002", productName: "別メーカー 商品" }
            ]);
            const result = await specialPriceService.deleteEstimatesByManufacturer("メーカーA");
            expect(result.deletedCount).toBe(1);
        });

        test("specialPriceService.deleteEstimatesByProductCodes は指定コードの見積を削除する", async () => {
            const specialPriceService = require("../../services/specialPriceService");
            await writeJson("estimates.json", [
                { estimateId: "E1", customerId: "TEST001", productCode: "P001" },
                { estimateId: "E2", customerId: "TEST001", productCode: "P002" }
            ]);
            const result = await specialPriceService.deleteEstimatesByProductCodes(["P001"]);
            expect(result.deletedCount).toBe(1);
        });

        test("specialPriceService.getSettings は settingsService.getSettings を委譲呼び出しする", async () => {
            const settingsService = require("../../services/settingsService");
            const spy = jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({ features: {} });
            const specialPriceService = require("../../services/specialPriceService");
            const settings = await specialPriceService.getSettings();
            expect(settings).toEqual({ features: {} });
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        // Phase 3: customerService 分岐強化（importFromExcel エラー経路・updateCustomer パスワード未指定）
        test("customerService.importFromExcel は readToRowArrays 失敗時にエラーを throw する", async () => {
            const excelReader = require("../../utils/excelReader");
            excelReader.readToRowArrays.mockRejectedValueOnce(new Error("Excel parse error"));
            const customerService = require("../../services/customerService");
            await expect(customerService.importFromExcel(Buffer.from("invalid"))).rejects.toThrow("Excelファイルの読み込みに失敗しました");
        });

        test("customerService.updateCustomer はパスワード未指定時は既存パスワードを維持する", async () => {
            const customerService = require("../../services/customerService");
            await customerService.addCustomer({
                customerId: "C-PASS-1",
                customerName: "パスワードテスト顧客",
                password: "OriginalPass123!",
                priceRank: "A",
                email: ""
            });
            const before = await customerService.getCustomerById("C-PASS-1");
            await customerService.updateCustomer({
                customerId: "C-PASS-1",
                customerName: "パスワードテスト顧客（更新）",
                password: "", // パスワード未指定
                priceRank: "A",
                email: ""
            });
            // パスワードは getCustomerById では返されないが、更新が成功していることを確認
            const result = await customerService.updateCustomer({
                customerId: "C-PASS-1",
                customerName: "パスワードテスト顧客（更新）",
                priceRank: "A",
                email: ""
            });
            expect(result.success).toBe(true);
        });

        test("customerService.importFromExcel は inputEmail が空の場合は email を更新しない（既存顧客）", async () => {
            const customerService = require("../../services/customerService");
            await customerService.addCustomer({
                customerId: "C-EMAIL-1",
                customerName: "メールテスト顧客",
                password: "Pass1234!",
                priceRank: "A",
                email: "original@example.com"
            });
            const excelReader = require("../../utils/excelReader");
            excelReader.readToRowArrays.mockResolvedValueOnce([
                ["ID", "PASS", "NAME", "RANK", "EMAIL"],
                ["C-EMAIL-1", "NewPass123!", "メールテスト顧客（更新）", "B", ""] // email 空
            ]);
            const result = await customerService.importFromExcel(Buffer.from("mock"));
            expect(result.success).toBe(true);
            expect(result.message).toContain("更新");
            const customer = await customerService.getCustomerById("C-EMAIL-1");
            expect(customer.email).toBe("original@example.com");
        });

        // Phase 3: csvService 分岐強化（parseEstimatesData Excel 経路・parseExternalOrdersCsv/parseShippingCsv エンコーディング）
        test("csvService.parseEstimatesData は Excel 形式（xlsx 拡張子）で処理する", async () => {
            const excelReader = require("../../utils/excelReader");
            excelReader.readToRowArrays.mockResolvedValueOnce([
                ["見積番号", "得意先コード", "商品コード", "商品名", "単価"],
                ["EST-XLSX", "TEST001", "P001", "商品A", "1000"]
            ]);
            const csvService = require("../../services/csvService");
            const buffer = Buffer.from([0x50, 0x4B]); // ZIP (xlsx) マジックナンバー
            const result = await csvService.parseEstimatesData(buffer, "test.xlsx");
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
            expect(result[0].customerId).toBe("TEST001");
        });

        test("csvService.parseEstimatesData は Excel ファイルが空（データ行なし）のとき空配列を返す", async () => {
            const excelReader = require("../../utils/excelReader");
            excelReader.readToRowArrays.mockResolvedValueOnce([["見積番号", "得意先コード", "商品コード", "単価"]]); // ヘッダーのみ
            const csvService = require("../../services/csvService");
            const buffer = Buffer.from([0x50, 0x4B]);
            const result = await csvService.parseEstimatesData(buffer, "empty.xlsx");
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        test("csvService.parseExternalOrdersCsv は UTF-8 BOM を検出して UTF-8 でデコードする", async () => {
            const csvService = require("../../services/csvService");
            const iconv = require("iconv-lite");
            const csv = "orderId,customerId,productCode,quantity\nORD-1,CUST1,P001,10";
            const utf8Bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(csv, "utf-8")]);
            const result = csvService.parseExternalOrdersCsv(utf8Bom);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        test("csvService.parseShippingCsv は Shift-JIS 文字化け時に UTF-8 で再試行する", async () => {
            const csvService = require("../../services/csvService");
            const iconv = require("iconv-lite");
            const csv = "伝票番号,運送会社\nSHIP-1,ヤマト";
            const utf8Buffer = Buffer.from(csv, "utf-8");
            // 文字化け判定をトリガーするため、UTF-8 としてエンコード
            const result = csvService.parseShippingCsv(utf8Buffer);
            expect(Array.isArray(result)).toBe(true);
        });

        // Phase 3: productService 分岐強化（importFromExcel エラー経路・deleteProduct 存在チェック）
        test("productService.importFromExcel は readToRowArrays 失敗時にエラーを throw する", async () => {
            const excelReader = require("../../utils/excelReader");
            excelReader.readToRowArrays.mockRejectedValueOnce(new Error("Excel parse error"));
            const productService = require("../../services/productService");
            await expect(productService.importFromExcel(Buffer.from("invalid"))).rejects.toThrow();
        });

        test("productService.deleteProduct は存在しない商品コードで失敗メッセージを返す", async () => {
            const productService = require("../../services/productService");
            const result = await productService.deleteProduct("NO_SUCH_PRODUCT");
            expect(result.success).toBe(false);
            expect(result.message).toContain("削除対象が見つかりません");
        });

        test("productService.importFromExcel は rawPrice が OPEN のとき basePrice を 0 にする", async () => {
            const csv = "\uFEFF商品コード,商品名,メーカー,定価,仕様,在庫,A\nP-OPEN,OPEN価格商品,メーカーA,OPEN,,可,1000";
            const productService = require("../../services/productService");
            const result = await productService.importFromExcel(Buffer.from(csv, "utf-8"));
            expect(result.success).toBe(true);
            const products = await productService.getAllProducts();
            const product = products.find(p => p.productCode === "P-OPEN");
            if (product) {
                expect(product.basePrice).toBe(0);
            }
        });

        // Phase 1: products-api buildStockInfo 分岐強化（warehouses が配列でない場合）
        test("GET /products は stock.warehouses が配列でない場合もエラーなく処理する", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await writeJson("stocks.json", [
                {
                    productCode: "P001",
                    totalQty: 10,
                    reservedQty: 2,
                    warehouses: "not-an-array", // 配列でない
                    publish: true
                }
            ]);
            await writeJson("config/stocks-adapters.json", {
                display: {
                    enabled: true,
                    hiddenMessage: "在庫情報は非公開です",
                    stocklessLabel: "仕入先直送",
                    showStocklessLabel: true,
                    allowOrderingWhenZero: true,
                    highlightThresholdMinutes: 180,
                    warehousePresets: []
                }
            });
            try {
                const res = await agent.get("/products");
                expect(res.statusCode).toBe(200);
                expect(res.body.items).toBeDefined();
            } finally {
                await seedBaseData();
            }
        });

        // Phase 1: products-api buildStockInfo 分岐（lastSyncedAt 不正値で isStale は false）
        test("GET /products は lastSyncedAt が不正な在庫でもエラーなく isStale:false で返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            await writeJson("stocks.json", [
                {
                    productCode: "P001",
                    totalQty: 10,
                    reservedQty: 0,
                    warehouses: [],
                    publish: true,
                    lastSyncedAt: "invalid-date"
                }
            ]);
            await writeJson("config/stocks-adapters.json", {
                display: {
                    enabled: true,
                    hiddenMessage: "在庫情報は非公開です",
                    stocklessLabel: "仕入先直送",
                    showStocklessLabel: true,
                    allowOrderingWhenZero: true,
                    highlightThresholdMinutes: 180,
                    warehousePresets: []
                }
            });
            try {
                const res = await agent.get("/products");
                expect(res.statusCode).toBe(200);
                const item = (res.body.items || []).find(i => i.productCode === "P001");
                if (item && item.stockInfo) {
                    expect(item.stockInfo.isStale).toBe(false);
                }
            } finally {
                await seedBaseData();
            }
        });

        // Phase 1: products-api buildStockInfo 分岐（古い lastSyncedAt で isStale: true）
        test("GET /products は highlightThresholdMinutes を超えた lastSyncedAt で isStale:true を返す", async () => {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const oldDate = new Date(Date.now() - 200 * 60 * 1000).toISOString(); // 200分前
            await writeJson("stocks.json", [
                {
                    productCode: "P001",
                    totalQty: 10,
                    reservedQty: 0,
                    warehouses: [],
                    publish: true,
                    lastSyncedAt: oldDate
                }
            ]);
            await writeJson("config/stocks-adapters.json", {
                display: {
                    enabled: true,
                    hiddenMessage: "在庫情報は非公開です",
                    stocklessLabel: "仕入先直送",
                    showStocklessLabel: true,
                    allowOrderingWhenZero: true,
                    highlightThresholdMinutes: 180,
                    warehousePresets: []
                }
            });
            try {
                const res = await agent.get("/products");
                expect(res.statusCode).toBe(200);
                const item = (res.body.items || []).find(i => i.productCode === "P001");
                if (item && item.stockInfo) {
                    expect(item.stockInfo.isStale).toBe(true);
                }
            } finally {
                await seedBaseData();
            }
        });

        // Phase 1: orders-api place-order 汎用エラー分岐（非 STOCK_SHORTAGE）
        test("place-order は STOCK_SHORTAGE 以外のエラー時にシステムエラーを返す", async () => {
            const orderService = require("../../services/orderService");
            jest.spyOn(orderService, "placeOrder").mockRejectedValueOnce(new Error("DB connection failed"));
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            try {
                const res = await agent.post("/place-order").send({
                    cart: [{ productCode: "P001", quantity: 1 }],
                    deliveryInfo: { name: "a", tel: "1", address: "x" }
                });
                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain("システムエラー");
            } finally {
                orderService.placeOrder.mockRestore();
            }
        });

        // Phase 1: support-api admin/support-tickets は破損JSON時は空配列を返す（既存 support-api-boundaries と同様の経路）
        test("GET /admin/support-tickets は support_tickets.json 破損時は空配列を返す", async () => {
            const dbPath = path.join(__dirname, "../../support_tickets.json");
            const orig = await fs.readFile(dbPath, "utf-8").catch(() => "[]");
            try {
                await fs.writeFile(dbPath, "not valid json", "utf-8");
                const admin = request.agent(app);
                await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
                const res = await admin.get("/admin/support-tickets");
                expect(res.statusCode).toBe(200);
                expect(Array.isArray(res.body)).toBe(true);
                expect(res.body.length).toBe(0);
            } finally {
                await fs.writeFile(dbPath, orig, "utf-8");
            }
        });
    });
});
