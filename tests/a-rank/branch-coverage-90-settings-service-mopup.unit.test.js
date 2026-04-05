"use strict";

/**
 * settingsService: getMailConfig 本番/ホスト系、getAnnouncements 既定引数、updateSettings 本番、価格表フォーマット端、getLogisticsCsvImportConfig
 */
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { seedBaseData } = require("../helpers/testSandbox");

const SETTINGS = dbPath("settings.json");

describe("branch coverage 90: settingsService 残分岐", () => {
    let origJson;

    beforeAll(async () => {
        await seedBaseData();
        origJson = await fs.readFile(SETTINGS, "utf-8");
    });

    afterEach(async () => {
        await fs.writeFile(SETTINGS, origJson, "utf-8");
        const ss = require("../../services/settingsService");
        ss.invalidateSettingsCache();
    });

    afterAll(async () => {
        await fs.writeFile(SETTINGS, origJson, "utf-8");
    });

    test("getSettings は TTL 内ならキャッシュを返す", async () => {
        const ss = require("../../services/settingsService");
        ss.invalidateSettingsCache();
        const a = await ss.getSettings();
        const b = await ss.getSettings();
        expect(b).toBe(a);
    });

    test("getAnnouncements は引数なしで target=all 扱い", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.announcements = [
            {
                id: "all-t",
                enabled: true,
                target: "all",
                category: "general",
                title: "t",
                body: "b",
                startDate: "2000-01-01T00:00:00.000Z"
            }
        ];
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const list = await ss.getAnnouncements();
        expect(list.some((x) => x.id === "all-t")).toBe(true);
    });

    test("getFeatures は settings に features キーが無くてもデフォルトとマージ", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        delete base.features;
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const f = await ss.getFeatures();
        expect(f.orders).toBe(true);
    });

    test("getRankList は rankNames が空白のみならランクラベル既定", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.rankCount = 1;
        base.rankNames = { A: "   " };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const list = await ss.getRankList();
        expect(list[0].id).toBe("A");
        expect(list[0].name).toBe("ランク1");
    });

    test("getMailConfig は smtp.host 指定で host 経路・secure 真", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.mail = {
            smtp: { host: "smtp.example.com", port: 465, secure: true, user: "u@x.com", password: "pw" },
            from: "f@x.com",
            orderNotifyTo: "o@x.com",
            supportNotifyTo: "s@x.com"
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const mc = await ss.getMailConfig();
        expect(mc.transporter.host).toBe("smtp.example.com");
        expect(mc.transporter.secure).toBe(true);
    });

    test("getMailConfig は smtp.auth.user を user に使う", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.mail = {
            smtp: { service: "gmail", auth: { user: "authuser@x.com" }, password: "pw" },
            from: "f@x.com"
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const mc = await ss.getMailConfig();
        expect(mc.transporter.auth.user).toBe("authuser@x.com");
    });

    test("本番 getMailConfig は MAIL_PASSWORD 必須で満たせば返る", async () => {
        const prev = process.env.NODE_ENV;
        const prevMail = process.env.MAIL_PASSWORD;
        process.env.NODE_ENV = "production";
        process.env.MAIL_PASSWORD = "prod-secret";
        jest.resetModules();
        const ss = require("../../services/settingsService");
        ss.invalidateSettingsCache();
        const base = JSON.parse(origJson);
        base.mail = { smtp: { service: "gmail", user: "u@test.com" }, from: "a@b.com" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const mc = await ss.getMailConfig();
        expect(mc.transporter.auth.pass).toBe("prod-secret");
        process.env.NODE_ENV = prev;
        process.env.MAIL_PASSWORD = prevMail;
        jest.resetModules();
        require("../../services/settingsService").invalidateSettingsCache();
    });

    test("本番 updateSettings は merged.mail.smtp.password を削除", async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        jest.resetModules();
        const ss = require("../../services/settingsService");
        ss.invalidateSettingsCache();
        const base = JSON.parse(origJson);
        base.mail = base.mail || {};
        base.mail.smtp = { service: "gmail", user: "u", password: "keep" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        await ss.updateSettings({ mail: { smtp: { password: "newplain" } } });
        const raw = JSON.parse(await fs.readFile(SETTINGS, "utf-8"));
        expect(raw.mail.smtp.password).toBeUndefined();
        process.env.NODE_ENV = prev;
        jest.resetModules();
        require("../../services/settingsService").invalidateSettingsCache();
    });

    test("updateSettings は recaptcha secret 空送信で既存シークレット維持", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.recaptcha = { siteKey: "s", secretKey: "SECRET_KEEP" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        await ss.updateSettings({ recaptcha: { siteKey: "s2", secretKey: "" } });
        const raw = JSON.parse(await fs.readFile(SETTINGS, "utf-8"));
        expect(raw.recaptcha.secretKey).toBe("SECRET_KEEP");
    });

    test("getPriceListFormatConfig は sortOrder 空なら既定並び", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCategories = { sortOrder: [] };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const fmt = await ss.getPriceListFormatConfig();
        expect(Object.keys(fmt.categoryOrder).length).toBeGreaterThan(0);
    });

    test("getPriceListFormatConfig は manufacturerSplitCategory 空なら先頭カテゴリ", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCategories = {
            sortOrder: ["再生", "純正"],
            manufacturerSplitCategory: "  "
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const fmt = await ss.getPriceListFormatConfig();
        expect(fmt.manufacturerSplitCategory).toBe("再生");
    });

    test("getPriceListFormatConfig は productNameStripFromDisplay が空文字なら既定", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCsv = { productNameStripFromDisplay: "" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const fmt = await ss.getPriceListFormatConfig();
        expect(String(fmt.productNameStripFromDisplay).length).toBeGreaterThan(0);
    });

    test("getLogisticsCsvImportConfig は publicIdPattern 空なら既定", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.logisticsCsvImport = { publicIdPattern: "   " };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const c = await ss.getLogisticsCsvImportConfig();
        expect(String(c.publicIdPattern).trim().length).toBeGreaterThan(0);
    });

    test("applyTemplate は非文字テンプレートで空", async () => {
        const ss = require("../../services/settingsService");
        expect(ss.applyTemplate(null, { a: 1 })).toBe("");
    });

    test("getAnnouncements は endDate 過去を除外", async () => {
        const ss = require("../../services/settingsService");
        const base = JSON.parse(origJson);
        base.announcements = [
            {
                id: "old",
                enabled: true,
                target: "customer",
                category: "general",
                title: "old",
                body: "b",
                startDate: "2000-01-01T00:00:00.000Z",
                endDate: "2000-01-02T00:00:00.000Z"
            }
        ];
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        ss.invalidateSettingsCache();
        const list = await ss.getAnnouncements("customer");
        expect(list.every((x) => x.id !== "old")).toBe(true);
    });
});
