/**
 * ステップ3: 性能監視ミドルウェアの動作検証
 * X-Response-Time ヘッダが全レスポンスに付与されることを確認
 */
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

describe("Bランク: ステップ3 性能監視", () => {
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

    test("APIレスポンスに X-Response-Time ヘッダが付与される", async () => {
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(200);
        expect(res.headers["x-response-time"]).toBeDefined();
        expect(res.headers["x-response-time"]).toMatch(/^\d+ms$/);
    });

    test("認証APIでも X-Response-Time が付与される", async () => {
        const res = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "WrongPassword!" });
        expect(res.statusCode).toBe(200);
        expect(res.headers["x-response-time"]).toBeDefined();
    });
});
