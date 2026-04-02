"use strict";

const fs = require("fs").promises;
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");
const { seedBaseData } = require("../helpers/testSandbox");

const SETTINGS = dbPath("settings.json");

describe("settingsService.getAnnouncements", () => {
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

    async function withAnnouncements(announcements) {
        const base = JSON.parse(orig);
        base.announcements = announcements;
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
    }

    test("enabled:false は除外", async () => {
        await withAnnouncements([
            { enabled: false, title: "a", target: "all" },
            { enabled: true, title: "b", target: "all" }
        ]);
        const r = await settingsService.getAnnouncements("all");
        expect(r.map((x) => x.title)).toEqual(["b"]);
    });

    test("category 指定で一致のみ", async () => {
        await withAnnouncements([
            { enabled: true, title: "o", category: "order", target: "all" },
            { enabled: true, title: "g", category: "general", target: "all" }
        ]);
        const r = await settingsService.getAnnouncements("all", "order");
        expect(r.map((x) => x.title)).toEqual(["o"]);
    });

    test("category 未設定は general として扱う", async () => {
        await withAnnouncements([{ enabled: true, title: "x", target: "all" }]);
        const r = await settingsService.getAnnouncements("all", "general");
        expect(r.length).toBe(1);
    });

    test("target が customer のとき all 対象は通す", async () => {
        await withAnnouncements([{ enabled: true, title: "t", target: "all" }]);
        const r = await settingsService.getAnnouncements("customer");
        expect(r.length).toBe(1);
    });

    test("target が customer のとき admin 専用は除外", async () => {
        await withAnnouncements([{ enabled: true, title: "a", target: "admin" }]);
        const r = await settingsService.getAnnouncements("customer");
        expect(r.length).toBe(0);
    });

    test("target が admin のとき customer 専用は除外", async () => {
        await withAnnouncements([{ enabled: true, title: "c", target: "customer" }]);
        const r = await settingsService.getAnnouncements("admin");
        expect(r.length).toBe(0);
    });

    test("startDate が未来なら除外", async () => {
        const far = new Date(Date.now() + 86400000 * 30).toISOString();
        await withAnnouncements([{ enabled: true, title: "f", target: "all", startDate: far }]);
        const r = await settingsService.getAnnouncements("all");
        expect(r.length).toBe(0);
    });

    test("endDate が過去なら除外", async () => {
        const past = new Date(Date.now() - 86400000 * 2).toISOString();
        await withAnnouncements([{ enabled: true, title: "p", target: "all", endDate: past }]);
        const r = await settingsService.getAnnouncements("all");
        expect(r.length).toBe(0);
    });

    test("開始・終了が有効な範囲なら含む", async () => {
        const start = new Date(Date.now() - 86400000).toISOString();
        const end = new Date(Date.now() + 86400000 * 10).toISOString();
        await withAnnouncements([{ enabled: true, title: "ok", target: "all", startDate: start, endDate: end }]);
        const r = await settingsService.getAnnouncements("all");
        expect(r.length).toBe(1);
    });

    test("startDate のみ過去なら含む", async () => {
        const start = new Date(Date.now() - 86400000).toISOString();
        await withAnnouncements([{ enabled: true, title: "s", target: "all", startDate: start }]);
        const r = await settingsService.getAnnouncements("all");
        expect(r.length).toBe(1);
    });

    test("sort は startDate 新しい順（未設定は最後）", async () => {
        await withAnnouncements([
            { enabled: true, title: "old", target: "all", startDate: "2020-01-01T00:00:00.000Z" },
            { enabled: true, title: "non", target: "all" },
            { enabled: true, title: "newer", target: "all", startDate: "2024-06-01T00:00:00.000Z" }
        ]);
        const r = await settingsService.getAnnouncements("all");
        expect(r.map((x) => x.title)).toEqual(["newer", "old", "non"]);
    });
});
