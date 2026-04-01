/**
 * settingsService.updateSettings の deepMerge 分岐（announcements / shippingRules / cartShippingNotice）
 */
"use strict";

const settingsService = require("../../services/settingsService");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: settingsService updateSettings マージ", () => {
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

    test("announcements 配列はそのまま置換される", async () => {
        const merged = await settingsService.updateSettings({
            announcements: [{ id: "a1", title: "T", body: "B", audience: "customer" }]
        });
        expect(Array.isArray(merged.announcements)).toBe(true);
        expect(merged.announcements.some((x) => x.id === "a1")).toBe(true);
    });

    test("shippingRules オブジェクトをマージできる", async () => {
        const merged = await settingsService.updateSettings({
            shippingRules: { ruleTest: { min: 0, fee: 500 } }
        });
        expect(merged.shippingRules && merged.shippingRules.ruleTest).toBeDefined();
    });

    test("cartShippingNotice が非文字列なら空文字に正規化される", async () => {
        const merged = await settingsService.updateSettings({
            cartShippingNotice: null
        });
        expect(merged.cartShippingNotice).toBe("");
    });
});
