"use strict";

const settingsService = require("../../services/settingsService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("settingsService キャッシュ・getMailConfig 分岐", () => {
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

    test("getSettings は短時間内の再呼び出しで同一キャッシュ参照", async () => {
        settingsService.invalidateSettingsCache();
        const a = await settingsService.getSettings();
        const b = await settingsService.getSettings();
        expect(a).toBe(b);
    });

    test("getMailConfig は smtp.host 指定時に host ベースの transporter", async () => {
        await writeJson("settings.json", {
            blockedManufacturers: [],
            blockedProductCodes: [],
            mail: {
                smtp: {
                    host: "smtp.unit.test",
                    port: 465,
                    secure: true,
                    user: "u@example.com",
                    password: "secret"
                },
                from: "from@test",
                orderNotifyTo: "o@test",
                supportNotifyTo: "s@test",
                templates: {}
            },
            features: {},
            announcements: [],
            recaptcha: { siteKey: "", secretKey: "" }
        });
        settingsService.invalidateSettingsCache();
        const cfg = await settingsService.getMailConfig();
        expect(cfg.transporter.host).toBe("smtp.unit.test");
        expect(cfg.transporter.port).toBe(465);
        expect(cfg.transporter.secure).toBe(true);
    });

    test("getMailConfig は開発環境で filePass 優先", async () => {
        const prev = process.env.NODE_ENV;
        const prevM = process.env.MAIL_PASSWORD;
        process.env.NODE_ENV = "development";
        delete process.env.MAIL_PASSWORD;
        await writeJson("settings.json", {
            blockedManufacturers: [],
            blockedProductCodes: [],
            mail: {
                smtp: {
                    service: "gmail",
                    user: "dev@test",
                    password: "file-secret"
                },
                from: "from@test",
                orderNotifyTo: "o@test",
                supportNotifyTo: "s@test",
                templates: {}
            },
            features: {},
            announcements: [],
            recaptcha: { siteKey: "", secretKey: "" }
        });
        settingsService.invalidateSettingsCache();
        try {
            const cfg = await settingsService.getMailConfig();
            expect(cfg.transporter.auth.pass).toBe("file-secret");
        } finally {
            process.env.NODE_ENV = prev;
            if (prevM === undefined) delete process.env.MAIL_PASSWORD;
            else process.env.MAIL_PASSWORD = prevM;
        }
    });

    test("getRankList は rankNames でカスタム表示名", async () => {
        await writeJson("settings.json", {
            rankCount: 2,
            rankNames: { A: "ゴールド会員", B: "シルバー" },
            blockedManufacturers: [],
            blockedProductCodes: [],
            mail: {
                smtp: { host: "", port: 587, secure: false, user: "", password: "" },
                from: "",
                orderNotifyTo: "",
                supportNotifyTo: "",
                templates: {}
            },
            features: {},
            announcements: [],
            recaptcha: { siteKey: "", secretKey: "" }
        });
        settingsService.invalidateSettingsCache();
        const list = await settingsService.getRankList();
        expect(list.find((x) => x.id === "A").name).toBe("ゴールド会員");
        expect(list.find((x) => x.id === "B").name).toBe("シルバー");
    });

    test("applyTemplate は falsy テンプレートで空文字", () => {
        expect(settingsService.applyTemplate(null, { a: "x" })).toBe("");
        expect(settingsService.applyTemplate("", { a: "x" })).toBe("");
    });

    test("applyTemplate はプレースホルダをすべて置換", () => {
        const s = settingsService.applyTemplate("{{a}}-{{b}}", { a: "1", b: "2" });
        expect(s).toBe("1-2");
    });

    test("getMailConfig は smtp.auth.user を smtp.user より優先", async () => {
        await writeJson("settings.json", {
            blockedManufacturers: [],
            blockedProductCodes: [],
            mail: {
                smtp: {
                    host: "h.test",
                    port: 587,
                    secure: false,
                    user: "legacy@t",
                    password: "secret-file",
                    auth: { user: "authuser@t", pass: "ignored" }
                },
                from: "f@test",
                orderNotifyTo: "o@test",
                supportNotifyTo: "s@test",
                templates: {}
            },
            features: {},
            announcements: [],
            recaptcha: { siteKey: "", secretKey: "" }
        });
        settingsService.invalidateSettingsCache();
        const cfg = await settingsService.getMailConfig();
        expect(cfg.transporter.auth.user).toBe("authuser@t");
        expect(cfg.transporter.auth.pass).toBe("secret-file");
    });

    test("getAnnouncements は category=order で絞り込み", async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 86400000).toISOString();
        await writeJson("settings.json", {
            announcements: [
                {
                    enabled: true,
                    target: "customer",
                    category: "order",
                    title: "注文バナー",
                    body: "b",
                    startDate: past
                },
                {
                    enabled: true,
                    target: "customer",
                    category: "general",
                    title: "一般",
                    body: "g",
                    startDate: past
                }
            ],
            blockedManufacturers: [],
            blockedProductCodes: [],
            mail: {
                smtp: { host: "", port: 587, secure: false, user: "", password: "" },
                from: "",
                orderNotifyTo: "",
                supportNotifyTo: "",
                templates: {}
            },
            features: {},
            recaptcha: { siteKey: "", secretKey: "" }
        });
        settingsService.invalidateSettingsCache();
        const onlyOrder = await settingsService.getAnnouncements("customer", "order");
        expect(onlyOrder.length).toBe(1);
        expect(onlyOrder[0].title).toBe("注文バナー");
    });
});
