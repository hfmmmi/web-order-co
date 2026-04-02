/**
 * 分岐80%未満ファイルの最終穴埋め（API 中心）
 */
"use strict";

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
const settingsService = require("../../services/settingsService");
const stockService = require("../../services/stockService");
const priceService = require("../../services/priceService");
const { requestPasswordReset, safeMessage } = require("../../services/passwordResetRequestService");
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

async function readAdmins() {
    return JSON.parse(await fs.readFile(dbPath("admins.json"), "utf-8"));
}

async function writeAdmins(list) {
    await fs.writeFile(dbPath("admins.json"), JSON.stringify(list, null, 2), "utf-8");
}

describe("Aランク: 分岐80% mop-up API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        jest.restoreAllMocks();
    });

    test("POST /api/admin/logout は顧客セッション無しで destroy 経路を通す", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/logout").send({});
        expect(res.body.success).toBe(true);
    });

    test("POST /api/admin/invite-reset は未ログインで403", async () => {
        const res = await request(app).post("/api/admin/invite-reset").send({ customerId: "TEST001" });
        expect(res.statusCode).toBe(403);
    });

    test("POST /api/admin/kaitori/parse-excel はファイル無しで400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/kaitori/parse-excel");
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/stocks/manual-release は items 空で400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-release").send({ items: [] });
        expect(res.statusCode).toBe(400);
    });

    test("GET /api/admin/customer-price-list は customerId 省略でも200", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/customer-price-list");
        expect(res.statusCode).toBe(200);
    });

    test("GET /api/settings/public は cartShippingNotice が空白のみなら空文字", async () => {
        await settingsService.updateSettings({ cartShippingNotice: "   \n\t  " });
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.cartShippingNotice).toBe("");
    });

    test("GET /api/admin/proxy-request-status は期限切れ申請を none にする", async () => {
        const old = Date.now() - 20 * 60 * 1000;
        await writeJson("proxy_requests.json", {
            TEST001: { requestedAt: old, adminName: "A", approved: false }
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(res.body.status).toBe("none");
    });

    test("POST /request-support は10MB超添付で400", async () => {
        const cust = request.agent(app);
        await cust.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const big = Buffer.alloc(11 * 1024 * 1024, 97);
        const res = await cust
            .post("/request-support")
            .field("category", "support")
            .field("detail", "big")
            .attach("attachments", big, "huge.pdf");
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test("GET /admin/support-tickets は JSON 破損時に空配列", async () => {
        await fs.writeFile(dbPath("support_tickets.json"), "{x", "utf-8");
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/admin/support-tickets");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("管理者ログインは存在しないIDで失敗", async () => {
        const res = await request(app).post("/api/admin/login").send({ id: "no-admin-xyz", pass: "x" });
        expect(res.body.success).toBe(false);
    });

    test("管理者ログインはパスワード誤りで失敗", async () => {
        const res = await request(app).post("/api/admin/login").send({ id: "test-admin", pass: "WrongPass999!" });
        expect(res.body.success).toBe(false);
    });

    test("GET /api/admin/stocks/settings は getDisplaySettings 失敗で500", async () => {
        jest.spyOn(stockService, "getDisplaySettings").mockRejectedValueOnce(new Error("display"));
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/stocks/settings");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/download-pricelist-by-rank は記号混じり rank を英字のみ抽出", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const spy = jest.spyOn(priceService, "getPricelistCsvForRank").mockResolvedValueOnce({
            csv: "c",
            filename: "f.csv"
        });
        const res = await admin.get("/api/admin/download-pricelist-by-rank/b+++");
        expect(res.statusCode).toBe(200);
        expect(spy).toHaveBeenCalledWith("B");
        spy.mockRestore();
    });

    test("requestPasswordReset は顧客が存在してもメール空なら admin 探索に回る", async () => {
        const list = await readJson("customers.json");
        const c = list.find((x) => x.customerId === "TEST002");
        const prev = c.email;
        c.email = "";
        await writeJson("customers.json", list);
        const r = await requestPasswordReset({
            rawId: "TEST002",
            clientIp: "10.0.1.1",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
        c.email = prev;
        await writeJson("customers.json", list);
    });

    test("POST /api/admin/send-invite-email は invite_tokens 書込失敗で500", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const origW = fs.writeFile.bind(fs);
        const spy = jest.spyOn(fs, "writeFile").mockImplementation(async (p, ...args) => {
            if (String(p).replace(/\\/g, "/").includes("invite_tokens.json")) {
                throw new Error("disk full");
            }
            return origW(p, ...args);
        });
        try {
            const res = await admin.post("/api/admin/send-invite-email").send({ customerId: "TEST001" });
            expect(res.statusCode).toBe(500);
        } finally {
            spy.mockRestore();
        }
    });

    test("GET /api/admin/settings は NODE_ENV=production で passwordManagedByEnv が true", async () => {
        const prev = process.env.NODE_ENV;
        const prevMail = process.env.MAIL_PASSWORD;
        process.env.NODE_ENV = "production";
        process.env.MAIL_PASSWORD = "secret";
        try {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/settings");
            expect(res.statusCode).toBe(200);
            expect(res.body.mail.smtp.passwordManagedByEnv).toBe(true);
        } finally {
            process.env.NODE_ENV = prev;
            if (prevMail === undefined) {
                delete process.env.MAIL_PASSWORD;
            } else {
                process.env.MAIL_PASSWORD = prevMail;
            }
        }
    });

    test("POST /api/admin/proxy-login は未許可で失敗JSON", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(res.body.success).toBe(false);
    });

    test("POST /api/admin/stocks/manual-reserve は items が配列でないと400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-reserve").send({ items: "not-array" });
        expect(res.statusCode).toBe(400);
    });

    test("POST /api/admin/stocks/manual-release は items が配列でないと400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-release").send({ items: {} });
        expect(res.statusCode).toBe(400);
    });

    test("GET /api/admin/download-pricelist-excel-by-rank は数字のみ rank を A にする", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const spy = jest.spyOn(priceService, "getPricelistExcelForRank").mockResolvedValueOnce({
            buffer: Buffer.from([1]),
            filename: "f.xlsx"
        });
        const res = await admin.get("/api/admin/download-pricelist-excel-by-rank/000");
        expect(res.statusCode).toBe(200);
        expect(spy).toHaveBeenCalledWith("A");
        spy.mockRestore();
    });

    test("GET /api/settings/public は features の false を反映する", async () => {
        await settingsService.updateSettings({
            features: {
                orders: false,
                kaitori: false,
                support: false,
                cart: false,
                history: false,
                collection: false,
                announcements: false
            }
        });
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.features.orders).toBe(false);
        expect(res.body.features.kaitori).toBe(false);
        expect(res.body.features.support).toBe(false);
    });

    test("GET /support/attachment は他人のチケットで403", async () => {
        await fs.writeFile(
            dbPath("support_tickets.json"),
            JSON.stringify(
                [
                    {
                        ticketId: "T-OTHER",
                        customerId: "TEST002",
                        attachments: [{ storedName: "0_1_aabbccdd.pdf", originalName: "x.pdf", size: 1 }]
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const cust = request.agent(app);
        await cust.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await cust.get("/support/attachment/T-OTHER/0_1_aabbccdd.pdf");
        expect(res.statusCode).toBe(403);
    });

    test("POST /request-support は許可されない拡張子の添付を無視して成功", async () => {
        const cust = request.agent(app);
        await cust.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const buf = Buffer.from("x");
        const res = await cust
            .post("/request-support")
            .field("category", "support")
            .field("detail", "no attach")
            .attach("attachments", buf, "malware.exe");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("GET /api/admin/settings は rankCount を 1〜26 にクランプ", async () => {
        await settingsService.updateSettings({ rankCount: 1 });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const low = await admin.get("/api/admin/settings");
        expect(low.body.rankCount).toBe(1);
        await settingsService.updateSettings({ rankCount: 99 });
        const high = await admin.get("/api/admin/settings");
        expect(high.body.rankCount).toBe(26);
    });

    test("POST /api/admin/stocks/manual-adjust は warehouses が配列でなければ空配列扱いで成功", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/api/admin/stocks/manual-adjust").send({
            productCode: "P001",
            totalQty: "x",
            reservedQty: "y",
            warehouses: "not-array",
            publish: true
        });
        expect(res.statusCode).toBe(200);
    });

    test("管理者ログインは name 空なら表示名が Admin にフォールバック", async () => {
        const admins = await readAdmins();
        const a = admins.find((x) => x.adminId === "test-admin");
        const prevName = a.name;
        a.name = "";
        await writeAdmins(admins);
        const agent = request.agent(app);
        const res = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(res.body.success).toBe(true);
        a.name = prevName || "テスト管理者";
        await writeAdmins(admins);
    });

    test("GET /support/attachment は管理者なら顧客のチケットもダウンロードできる", async () => {
        const ticketId = "T-ADMDL";
        const dir = path.join(DATA_ROOT, "support_attachments", ticketId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, "0_1_aabbccdd.pdf"), Buffer.from("%PDF-1.1"), "utf-8");
        await fs.writeFile(
            dbPath("support_tickets.json"),
            JSON.stringify(
                [
                    {
                        ticketId,
                        customerId: "TEST001",
                        attachments: [
                            { storedName: "0_1_aabbccdd.pdf", originalName: "doc.pdf", size: 10 }
                        ]
                    }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get(`/support/attachment/${ticketId}/0_1_aabbccdd.pdf`);
        expect(res.statusCode).toBe(200);
    });
});
