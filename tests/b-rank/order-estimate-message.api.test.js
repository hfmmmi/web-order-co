/**
 * 納期目安（estimateMessage）: 管理で更新 → 顧客 order-history で同一値が返ることを検証
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
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Bランク: 納期目安 更新→顧客履歴で一致", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
    });

    test("管理で deliveryEstimate を更新すると顧客 order-history に反映される", async () => {
        const customerAgent = request.agent(app);
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const placeRes = await customerAgent.post("/place-order").send({
            cart: [{ code: "P001", name: "テストトナーA", price: 1000, quantity: 1 }],
            deliveryInfo: {
                name: "テスト配送先",
                zip: "100-0001",
                address: "東京都",
                tel: "03-0000-0000",
                clientOrderNumber: "EST-001"
            }
        });
        expect(placeRes.statusCode).toBe(200);
        expect(placeRes.body.orderId).toBeDefined();
        const orderId = placeRes.body.orderId;

        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const updateRes = await adminAgent
            .post("/api/update-order-status")
            .send({ orderId, deliveryEstimate: "翌週水曜日お届け予定" });
        expect(updateRes.statusCode).toBe(200);
        expect(updateRes.body.success).toBe(true);

        const historyRes = await customerAgent.get("/order-history");
        expect(historyRes.statusCode).toBe(200);
        expect(historyRes.body.history).toBeDefined();
        const order = historyRes.body.history.find((o) => o.orderId === orderId);
        expect(order).toBeDefined();
        expect(order.deliveryInfo).toBeDefined();
        expect(order.deliveryInfo.estimateMessage).toBe("翌週水曜日お届け予定");
    });
});
