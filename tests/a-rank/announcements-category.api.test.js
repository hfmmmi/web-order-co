/**
 * settingsService.getAnnouncements(target, category): order/general の切り分けと
 * 公開APIで orderBanners が category=order のみであることを検証
 * npm run test:api / test:all で実行
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");
const settingsService = require("../../services/settingsService");

describe("Aランク: お知らせ category order/general 境界", () => {
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

    test("getAnnouncements(target, 'order') は category=order のみ返す", async () => {
        const settings = await readJson("settings.json");
        settings.announcements = [
            { title: "注文関連", category: "order", enabled: true, target: "customer" },
            { title: "一般", category: "general", enabled: true, target: "customer" }
        ];
        await writeJson("settings.json", settings);

        const orderOnly = await settingsService.getAnnouncements("customer", "order");
        expect(orderOnly.length).toBe(1);
        expect(orderOnly[0].category).toBe("order");
        expect(orderOnly[0].title).toBe("注文関連");
    });

    test("getAnnouncements(target, 'general') は category=general のみ返す", async () => {
        const settings = await readJson("settings.json");
        settings.announcements = [
            { title: "注文関連", category: "order", enabled: true, target: "customer" },
            { title: "一般", category: "general", enabled: true, target: "customer" }
        ];
        await writeJson("settings.json", settings);

        const generalOnly = await settingsService.getAnnouncements("customer", "general");
        expect(generalOnly.length).toBe(1);
        expect(generalOnly[0].category).toBe("general");
        expect(generalOnly[0].title).toBe("一般");
    });

    test("getAnnouncements(target) は category 省略時は order と general の両方を返す", async () => {
        const settings = await readJson("settings.json");
        settings.announcements = [
            { title: "注文関連", category: "order", enabled: true, target: "customer" },
            { title: "一般", category: "general", enabled: true, target: "customer" }
        ];
        await writeJson("settings.json", settings);

        const all = await settingsService.getAnnouncements("customer");
        expect(all.length).toBe(2);
        expect(all.map((a) => a.category).sort()).toEqual(["general", "order"]);
    });

    test("GET /api/settings/public の orderBanners に general が混ざらない", async () => {
        const settings = await readJson("settings.json");
        settings.announcements = [
            { title: "注文バナー", category: "order", enabled: true, target: "customer" },
            { title: "お知らせページ用", category: "general", enabled: true, target: "customer" }
        ];
        await writeJson("settings.json", settings);

        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.body.orderBanners).toBeDefined();
        expect(Array.isArray(res.body.orderBanners)).toBe(true);
        const categories = res.body.orderBanners.map((a) => a.category);
        const orderTitles = res.body.orderBanners.map((a) => a.title);
        expect(categories.every((c) => c === "order")).toBe(true);
        expect(orderTitles).not.toContain("お知らせページ用");
    });
});
