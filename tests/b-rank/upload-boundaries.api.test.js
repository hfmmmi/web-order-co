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
    seedBaseData
} = require("../helpers/testSandbox");

describe("Bランク: ファイルアップロード境界", () => {
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

    test("管理アップロードAPIはファイル未添付を400で返す", async () => {
        const admin = request.agent(app);
        const login = await admin
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const [stocks, kaitori, estimates] = await Promise.all([
            admin.post("/api/admin/stocks/import").send({}),
            admin.post("/api/admin/kaitori/parse-excel").send({}),
            admin.post("/api/admin/import-estimates").send({})
        ]);

        expect(stocks.statusCode).toBe(400);
        expect(stocks.body.success).toBe(false);
        expect(String(stocks.body.message)).toContain("在庫CSVファイル");

        expect(kaitori.statusCode).toBe(400);
        expect(kaitori.body.success).toBe(false);
        expect(String(kaitori.body.message)).toContain("Excelファイル");

        expect(estimates.statusCode).toBe(400);
        expect(estimates.body.success).toBe(false);
        expect(String(estimates.body.message)).toContain("ファイル");
    });

    test("買取Excel解析は不正バイナリを受け取っても500で安全に失敗する", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const badBuffer = Buffer.from("not-an-excel-file", "utf-8");
        const res = await admin
            .post("/api/admin/kaitori/parse-excel")
            .attach("excelFile", badBuffer, "bad.xlsx");

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(String(res.body.message)).toContain("Excelの読み込みに失敗");
    });

    test("見積取込は不正ファイル形式でも500ではなく400で扱える", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const badBuffer = Buffer.from("this,is,not,valid,estimate\nx,y,z", "utf-8");
        const res = await admin
            .post("/api/admin/import-estimates")
            .attach("estimateFile", badBuffer, "bad-estimate.csv");

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(String(res.body.message)).toContain("有効なデータが見つかりませんでした");
    });
});
