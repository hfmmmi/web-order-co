"use strict";

const fs = require("fs").promises;
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const SETTINGS = dbPath("settings.json");

describe("settingsService 追加分岐（フォーマット・物流・スキーマ）", () => {
    let orig;

    beforeAll(async () => {
        orig = await fs.readFile(SETTINGS, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(SETTINGS, orig, "utf-8");
        settingsService.invalidateSettingsCache();
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
});
