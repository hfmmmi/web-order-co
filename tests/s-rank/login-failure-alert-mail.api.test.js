const mockedMailService = {
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
};

jest.mock("../../services/mailService", () => mockedMailService);

const request = require("supertest");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Sランク: ログイン失敗5回通知メール", () => {
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
        await writeJson("login_rate_limit.json", {});
        jest.clearAllMocks();
    }, 120000);

    test("顧客ログイン失敗5回目で通知が顧客宛条件で呼ばれる", async () => {
        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post("/api/login")
                .send({ id: "TEST001", pass: "WrongPassword!" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        }

        expect(mockedMailService.sendLoginFailureAlert).toHaveBeenCalledTimes(1);
        expect(mockedMailService.sendLoginFailureAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "customer",
                count: 5,
                customer: expect.objectContaining({
                    customerId: "TEST001",
                    customerName: "テスト顧客",
                    email: "test001@example.com"
                })
            })
        );
    });

    test("管理者ログイン失敗5回目で通知が管理者宛条件で呼ばれる", async () => {
        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post("/api/admin/login")
                .send({ id: "test-admin", pass: "WrongPassword!" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        }

        expect(mockedMailService.sendLoginFailureAlert).toHaveBeenCalledTimes(1);
        expect(mockedMailService.sendLoginFailureAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "admin",
                adminId: "test-admin",
                adminName: "テスト管理者",
                count: 5
            })
        );
    });

    test("通知送信が失敗してもロック挙動は崩れない", async () => {
        mockedMailService.sendLoginFailureAlert.mockRejectedValueOnce(new Error("SMTP failed"));

        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post("/api/login")
                .send({ id: "TEST001", pass: "WrongPassword!" });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
        }

        const locked = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "WrongPassword!" });

        expect(locked.statusCode).toBe(200);
        expect(locked.body.success).toBe(false);
        expect(locked.body.message).toContain("15分後");
        expect(mockedMailService.sendLoginFailureAlert).toHaveBeenCalledTimes(1);

        const rate = await readJson("login_rate_limit.json");
        expect(rate["customer:TEST001"]).toBeTruthy();
        expect(rate["customer:TEST001"].lockedUntil).toBeGreaterThan(Date.now());
    });
});
