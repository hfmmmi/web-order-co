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

function buildShippingCsv(orderId, trackingNumber, company = "テスト運送") {
    return Buffer.from(
        [
            "社内メモ,送り状番号,配送業者",
            `${orderId},${trackingNumber},${company}`
        ].join("\n"),
        "utf-8"
    );
}

describe("Bランク: 出荷CSV取込の同時実行", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    }, 120000);

    afterAll(async () => {
        if (backup) {
            await restoreDbFiles(backup);
        }
    }, 120000);

    beforeEach(async () => {
        await seedBaseData();
    }, 120000);

    test("出荷CSVを同時に2回取り込んでも shipment 反映が取りこぼれない", async () => {
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
                name: "CSV同時取込テスト",
                note: ""
            }
        });
        expect(placed.statusCode).toBe(200);
        expect(placed.body.success).toBe(true);
        const orderId = placed.body.orderId;

        const [r1, r2] = await Promise.all([
            admin
                .post("/api/import-shipping-csv")
                .attach("file", buildShippingCsv(orderId, "TN-CSV-001"), "ship-a.csv"),
            admin
                .post("/api/import-shipping-csv")
                .attach("file", buildShippingCsv(orderId, "TN-CSV-002"), "ship-b.csv")
        ]);

        expect(r1.statusCode).toBe(200);
        expect(r2.statusCode).toBe(200);
        expect(r1.body.success).toBe(true);
        expect(r2.body.success).toBe(true);
        expect(r1.body.count).toBeGreaterThanOrEqual(1);
        expect(r2.body.count).toBeGreaterThanOrEqual(1);

        const orders = await readJson("orders.json");
        const target = orders.find((o) => String(o.orderId) === String(orderId));
        expect(target).toBeTruthy();
        expect(Array.isArray(target.shipments)).toBe(true);
        expect(target.shipments.length).toBe(2);
        const trackingNumbers = target.shipments.map((s) => s.trackingNumber);
        expect(trackingNumbers).toContain("TN-CSV-001");
        expect(trackingNumbers).toContain("TN-CSV-002");
    });
});
