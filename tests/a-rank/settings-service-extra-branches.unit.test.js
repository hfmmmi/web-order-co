"use strict";

const fs = require("fs").promises;
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");
const { seedBaseData } = require("../helpers/testSandbox");

const SETTINGS = dbPath("settings.json");

describe("settingsService 追加分岐（フォーマット・物流・スキーマ）", () => {
    let orig;

    beforeAll(async () => {
        await seedBaseData();
        orig = await fs.readFile(SETTINGS, "utf-8");
    });

    afterAll(async () => {
        if (typeof orig === "string") {
            await fs.writeFile(SETTINGS, orig, "utf-8");
            settingsService.invalidateSettingsCache();
        }
    });

    async function mergeSettings(partial) {
        const base = JSON.parse(orig);
        await fs.writeFile(SETTINGS, JSON.stringify({ ...base, ...partial }, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
    }

    test("getProductSchema は設定に無ければ null", async () => {
        const base = JSON.parse(orig);
        delete base.productSchema;
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        await expect(settingsService.getProductSchema()).resolves.toBeNull();
    });

    test("getProductSchema は設定があればそのオブジェクト", async () => {
        await mergeSettings({ productSchema: { fields: ["a"] } });
        await expect(settingsService.getProductSchema()).resolves.toEqual({ fields: ["a"] });
    });

    test("getLogisticsCsvImportConfig は空配列キーをデフォルトで埋める", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.logisticsCsvImport = {
            memoFields: [],
            orderNumber: [],
            publicIdPattern: ""
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const m = await settingsService.getLogisticsCsvImportConfig();
        expect(Array.isArray(m.memoFields)).toBe(true);
        expect(m.memoFields.length).toBeGreaterThan(0);
        expect(String(m.publicIdPattern).trim().length).toBeGreaterThan(0);
    });

    test("getLogisticsFixedColumnImportConfig は deepMerge される", async () => {
        await mergeSettings({
            dataFormats: {
                logisticsFixedColumnImport: { orderId: 9, productCode: 32 }
            }
        });
        const c = await settingsService.getLogisticsFixedColumnImportConfig();
        expect(c.orderId).toBe(9);
        expect(c.productCode).toBe(32);
    });

    test("getPriceListFormatConfig は csv headerLine が空ならデフォルト", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCsv = { headerLine: "   ", productNameStripFromDisplay: "" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(String(fmt.csvHeaderLine).length).toBeGreaterThan(2);
    });

    test("getPriceListFormatConfig は sortOrder 空ならデフォルト並びを使う", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCategories = { sortOrder: [], manufacturerSplitCategory: "" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(Object.keys(fmt.categoryOrder).length).toBeGreaterThan(0);
        expect(String(fmt.manufacturerSplitCategory).length).toBeGreaterThan(0);
    });

    test("getPriceListFormatConfig は sheetNamesByCategory が非オブジェクトなら既定のみ", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCategories = { sheetNamesByCategory: null };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(typeof fmt.sheetNamesByCategory).toBe("object");
    });

    test("getPriceListFormatConfig は excel headerRow が空配列ならデフォルト行", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListExcel = { headerRow: [] };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(Array.isArray(fmt.excelHeaderRow)).toBe(true);
        expect(fmt.excelHeaderRow.length).toBeGreaterThan(3);
    });

    test("updateSettings は recaptcha.secretKey 空ならマージから削除", async () => {
        const base = JSON.parse(orig);
        base.recaptcha = { secretKey: "keep-me" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        await settingsService.updateSettings({ recaptcha: { secretKey: "" } });
        const s = await settingsService.getSettings();
        expect(s.recaptcha.secretKey).toBe("keep-me");
    });

    test("updateSettings は announcements 配列をそのまま置換", async () => {
        const ann = [{ enabled: true, category: "general", target: "all", title: "置換後" }];
        await settingsService.updateSettings({ announcements: ann });
        const s = await settingsService.getSettings();
        expect(s.announcements).toEqual(ann);
    });

    test("getMailConfig は smtp.host 指定時に host/port を使う", async () => {
        const base = JSON.parse(orig);
        base.mail = base.mail || {};
        base.mail.smtp = {
            host: "127.0.0.1",
            port: 2525,
            secure: false,
            user: "u",
            password: "p"
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const mc = await settingsService.getMailConfig();
        expect(mc.transporter.host).toBe("127.0.0.1");
        expect(mc.transporter.port).toBe(2525);
        expect(mc.transporter.service).toBeUndefined();
    });

    test("getAnnouncements は category 指定で絞り込む", async () => {
        const base = JSON.parse(orig);
        base.announcements = [
            { enabled: true, category: "order", target: "all", title: "注文向け" },
            { enabled: true, category: "general", target: "all", title: "一般" }
        ];
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const onlyOrder = await settingsService.getAnnouncements("all", "order");
        expect(onlyOrder.length).toBe(1);
        expect(onlyOrder[0].title).toBe("注文向け");
    });

    test("getAnnouncements は target が一致するものだけ返す", async () => {
        const base = JSON.parse(orig);
        base.announcements = [
            { enabled: true, category: "general", target: "customer", title: "顧客のみ" },
            { enabled: true, category: "general", target: "admin", title: "管理者のみ" }
        ];
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const cust = await settingsService.getAnnouncements("customer");
        expect(cust.length).toBe(1);
        expect(cust[0].title).toBe("顧客のみ");
    });

    test("getAnnouncements は enabled false を除外する", async () => {
        const base = JSON.parse(orig);
        base.announcements = [
            { enabled: false, category: "general", target: "all", title: "非表示" },
            { enabled: true, category: "general", target: "all", title: "表示" }
        ];
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const ann = await settingsService.getAnnouncements("all");
        expect(ann.every((a) => a.title !== "非表示")).toBe(true);
        expect(ann.some((a) => a.title === "表示")).toBe(true);
    });

    test("getAnnouncements は未来の開始日を除外する", async () => {
        const far = new Date();
        far.setFullYear(far.getFullYear() + 1);
        const base = JSON.parse(orig);
        base.announcements = [
            { enabled: true, category: "general", target: "all", title: "未来", startDate: far.toISOString() },
            { enabled: true, category: "general", target: "all", title: "今" }
        ];
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const ann = await settingsService.getAnnouncements("all");
        expect(ann.some((a) => a.title === "未来")).toBe(false);
        expect(ann.some((a) => a.title === "今")).toBe(true);
    });

    test("updateSettings は cartShippingNotice が非文字列なら空文字に正規化する", async () => {
        await settingsService.updateSettings({ cartShippingNotice: 999 });
        settingsService.invalidateSettingsCache();
        const s = await settingsService.getSettings();
        expect(s.cartShippingNotice).toBe("");
    });

    test("getMailConfig は smtp.host が空白のみなら service プリセット分岐を使う", async () => {
        const base = JSON.parse(orig);
        base.mail = base.mail || {};
        base.mail.smtp = {
            host: "   ",
            service: "hotmail",
            secure: false,
            user: "u",
            password: "pw"
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const mc = await settingsService.getMailConfig();
        expect(mc.transporter.service).toBe("hotmail");
        expect(mc.transporter.host).toBeUndefined();
    });

    test("applyTemplate はテンプレートが falsy なら空文字", () => {
        expect(settingsService.applyTemplate(null, { a: 1 })).toBe("");
        expect(settingsService.applyTemplate(undefined, { a: 1 })).toBe("");
        expect(settingsService.applyTemplate(0, { a: 1 })).toBe("");
    });

    test("getRankIds は rankCount が数値でなければ既定10件相当にフォールバック", async () => {
        const base = JSON.parse(orig);
        base.rankCount = "abc";
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const ids = await settingsService.getRankIds();
        expect(ids.length).toBe(10);
    });

    test("getRankIds は rankCount が上限を超えれば MAX_RANK_COUNT にクランプ", async () => {
        const base = JSON.parse(orig);
        base.rankCount = 999;
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const ids = await settingsService.getRankIds();
        expect(ids.length).toBe(settingsService.MAX_RANK_COUNT);
    });

    test("getPriceListFormatConfig は productNameStripFromDisplay が null のときデフォルト文言", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCsv = { headerLine: "h\n", productNameStripFromDisplay: null };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(fmt.productNameStripFromDisplay).toBeDefined();
    });

    test("updateSettings は recaptcha オブジェクトのみで secret が欠けたとき既存シークレットを復元", async () => {
        const base = JSON.parse(orig);
        base.recaptcha = { siteKey: "sk", secretKey: "SECRET_KEEP" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        await settingsService.updateSettings({ recaptcha: { siteKey: "newsite" } });
        settingsService.invalidateSettingsCache();
        const s = await settingsService.getSettings();
        expect(s.recaptcha.siteKey).toBe("newsite");
        expect(s.recaptcha.secretKey).toBe("SECRET_KEEP");
    });
});
