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
    seedBaseData
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Bランク: 商品・カート・お知らせAPI", () => {
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

    test("products はページネーションと stockUi を返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const res = await agent.get("/products?page=1&limit=1");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items.length).toBe(1);
        expect(res.body.pagination.currentPage).toBe(1);
        expect(typeof res.body.stockUi).toBe("object");
        expect(res.body.items[0]).toHaveProperty("stockInfo");
    });

    test("cart-details は最新価格を反映して返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const res = await agent
            .post("/cart-details")
            .send({ cart: [{ productCode: "P001", quantity: 2 }] });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.cartDetails)).toBe(true);
        expect(res.body.cartDetails[0].code).toBe("P001");
        expect(res.body.cartDetails[0].price).toBe(900);
        expect(res.body.cartDetails[0].quantity).toBe(2);
    });

    test("settings/public は orderBanners と announcements を返す", async () => {
        const settingsService = require("../../services/settingsService");
        await settingsService.updateSettings({
            announcements: [
                {
                    id: "a-order",
                    title: "配送遅延",
                    body: "本日遅延あり",
                    type: "warning",
                    target: "customer",
                    category: "order",
                    enabled: true,
                    startDate: null,
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "a-general",
                    title: "一般連絡",
                    body: "メンテ予告",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: null,
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                }
            ]
        });

        const pub = await request(app).get("/api/settings/public");
        expect(pub.statusCode).toBe(200);
        expect(pub.body.orderBanners.some((a) => a.id === "a-order")).toBe(true);
        expect(pub.body.announcements.some((a) => a.id === "a-general")).toBe(true);
    });
});
