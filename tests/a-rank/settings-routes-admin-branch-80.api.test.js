/**
 * routes/admin/settingsRoutes.js 管理系・公開系の残分岐（分岐80%向け）
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true }),
    clearTransporterCache: jest.fn()
}));

const request = require("supertest");
const { app } = require("../../server");
const settingsService = require("../../services/settingsService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const ADMINS = dbPath("admins.json");

describe("Aランク: settingsRoutes 管理API 分岐80%向け", () => {
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

    test("GET /api/settings/public は getFeatures 失敗で500", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            recaptcha: {},
            cartShippingNotice: ""
        });
        jest.spyOn(settingsService, "getFeatures").mockRejectedValueOnce(new Error("feat"));
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/settings は getSettings 失敗で500", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("s"));
        const res = await admin.get("/api/admin/settings");
        expect(res.statusCode).toBe(500);
    });

    test("PUT /api/admin/settings は mailService に clearTransporterCache が無くても保存できる", async () => {
        const mailService = require("../../services/mailService");
        const prev = mailService.clearTransporterCache;
        delete mailService.clearTransporterCache;
        try {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.put("/api/admin/settings").send({ features: { orders: true } });
            expect(res.statusCode).toBe(200);
        } finally {
            mailService.clearTransporterCache = prev;
        }
    });

    test("GET /api/admin/settings は rankCount null なら既定10", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            mail: { smtp: {}, from: "" },
            recaptcha: {},
            blockedManufacturers: [],
            blockedProductCodes: [],
            announcements: [],
            rankCount: null,
            rankNames: {},
            shippingRules: {},
            cartShippingNotice: "",
            dataFormats: {},
            productSchema: null
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({});
        const res = await admin.get("/api/admin/settings");
        expect(res.statusCode).toBe(200);
        expect(res.body.rankCount).toBe(10);
    });

    test("GET /api/admin/settings は smtp.auth.user を user にフォールバック", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            mail: {
                smtp: { service: "x", auth: { user: "fromauth" }, password: "" },
                from: ""
            },
            recaptcha: {},
            blockedManufacturers: [],
            blockedProductCodes: [],
            announcements: [],
            rankCount: 10,
            rankNames: {},
            shippingRules: {},
            cartShippingNotice: "",
            dataFormats: {},
            productSchema: null
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({});
        const res = await admin.get("/api/admin/settings");
        expect(res.statusCode).toBe(200);
        expect(res.body.mail.smtp.user).toBe("fromauth");
    });

    test("GET /api/admin/settings は recaptcha.secretKey ありなら secretKeySet", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            mail: { smtp: {}, from: "" },
            recaptcha: { siteKey: "s", secretKey: "sec" },
            blockedManufacturers: [],
            blockedProductCodes: [],
            announcements: [],
            rankCount: 10,
            rankNames: {},
            shippingRules: {},
            cartShippingNotice: "",
            dataFormats: {},
            productSchema: null
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({});
        const res = await admin.get("/api/admin/settings");
        expect(res.statusCode).toBe(200);
        expect(res.body.recaptcha.secretKeySet).toBe(true);
    });

    test("PUT /api/admin/settings は updateSettings 失敗で500", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        jest.spyOn(settingsService, "updateSettings").mockRejectedValueOnce(new Error("write fail"));
        const res = await admin.put("/api/admin/settings").send({ features: { orders: true } });
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/account は admins 読込がENOENT以外で500", async () => {
        const orig = fs.readFile.bind(fs);
        let adminsRead = 0;
        jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("admins.json")) {
                adminsRead += 1;
                if (adminsRead >= 2) {
                    const e = new Error("io");
                    e.code = "EIO";
                    throw e;
                }
            }
            return orig(p, enc);
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/api/admin/account");
        expect(res.statusCode).toBe(500);
    });

    test("GET /api/admin/account は空配列なら空の管理者情報", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await fs.writeFile(ADMINS, JSON.stringify([], null, 2), "utf-8");
        const res = await admin.get("/api/admin/account");
        expect(res.statusCode).toBe(200);
        expect(res.body.adminId).toBe("");
        expect(res.body.passwordSet).toBe(false);
    });

    test("PUT /api/admin/account は初回でパスワード4文字未満なら400", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await fs.writeFile(ADMINS, JSON.stringify([], null, 2), "utf-8");
        const res = await admin.put("/api/admin/account").send({
            adminId: "new-adm",
            name: "N",
            password: "abc",
            email: ""
        });
        expect(res.statusCode).toBe(400);
    });

    test("GET /api/settings/public は getAnnouncements が配列以外なら空配列に正規化", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            recaptcha: {},
            cartShippingNotice: ""
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({
            orders: true,
            kaitori: true,
            support: true,
            cart: true,
            history: true,
            collection: true,
            announcements: true
        });
        jest.spyOn(settingsService, "getAnnouncements")
            .mockResolvedValueOnce({ not: "array" })
            .mockResolvedValueOnce([]);
        jest.spyOn(settingsService, "getPublicBranding").mockResolvedValueOnce({});
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.orderBanners).toEqual([]);
        expect(Array.isArray(res.body.announcements)).toBe(true);
    });

    test("GET /api/settings/public は recaptcha 未定義でも空オブジェクト扱い", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            cartShippingNotice: ""
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({
            orders: true,
            kaitori: true,
            support: true,
            cart: true,
            history: true,
            collection: true,
            announcements: true
        });
        jest.spyOn(settingsService, "getAnnouncements").mockResolvedValue([]);
        jest.spyOn(settingsService, "getPublicBranding").mockResolvedValueOnce({});
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.recaptchaSiteKey).toBe("");
    });

    test("GET /api/settings/public は cartShippingNotice が null なら空文字", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            recaptcha: {},
            cartShippingNotice: null
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({
            orders: true,
            kaitori: true,
            support: true,
            cart: true,
            history: true,
            collection: true,
            announcements: true
        });
        jest.spyOn(settingsService, "getAnnouncements").mockResolvedValue([]);
        jest.spyOn(settingsService, "getPublicBranding").mockResolvedValueOnce({});
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.cartShippingNotice).toBe("");
    });

    test("GET /api/settings/public は features の明示的 false を反映する", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            recaptcha: {},
            cartShippingNotice: null
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({
            orders: false,
            kaitori: false,
            support: false,
            cart: false,
            history: false,
            collection: false,
            announcements: false
        });
        jest.spyOn(settingsService, "getAnnouncements").mockResolvedValue([]);
        jest.spyOn(settingsService, "getPublicBranding").mockResolvedValueOnce({});
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.features.orders).toBe(false);
        expect(res.body.features.cart).toBe(false);
    });

    test("GET /api/admin/settings は production と MAIL_PASSWORD で passwordSet になる", async () => {
        const prevEnv = process.env.NODE_ENV;
        const prevMail = process.env.MAIL_PASSWORD;
        process.env.NODE_ENV = "production";
        process.env.MAIL_PASSWORD = "x";
        try {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/settings");
            expect(res.statusCode).toBe(200);
            expect(res.body.mail.smtp.passwordManagedByEnv).toBe(true);
            expect(res.body.mail.smtp.passwordSet).toBe(true);
        } finally {
            process.env.NODE_ENV = prevEnv;
            process.env.MAIL_PASSWORD = prevMail;
        }
    });

    test("GET /api/admin/settings は production で MAIL_PASSWORD 未設定なら passwordSet false", async () => {
        const prevEnv = process.env.NODE_ENV;
        const prevMail = process.env.MAIL_PASSWORD;
        process.env.NODE_ENV = "production";
        delete process.env.MAIL_PASSWORD;
        try {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get("/api/admin/settings");
            expect(res.statusCode).toBe(200);
            expect(res.body.mail.smtp.passwordManagedByEnv).toBe(true);
            expect(res.body.mail.smtp.passwordSet).toBe(false);
        } finally {
            process.env.NODE_ENV = prevEnv;
            if (prevMail !== undefined) process.env.MAIL_PASSWORD = prevMail;
        }
    });

    test("GET /api/admin/settings は開発時 smtp.password があれば passwordSet", async () => {
        const prevEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";
        try {
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
                mail: {
                    smtp: { service: "gmail", user: "u", password: "p" },
                    from: "a@b.com"
                },
                recaptcha: {},
                blockedManufacturers: [],
                blockedProductCodes: [],
                announcements: [],
                rankCount: 10,
                rankNames: {},
                shippingRules: {},
                cartShippingNotice: "",
                dataFormats: {},
                productSchema: null
            });
            jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({});
            const res = await admin.get("/api/admin/settings");
            expect(res.statusCode).toBe(200);
            expect(res.body.mail.smtp.passwordSet).toBe(true);
            expect(res.body.mail.smtp.passwordManagedByEnv).toBe(false);
        } finally {
            process.env.NODE_ENV = prevEnv;
        }
    });

    test("PUT /api/admin/account は admins がオブジェクトのみなら空配列から補正して保存", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await fs.writeFile(ADMINS, "{}", "utf-8");
        const res = await admin.put("/api/admin/account").send({
            adminId: "test-admin",
            name: "テスト管理者",
            password: "AdminPass123!",
            email: "keep@test.com"
        });
        expect(res.statusCode).toBe(200);
        const list = JSON.parse(await fs.readFile(ADMINS, "utf-8"));
        expect(Array.isArray(list)).toBe(true);
        expect(list[0].adminId).toBe("test-admin");
    });

    test("PUT /api/admin/account は email 空文字で undefined に正規化して保存", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.put("/api/admin/account").send({
            adminId: "test-admin",
            name: "テスト管理者",
            password: "",
            email: ""
        });
        expect(res.statusCode).toBe(200);
        const raw = await fs.readFile(ADMINS, "utf-8");
        const list = JSON.parse(raw);
        expect(list[0].email).toBeUndefined();
    });

    test("PUT /api/admin/account は admins 読込が ENOENT 以外で再スローされ500", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const orig = fs.readFile.bind(fs);
        let adminsReads = 0;
        const spy = jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("admins.json")) {
                adminsReads += 1;
                if (adminsReads === 1) {
                    const e = new Error("corrupt");
                    e.code = "EACCES";
                    throw e;
                }
            }
            return orig(p, enc);
        });
        try {
            const res = await admin.put("/api/admin/account").send({
                adminId: "test-admin",
                name: "テスト管理者",
                password: "",
                email: "x@y.com"
            });
            expect(res.statusCode).toBe(500);
        } finally {
            spy.mockRestore();
        }
    });

    test("GET /api/settings/public は getPublicBranding 失敗で500", async () => {
        jest.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
            recaptcha: {},
            cartShippingNotice: ""
        });
        jest.spyOn(settingsService, "getFeatures").mockResolvedValueOnce({
            orders: true,
            kaitori: true,
            support: true,
            cart: true,
            history: true,
            collection: true,
            announcements: true
        });
        jest.spyOn(settingsService, "getAnnouncements").mockResolvedValue([]);
        jest.spyOn(settingsService, "getPublicBranding").mockRejectedValueOnce(new Error("brand"));
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(500);
    });

    test("PUT /api/admin/account は admins.json への writeFile 失敗で500", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const origW = fs.writeFile.bind(fs);
        const spy = jest.spyOn(fs, "writeFile").mockImplementation(async (p, ...args) => {
            if (String(p).replace(/\\/g, "/").includes("admins.json")) {
                throw new Error("disk");
            }
            return origW(p, ...args);
        });
        try {
            const res = await admin.put("/api/admin/account").send({
                adminId: "test-admin",
                name: "テスト管理者",
                password: "",
                email: "a@test.com"
            });
            expect(res.statusCode).toBe(500);
        } finally {
            spy.mockRestore();
        }
    });
});
