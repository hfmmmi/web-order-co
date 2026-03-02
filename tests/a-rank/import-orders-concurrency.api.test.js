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

function buildExternalCsv(orderId, productCode) {
    return Buffer.from(
        [
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate",
            `${orderId},TEST001,テスト顧客,${productCode},商品-${productCode},100,1,2026-01-01`
        ].join("\n"),
        "utf-8"
    );
}

describe("Aランク: 外部受注CSV取込の同時実行", () => {
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

    test("異なるorderIdを同時取込しても両方保存される", async () => {
        const admin = request.agent(app);
        const login = await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const [a, b] = await Promise.all([
            admin.post("/api/import-orders-csv").attach("file", buildExternalCsv("EXT-1001", "P001"), "a.csv"),
            admin.post("/api/import-orders-csv").attach("file", buildExternalCsv("EXT-1002", "P002"), "b.csv")
        ]);

        expect(a.statusCode).toBe(200);
        expect(b.statusCode).toBe(200);
        expect(a.body.success).toBe(true);
        expect(b.body.success).toBe(true);

        const orders = await readJson("orders.json");
        const imported = orders.filter((o) => String(o.source || "") === "external");
        const ids = imported.map((o) => String(o.orderId));
        expect(ids).toContain("EXT-1001");
        expect(ids).toContain("EXT-1002");
    });

    test("同一orderIdを同時取込しても重複登録されない", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const [a, b] = await Promise.all([
            admin.post("/api/import-orders-csv").attach("file", buildExternalCsv("EXT-2001", "P001"), "c.csv"),
            admin.post("/api/import-orders-csv").attach("file", buildExternalCsv("EXT-2001", "P001"), "d.csv")
        ]);

        expect(a.statusCode).toBe(200);
        expect(b.statusCode).toBe(200);
        expect(a.body.success).toBe(true);
        expect(b.body.success).toBe(true);

        const orders = await readJson("orders.json");
        const hit = orders.filter((o) => String(o.orderId) === "EXT-2001");
        expect(hit).toHaveLength(1);
    });
});
