"use strict";

const fs = require("fs").promises;
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const SETTINGS = dbPath("settings.json");

describe("branch coverage 100 P1: settingsService", () => {
    let orig;

    beforeAll(async () => {
        orig = await fs.readFile(SETTINGS, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(SETTINGS, orig, "utf-8");
        settingsService.invalidateSettingsCache();
    });

    async function merge(partial) {
        const base = JSON.parse(orig);
        await fs.writeFile(SETTINGS, JSON.stringify({ ...base, ...partial }, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
    }

    test("getRankIds は rankCount で切り詰め", async () => {
        await merge({ rankCount: 2 });
        const ids = await settingsService.getRankIds();
        expect(ids.length).toBe(2);
    });

    test("getRankList は rankNames で表示名上書き", async () => {
        await merge({ rankCount: 2, rankNames: { A: "特別", B: "通常" } });
        const list = await settingsService.getRankList();
        expect(list[0].name).toBe("特別");
    });

    test("getMailConfig は service 指定で transporter に service", async () => {
        const base = JSON.parse(orig);
        base.mail = base.mail || {};
        base.mail.smtp = { service: "Gmail", user: "u", password: "p" };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const mc = await settingsService.getMailConfig();
        expect(mc.transporter.service).toBeTruthy();
    });

    test("applyTemplate は未定義プレースホルダを空", async () => {
        expect(settingsService.applyTemplate("a{{x}}b", { x: "" })).toBe("ab");
    });

    test("getLogisticsFixedColumnImportConfig はデフォルトとマージ", async () => {
        const c = await settingsService.getLogisticsFixedColumnImportConfig();
        expect(typeof c.orderId).toBe("number");
    });

    test("getProductSchema は null のとき null", async () => {
        const base = JSON.parse(orig);
        delete base.productSchema;
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        await expect(settingsService.getProductSchema()).resolves.toBeNull();
    });

    test("getAnnouncements は category 未指定で全カテゴリ候補", async () => {
        await merge({
            announcements: [
                {
                    id: "an1",
                    enabled: true,
                    target: "customer",
                    category: "general",
                    title: "t",
                    body: "b",
                    startDate: "2000-01-01T00:00:00.000Z"
                }
            ]
        });
        const list = await settingsService.getAnnouncements("customer");
        expect(list.length).toBeGreaterThanOrEqual(1);
    });

    test("getPriceListFormatConfig は excel headerRow 空で既定", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListExcel = { headerRow: [] };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(Array.isArray(fmt.excelHeaderRow)).toBe(true);
        expect(fmt.excelHeaderRow.length).toBeGreaterThan(0);
    });
});
