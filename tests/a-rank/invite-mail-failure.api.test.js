const mockedMailService = {
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn(),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
};

jest.mock("../../services/mailService", () => mockedMailService);

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson
} = require("../helpers/testSandbox");

describe("Aランク: 招待/再設定メール失敗時の分岐", () => {
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

    test("/api/admin/send-invite-email は mailService失敗時に success:false を返す", async () => {
        mockedMailService.sendInviteEmail.mockResolvedValueOnce({
            success: false,
            message: "SMTP auth failed"
        });

        const adminAgent = request.agent(app);
        const login = await adminAgent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        const res = await adminAgent
            .post("/api/admin/send-invite-email")
            .send({ customerId: "TEST001", isPasswordReset: true });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("SMTP auth failed");
        expect(mockedMailService.sendInviteEmail).toHaveBeenCalledTimes(1);
    });

    test("/api/request-password-reset は送信失敗でも同一メッセージを返し、トークンを削除する", async () => {
        mockedMailService.sendInviteEmail.mockResolvedValueOnce({
            success: false,
            message: "EAUTH"
        });

        const res = await request(app)
            .post("/api/request-password-reset")
            .send({ id: "TEST001" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("ご登録のメールアドレスに送信しました。届かない場合は管理者にお問い合わせください。");

        const resetTokens = await readJson("reset_tokens.json");
        expect(resetTokens.TEST001).toBeUndefined();
    });

    test("/api/request-password-reset は顧客不在時も同一メッセージを返す（情報漏えい防止）", async () => {
        const res = await request(app)
            .post("/api/request-password-reset")
            .send({ id: "UNKNOWN999" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("ご登録のメールアドレスに送信しました。届かない場合は管理者にお問い合わせください。");
        expect(mockedMailService.sendInviteEmail).toHaveBeenCalledTimes(0);
    });
});
