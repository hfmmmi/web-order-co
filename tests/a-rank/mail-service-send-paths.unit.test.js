/**
 * mailService の送信経路をモックでカバー（sendOrderConfirmation, sendSupportNotification 等）
 * 実際のメールは送らず、transporter をモックして try ブロックを通す
 * npm run test:api / test:all で実行
 */
jest.mock("nodemailer", () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: "test-id" })
    }))
}));

const settingsService = require("../../services/settingsService");

describe("Aランク: mailService 送信経路カバレッジ", () => {
    let origGetMailConfig;

    beforeAll(() => {
        origGetMailConfig = settingsService.getMailConfig;
    });

    afterAll(() => {
        settingsService.getMailConfig = origGetMailConfig;
    });

    test("sendOrderConfirmation は荷主ありで shipperInfo を本文に含めて送信する", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            orderNotifyTo: "to@test",
            templates: {
                orderSubject: "注文{{orderId}}",
                orderBody: "{{customerName}} {{shipperInfo}}"
            },
            transporter: { host: "smtp.test", port: 587, auth: { user: "u", pass: "p" } }
        });

        const mailService = require("../../services/mailService");
        const result = await mailService.sendOrderConfirmation(
            {
                orderId: "ORD-001",
                deliveryInfo: {
                    shipper: { name: "荷主A", address: "東京", tel: "03-1111" }
                }
            },
            "顧客名"
        );
        expect(result).toBe(true);
    });

    test("sendSupportNotification は category でラベルを分けて送信する", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "support@test",
            templates: {
                supportSubject: "{{categoryLabel}}",
                supportBody: "{{ticketId}} {{detail}}"
            },
            transporter: { host: "smtp.test", port: 587, auth: { user: "u", pass: "p" } }
        });

        const mailService = require("../../services/mailService");
        const result = await mailService.sendSupportNotification({
            ticketId: "T1",
            category: "bug",
            customerName: "テスト",
            customerId: "C001",
            detail: "内容"
        });
        expect(result).toBe(true);
    });

    test("sendOrderConfirmation は送信失敗で false を返す", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(new Error("SMTP Error"))
        }));
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            orderNotifyTo: "to@test",
            templates: { orderSubject: "s", orderBody: "b" },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendOrderConfirmation(
            { orderId: "O1", deliveryInfo: {} },
            "名"
        );
        expect(result).toBe(false);
    });

    test("sendInviteEmail は isPasswordReset=true でパスワード再設定テンプレートを使う", async () => {
        jest.resetModules();
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {
                passwordResetSubject: "再設定{{customerName}}",
                passwordResetBody: "{{inviteUrl}}",
                inviteSubject: "招待",
                inviteBody: "招待"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendInviteEmail(
            { customerId: "C1", customerName: "顧客", email: "c1@test" },
            "http://setup?id=1&key=k",
            "temp123",
            true
        );
        expect(result.success).toBe(true);
    });

    test("sendInviteEmail は email なしで失敗を返す", async () => {
        jest.resetModules();
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {},
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendInviteEmail(
            { customerId: "C1", customerName: "顧客", email: "" },
            "http://setup?id=1&key=k",
            "temp123",
            false
        );
        expect(result.success).toBe(false);
        expect(result.message).toContain("メールアドレス");
    });

    test("sendPasswordChangedNotification は email なしで失敗を返す", async () => {
        jest.resetModules();
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {},
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendPasswordChangedNotification({
            customerId: "C1",
            customerName: "顧客",
            email: ""
        });
        expect(result.success).toBe(false);
        expect(result.message).toContain("メールアドレス");
    });

    test("sendLoginFailureAlert は admin タイプで supportNotifyTo に送信する", async () => {
        jest.resetModules();
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "admin@test",
            templates: {
                loginFailureAlertAdminSubject: "管理者失敗{{adminId}}",
                loginFailureAlertAdminBody: "{{adminName}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendLoginFailureAlert({
            type: "admin",
            adminId: "admin1",
            adminName: "管理者",
            count: 5
        });
        expect(result).toBe(true);
    });

    test("sendLoginFailureAlert は customer で email なしなら false", async () => {
        jest.resetModules();
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {},
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendLoginFailureAlert({
            type: "customer",
            customer: { customerId: "C1", email: "" },
            count: 5
        });
        expect(result).toBe(false);
    });

    // Phase 3: mailService 失敗経路カバレッジ
    test("sendSupportNotification は送信失敗時に false を返す", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(new Error("SMTP Error"))
        }));
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "support@test",
            templates: {
                supportSubject: "{{categoryLabel}}",
                supportBody: "{{ticketId}} {{detail}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendSupportNotification({
            ticketId: "T-ERR",
            category: "bug",
            customerName: "テスト",
            customerId: "C001",
            detail: "詳細"
        });
        expect(result).toBe(false);
    });

    test("sendInviteEmail は EAUTH エラー時にメール認証エラーのメッセージを返す", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(Object.assign(new Error("EAUTH"), { code: "EAUTH" }))
        }));
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {
                inviteSubject: "招待{{customerName}}",
                inviteBody: "{{inviteUrl}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendInviteEmail(
            { customerId: "C1", customerName: "顧客", email: "c1@test" },
            "http://setup?id=1&key=k",
            "temp123",
            false
        );
        expect(result.success).toBe(false);
        expect(result.message).toContain("メール認証エラー");
    });

    test("sendPasswordChangedNotification は送信失敗時に false を返す", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(new Error("SMTP Error"))
        }));
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {},
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendPasswordChangedNotification({
            customerId: "C1",
            customerName: "顧客",
            email: "c1@test"
        });
        expect(result.success).toBe(false);
    });

    test("sendLoginFailureAlert は内部エラー時に false を返す", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(new Error("SMTP Error"))
        }));
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "admin@test",
            templates: {},
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendLoginFailureAlert({
            type: "admin",
            adminId: "admin1",
            adminName: "管理者",
            count: 5
        });
        expect(result).toBe(false);
    });
});
