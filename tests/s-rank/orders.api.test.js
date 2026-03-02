jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson
} = require("../helpers/testSandbox");

describe("Sランク: 注文確定API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("未ログイン時は注文できない", async () => {
        const res = await request(app)
            .post("/place-order")
            .send({
                cart: [{ code: "X001", name: "テスト商品", price: 100, quantity: 1 }],
                deliveryInfo: { name: "テスト太郎", address: "東京都", tel: "000-0000-0000" }
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
    });

    test("ログイン済み顧客は注文確定できる", async () => {
        const agent = request.agent(app);

        const login = await agent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.body.success).toBe(true);

        const res = await agent
            .post("/place-order")
            .send({
                cart: [{ code: "X001", name: "テスト商品", price: 100, quantity: 2 }],
                deliveryInfo: {
                    name: "テスト太郎",
                    address: "東京都千代田区1-1",
                    tel: "000-0000-0000",
                    zip: "1000001",
                    note: "テスト配送"
                }
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.orderId).toBe("number");

        const orders = await readJson("orders.json");
        expect(Array.isArray(orders)).toBe(true);
        expect(orders.length).toBe(1);
        expect(orders[0].customerId).toBe("TEST001");
    });
});
