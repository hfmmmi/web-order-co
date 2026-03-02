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

describe("Aランク: 出荷登録の同時実行", () => {
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

    test("同一注文への同時出荷登録で shipments が取りこぼれない", async () => {
        const customer = request.agent(app);
        const admin = request.agent(app);

        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const placed = await customer.post("/place-order").send({
            cart: [{ code: "P001", quantity: 2 }],
            deliveryInfo: {
                date: "最短",
                zip: "1000001",
                tel: "03-1111-2222",
                address: "東京都千代田区1-1",
                name: "同時出荷テスト",
                note: ""
            }
        });
        expect(placed.statusCode).toBe(200);
        expect(placed.body.success).toBe(true);
        const orderId = placed.body.orderId;

        const [a, b] = await Promise.all([
            admin.post("/api/register-shipment").send({
                orderId,
                shipItems: [{ code: "P001", quantity: 1 }],
                deliveryCompany: "A便",
                trackingNumber: "TN-A-001",
                deliveryDateUnknown: true
            }),
            admin.post("/api/register-shipment").send({
                orderId,
                shipItems: [{ code: "P001", quantity: 1 }],
                deliveryCompany: "B便",
                trackingNumber: "TN-B-001",
                deliveryDateUnknown: true
            })
        ]);

        expect(a.statusCode).toBe(200);
        expect(b.statusCode).toBe(200);
        expect(a.body.success).toBe(true);
        expect(b.body.success).toBe(true);

        const orders = await readJson("orders.json");
        const target = orders.find((o) => String(o.orderId) === String(orderId));
        expect(target).toBeTruthy();
        expect(Array.isArray(target.shipments)).toBe(true);
        expect(target.shipments.length).toBe(2);
        const trackingNumbers = target.shipments.map((s) => s.trackingNumber);
        expect(trackingNumbers).toContain("TN-A-001");
        expect(trackingNumbers).toContain("TN-B-001");
    });
});
