jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const ExcelJS = require("exceljs");
const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Bランク: 周辺業務API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("products/frequent は注文回数順で返す", async () => {
        const customerAgent = request.agent(app);
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const makeOrder = (cart) => customerAgent.post("/place-order").send({
            cart,
            deliveryInfo: {
                date: "最短",
                zip: "1000001",
                tel: "03-1111-2222",
                address: "東京都千代田区1-1",
                name: "テスト納品先",
                note: "頻度テスト"
            }
        });

        await makeOrder([{ code: "P001", quantity: 1 }]);
        await makeOrder([{ code: "P001", quantity: 2 }]);
        await makeOrder([{ code: "P002", quantity: 1 }]);

        const res = await customerAgent.get("/products/frequent?limit=10");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items[0].productCode).toBe("P001");
        expect(res.body.items[0].orderCount).toBeGreaterThan(res.body.items[1].orderCount);
    });

    test("support/my-tickets は本人チケットのみ返す", async () => {
        const customerAgent = request.agent(app);
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const create = await customerAgent.post("/request-support").send({
            category: "bug",
            detail: "プリンタエラー",
            orderId: "W001"
        });
        expect(create.statusCode).toBe(200);
        expect(create.body.success).toBe(true);

        const current = await readJson("support_tickets.json");
        current.push({
            ticketId: "T-OTHER",
            status: "open",
            category: "support",
            detail: "other",
            customerId: "TEST002",
            customerName: "他顧客",
            timestamp: new Date().toISOString(),
            history: []
        });
        await writeJson("support_tickets.json", current);

        const mine = await customerAgent.get("/support/my-tickets");
        expect(mine.statusCode).toBe(200);
        expect(mine.body.success).toBe(true);
        expect(mine.body.tickets.every((t) => t.ticketId !== "T-OTHER")).toBe(true);
    });

    test("delivery-history / shipper-history が履歴を返す", async () => {
        const customerAgent = request.agent(app);
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const placed = await customerAgent.post("/place-order").send({
            cart: [{ code: "P001", quantity: 1 }],
            deliveryInfo: {
                date: "最短",
                zip: "1500001",
                tel: "03-3333-4444",
                address: "東京都渋谷区1-1",
                name: "配送先A",
                note: "履歴テスト",
                shipper: {
                    zip: "1600001",
                    address: "東京都新宿区1-1",
                    name: "荷主A",
                    tel: "03-9999-1111"
                }
            }
        });
        expect(placed.body.success).toBe(true);

        const delivery = await customerAgent.get("/delivery-history?keyword=渋谷");
        expect(delivery.statusCode).toBe(200);
        expect(delivery.body.success).toBe(true);
        expect(delivery.body.list.length).toBeGreaterThan(0);

        const shipper = await customerAgent.get("/shipper-history?keyword=荷主A");
        expect(shipper.statusCode).toBe(200);
        expect(shipper.body.success).toBe(true);
        expect(shipper.body.list.length).toBeGreaterThan(0);
    });

    test("管理者向けCSVと在庫テンプレートが取得できる", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const csv = await adminAgent.get("/api/download-csv");
        expect(csv.statusCode).toBe(200);
        expect(String(csv.headers["content-type"])).toContain("text/csv");

        const template = await adminAgent.get("/api/admin/stocks/template");
        expect(template.statusCode).toBe(200);
        expect(String(template.headers["content-type"])).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });

    test("買取Excel解析APIがExcelファイルを受け付ける", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Sheet1");
        sheet.addRow(["code", "name", "price"]);
        sheet.addRow(["K001", "テスト品", 100]);
        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

        const res = await adminAgent
            .post("/api/admin/kaitori/parse-excel")
            .attach("excelFile", buffer, "kaitori.xlsx");

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });
});
