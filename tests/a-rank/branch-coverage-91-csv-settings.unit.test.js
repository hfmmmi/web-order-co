"use strict";

/**
 * csvService.parseExternalOrdersCsv / settingsService 物流・ブランディング・cartShippingNotice
 */
const csvService = require("../../services/csvService");
const settingsService = require("../../services/settingsService");
const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");

const SETTINGS_PATH = dbPath("settings.json");

describe("branch coverage 91: csvService.parseExternalOrdersCsv", () => {
    test("明細がすべて数量0の受注は最終配列から除外される", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "EXT1,C1,名前,P1,品,100,0,2025-01-01\n";
        const buf = Buffer.from(csv, "utf-8");
        const out = csvService.parseExternalOrdersCsv(buf);
        expect(out).toEqual([]);
    });

    test("UTF-8 BOM 付きバッファを解釈できる", () => {
        const body =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "BOM1,C1,名前,P9,品,50,1,2025-01-01\n";
        const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf-8")]);
        const out = csvService.parseExternalOrdersCsv(buf);
        expect(out.length).toBe(1);
        expect(out[0].items[0].code).toBe("P9");
    });
});

describe("branch coverage 91: settingsService 物流・ブランディング", () => {
    let origSettings;

    beforeEach(async () => {
        origSettings = await fs.readFile(SETTINGS_PATH, "utf-8").catch(() => "{}");
        settingsService.invalidateSettingsCache();
    });

    afterEach(async () => {
        await fs.writeFile(SETTINGS_PATH, origSettings, "utf-8");
        settingsService.invalidateSettingsCache();
    });

    test("getLogisticsCsvImportConfig は memoFields 空ならデフォルト配列で補完される", async () => {
        const cur = JSON.parse(origSettings);
        cur.dataFormats = cur.dataFormats || {};
        cur.dataFormats.logisticsCsvImport = { memoFields: [], orderNumber: [] };
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(cur, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const cfg = await settingsService.getLogisticsCsvImportConfig();
        expect(Array.isArray(cfg.memoFields)).toBe(true);
        expect(cfg.memoFields.length).toBeGreaterThan(0);
    });

    test("getPublicBranding は dataFormats.publicBranding をマージする", async () => {
        const cur = JSON.parse(origSettings);
        cur.dataFormats = cur.dataFormats || {};
        cur.dataFormats.publicBranding = { companyName: "テスト株式会社", zip: "100-0001" };
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(cur, null, 2), "utf-8");
        settingsService.invalidateSettingsCache();
        const b = await settingsService.getPublicBranding();
        expect(b.companyName).toBe("テスト株式会社");
        expect(b.zip).toBe("100-0001");
        expect(b.address || "").toBeTruthy();
    });

    test("updateSettings は cartShippingNotice が非文字列なら空文字に正規化される", async () => {
        await settingsService.updateSettings({ cartShippingNotice: 12345 });
        settingsService.invalidateSettingsCache();
        const s = await settingsService.getSettings();
        expect(s.cartShippingNotice).toBe("");
    });
});
