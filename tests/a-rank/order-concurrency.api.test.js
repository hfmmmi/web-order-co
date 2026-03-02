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

describe("Aランク: 注文同時実行の整合性", () => {
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

    test("同一顧客の同時注文2件でも両方保存され、orderIdが重複しない", async () => {
        const customer = request.agent(app);
        const login = await customer
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const payloadA = {
            cart: [{ code: "P001", quantity: 1 }],
            deliveryInfo: {
                date: "最短",
                zip: "1000001",
                tel: "03-1111-2222",
                address: "東京都千代田区1-1",
                name: "同時注文A",
                note: ""
            }
        };
        const payloadB = {
            cart: [{ code: "P002", quantity: 2 }],
            deliveryInfo: {
                date: "最短",
                zip: "1000001",
                tel: "03-1111-2222",
                address: "東京都千代田区1-1",
                name: "同時注文B",
                note: ""
            }
        };

        const [resA, resB] = await Promise.all([
            customer.post("/place-order").send(payloadA),
            customer.post("/place-order").send(payloadB)
        ]);

        expect(resA.statusCode).toBe(200);
        expect(resB.statusCode).toBe(200);
        expect(resA.body.success).toBe(true);
        expect(resB.body.success).toBe(true);
        expect(typeof resA.body.orderId).toBe("number");
        expect(typeof resB.body.orderId).toBe("number");
        expect(resA.body.orderId).not.toBe(resB.body.orderId);

        const orders = await readJson("orders.json");
        expect(Array.isArray(orders)).toBe(true);
        expect(orders).toHaveLength(2);
        const ids = orders.map((o) => o.orderId);
        expect(new Set(ids).size).toBe(2);
    });
});
