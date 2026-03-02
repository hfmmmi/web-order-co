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

describe("Aランク: 主要フローAPI", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("顧客フロー: ログイン -> 注文 -> 履歴確認", async () => {
        const customerAgent = request.agent(app);

        const login = await customerAgent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.body.success).toBe(true);

        const placeOrder = await customerAgent
            .post("/place-order")
            .send({
                cart: [{ code: "FLOW001", name: "フロー商品", price: 300, quantity: 1 }],
                deliveryInfo: {
                    name: "フロー太郎",
                    address: "東京都港区1-1",
                    tel: "03-1111-2222"
                }
            });
        expect(placeOrder.body.success).toBe(true);

        const history = await customerAgent.get("/order-history");
        expect(history.statusCode).toBe(200);
        expect(history.body.success).toBe(true);
        expect(Array.isArray(history.body.history)).toBe(true);
        expect(history.body.history.length).toBeGreaterThan(0);
    });

    test("管理フロー: ログイン -> 顧客追加 -> 顧客更新 -> 一覧取得", async () => {
        const adminAgent = request.agent(app);

        const login = await adminAgent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.body.success).toBe(true);

        const add = await adminAgent
            .post("/api/add-customer")
            .send({
                customerId: "FLOWC01",
                customerName: "フロー顧客",
                password: "FlowPass123!",
                priceRank: "A",
                email: "flowc01@example.com"
            });
        expect(add.body.success).toBe(true);

        const update = await adminAgent
            .post("/api/update-customer")
            .send({
                customerId: "FLOWC01",
                customerName: "更新後フロー顧客",
                priceRank: "B",
                email: "flowc01-updated@example.com"
            });
        expect(update.body.success).toBe(true);

        const list = await adminAgent.get("/api/admin/customers?keyword=FLOWC01&page=1");
        expect(list.statusCode).toBe(200);
        expect(Array.isArray(list.body.customers)).toBe(true);
        expect(list.body.customers.length).toBeGreaterThan(0);

        const fileCustomers = await readJson("customers.json");
        const hit = fileCustomers.find((c) => c.customerId === "FLOWC01");
        expect(hit).toBeTruthy();
        expect(hit.customerName).toBe("更新後フロー顧客");
        expect(hit.priceRank).toBe("B");
    });
});
