"use strict";

/**
 * 分岐50本計画: settingsService 5 本
 */
const fs = require("fs").promises;
const settingsService = require("../../services/settingsService");
const { dbPath } = require("../../dbPaths");

const SETTINGS = dbPath("settings.json");

describe("branch coverage plan 50: settingsService", () => {
    let orig;

    beforeAll(async () => {
        orig = await fs.readFile(SETTINGS, "utf-8");
    });

    afterAll(async () => {
        await fs.writeFile(SETTINGS, orig, "utf-8");
        settingsService.invalidateSettingsCache();
    });

    async function writeSettings(partial) {
        const base = JSON.parse(orig);
        await fs.writeFile(SETTINGS, JSON.stringify({ ...base, ...partial }, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
    }

    test("getOrderCsvExportSpec は列数不一致でデフォルト仕様にフォールバック", async () => {
        await writeSettings({
            dataFormats: {
                orderCsvExport: {
                    headerLine: "c1,c2,c3,c4",
                    columnKeys: ["only"]
                }
            }
        });
        const spec = await settingsService.getOrderCsvExportSpec();
        expect(spec.headerLine).toContain("伝票まとめ番号");
        expect(spec.columnKeys.length).toBeGreaterThan(10);
    });

    test("getAnnouncements は target=admin で管理者向けのみ", async () => {
        await writeSettings({
            announcements: [
                {
                    id: "adm1",
                    enabled: true,
                    target: "admin",
                    category: "general",
                    title: "管理",
                    body: "b",
                    startDate: "2000-01-01T00:00:00.000Z"
                },
                {
                    id: "cu1",
                    enabled: true,
                    target: "customer",
                    category: "general",
                    title: "顧客",
                    body: "b",
                    startDate: "2000-01-01T00:00:00.000Z"
                }
            ]
        });
        const list = await settingsService.getAnnouncements("admin", "general");
        expect(list.every((a) => a.target === "admin" || a.target === "all")).toBe(true);
        expect(list.some((a) => a.id === "adm1")).toBe(true);
    });

    test("getFeatures は部分設定をデフォルトと deepMerge", async () => {
        await writeSettings({
            features: {
                orders: false,
                kaitori: true
            }
        });
        const f = await settingsService.getFeatures();
        expect(f.orders).toBe(false);
        expect(typeof f.cart).toBe("boolean");
    });

    test("getPriceListFormatConfig は sheetManufacturerSortCategory を設定反映", async () => {
        const base = JSON.parse(orig);
        base.dataFormats = base.dataFormats || {};
        base.dataFormats.priceListCategories = {
            ...(base.dataFormats.priceListCategories || {}),
            sortOrder: ["純正", "再生"],
            manufacturerSplitCategory: "純正",
            sheetManufacturerSortCategory: "海外純正",
            sheetNamesByCategory: { 純正: "純正" }
        };
        await fs.writeFile(SETTINGS, JSON.stringify(base, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const fmt = await settingsService.getPriceListFormatConfig();
        expect(fmt.sheetManufacturerSortCategory).toBe("海外純正");
    });

    test("getPublicBranding は siteName をマージ", async () => {
        await writeSettings({
            dataFormats: {
                publicBranding: {
                    siteName: "テストサイト名50",
                    contactEmail: "x@y.z"
                }
            }
        });
        const b = await settingsService.getPublicBranding();
        expect(b.siteName).toContain("テストサイト名50");
    });
});
