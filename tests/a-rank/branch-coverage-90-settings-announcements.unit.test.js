"use strict";

/**
 * settingsService: getAnnouncements / getFeatures / deepMerge 周辺分岐
 */
const settingsService = require("../../services/settingsService");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("branch coverage 90: settingsService お知らせ・機能フラグ", () => {
    let backup;
    let origSettings;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        origSettings = await readJson("settings.json");
    });

    afterEach(async () => {
        await writeJson("settings.json", origSettings);
        settingsService.invalidateSettingsCache();
    });

    test("getAnnouncements は category=order で注文系のみ", async () => {
        await writeJson("settings.json", {
            ...origSettings,
            announcements: [
                {
                    id: "a1",
                    enabled: true,
                    target: "customer",
                    category: "order",
                    title: "o",
                    body: "b",
                    startDate: "2000-01-01T00:00:00.000Z"
                },
                {
                    id: "a2",
                    enabled: true,
                    target: "customer",
                    category: "general",
                    title: "g",
                    body: "b",
                    startDate: "2000-01-01T00:00:00.000Z"
                }
            ]
        });
        settingsService.invalidateSettingsCache();
        const list = await settingsService.getAnnouncements("customer", "order");
        expect(list.every((a) => (a.category || "general") === "order")).toBe(true);
    });

    test("getAnnouncements は無効・未来開始・過去終了を除外", async () => {
        const past = "2000-01-01T00:00:00.000Z";
        const future = "2099-01-01T00:00:00.000Z";
        await writeJson("settings.json", {
            ...origSettings,
            announcements: [
                { id: "off", enabled: false, target: "all", title: "x", body: "b", startDate: past },
                { id: "nf", enabled: true, target: "all", title: "x", body: "b", startDate: future },
                { id: "ed", enabled: true, target: "all", title: "x", body: "b", startDate: past, endDate: past }
            ]
        });
        settingsService.invalidateSettingsCache();
        const list = await settingsService.getAnnouncements("all");
        expect(list.find((a) => a.id === "off")).toBeUndefined();
        expect(list.find((a) => a.id === "nf")).toBeUndefined();
        expect(list.find((a) => a.id === "ed")).toBeUndefined();
    });

    test("getFeatures はデフォルトとマージされる", async () => {
        const f = await settingsService.getFeatures();
        expect(typeof f.orders).toBe("boolean");
    });
});
