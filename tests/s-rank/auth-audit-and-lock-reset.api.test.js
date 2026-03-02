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
    readJson,
    writeJson,
    seedBaseData
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Sランク: ログイン失敗管理", () => {
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

    test("ログイン成功時に login_rate_limit がクリアされる", async () => {
        await request(app).post("/api/login").send({ id: "TEST001", pass: "WrongPassword!" });
        await request(app).post("/api/login").send({ id: "TEST001", pass: "WrongPassword!" });

        const before = await readJson("login_rate_limit.json");
        expect(Array.isArray(before["customer:TEST001"]?.attempts)).toBe(true);
        expect(before["customer:TEST001"].attempts.length).toBe(2);

        const success = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(success.statusCode).toBe(200);
        expect(success.body.success).toBe(true);

        const after = await readJson("login_rate_limit.json");
        expect(after["customer:TEST001"]).toBeUndefined();
    });
});
