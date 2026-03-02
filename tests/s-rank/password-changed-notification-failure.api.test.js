const mockedMailService = {
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn(),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
};

jest.mock("../../services/mailService", () => mockedMailService);

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    writeJson,
    readJson
} = require("../helpers/testSandbox");

describe("Sランク: パスワード変更完了通知の失敗分岐", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        jest.clearAllMocks();
    });

    test("通知送信失敗でも setup は成功し、トークンは消去され再利用できない", async () => {
        mockedMailService.sendPasswordChangedNotification.mockRejectedValueOnce(new Error("SMTP temporary failure"));

        await writeJson("reset_tokens.json", {
            TEST001: {
                token: "reset-token-001",
                expiresAt: Date.now() + (60 * 60 * 1000)
            }
        });

        const setup = await request(app)
            .post("/api/setup")
            .send({
                id: "TEST001",
                key: "reset-token-001",
                newPass: "NewStrongPass123!"
            });

        expect(setup.statusCode).toBe(200);
        expect(setup.body.success).toBe(true);
        expect(setup.body.message).toContain("変更");
        expect(mockedMailService.sendPasswordChangedNotification).toHaveBeenCalledTimes(1);
        expect(mockedMailService.sendPasswordChangedNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                customerId: "TEST001",
                customerName: "テスト顧客",
                email: "test001@example.com"
            })
        );

        const afterTokens = await readJson("reset_tokens.json");
        expect(afterTokens.TEST001).toBeUndefined();

        const reused = await request(app)
            .post("/api/setup")
            .send({
                id: "TEST001",
                key: "reset-token-001",
                newPass: "AnotherPass123!"
            });

        expect(reused.statusCode).toBe(200);
        expect(reused.body.success).toBe(false);
    });
});
