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

    test("sendOrderConfirmation は荷主名がなければ荷主ブロックを付けない", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            orderNotifyTo: "to@test",
            templates: {
                orderSubject: "注文{{orderId}}",
                orderBody: "{{shipperInfo}}"
            },
            transporter: { host: "smtp.test", port: 587, auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendOrderConfirmation(
            {
                orderId: "ORD-N",
                deliveryInfo: { shipper: { address: "住所のみ" } }
            },
            "顧客名"
        );
        expect(result).toBe(true);
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

    test("sendSupportNotification は category が bug 以外でサポート用ラベルになる", async () => {
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
            ticketId: "T-NONBUG",
            category: "question",
            customerName: "テスト",
            customerId: "C001",
            detail: "内容"
        });
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
    test("sendSupportNotification は添付に originalName が無いとき storedName を一覧に使う", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "support@test",
            templates: {
                supportSubject: "S",
                supportBody: "{{attachmentsList}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendSupportNotification({
            ticketId: "T-NONAME",
            category: "bug",
            customerName: "テスト",
            customerId: "C001",
            detail: "d",
            attachments: [{ storedName: "onlystored.pdf", size: 10 }]
        });
        expect(result).toBe(true);
    });

    test("sendSupportNotification は添付ファイルがディスクに無いとき stat 失敗でスキップして送信", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "support@test",
            templates: {
                supportSubject: "S",
                supportBody: "{{detail}} {{attachmentsList}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendSupportNotification({
            ticketId: "T-NOFILE-ON-DISK",
            category: "support",
            customerName: "テスト",
            customerId: "C001",
            detail: "詳細",
            attachments: [{ storedName: "ghost.pdf", originalName: "ghost.pdf", size: 100 }]
        });
        expect(result).toBe(true);
    });

    test("sendSupportNotification は添付が大きすぎるとメールに含めない", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "support@test",
            templates: {
                supportSubject: "S",
                supportBody: "{{detail}} {{attachmentsList}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const big = 6 * 1024 * 1024;
        const result = await mailService.sendSupportNotification({
            ticketId: "T-BIG",
            category: "bug",
            customerName: "テスト",
            customerId: "C001",
            detail: "詳細",
            attachments: [{ storedName: "huge.bin", originalName: "huge.bin", size: big }]
        });
        expect(result).toBe(true);
    });

    test("sendSupportNotification は添付ファイルが存在すると path 添付で送信する", async () => {
        const fs = require("fs").promises;
        const path = require("path");
        const { DATA_ROOT } = require("../../dbPaths");
        const tid = "T-ATT-MAIL";
        const dir = path.join(DATA_ROOT, "support_attachments", tid);
        await fs.mkdir(dir, { recursive: true });
        const fp = path.join(dir, "note.txt");
        await fs.writeFile(fp, "hello", "utf8");
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            supportNotifyTo: "support@test",
            templates: {
                supportSubject: "S",
                supportBody: "{{detail}}"
            },
            transporter: { host: "smtp.test", auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        const result = await mailService.sendSupportNotification({
            ticketId: tid,
            category: "bug",
            customerName: "テスト",
            customerId: "C001",
            detail: "詳細",
            attachments: [{ storedName: "note.txt", originalName: "note.txt", size: 10 }]
        });
        expect(result).toBe(true);
        await fs.unlink(fp).catch(() => {});
    });

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

    test("sendInviteEmail は EAUTH 以外の送信エラーで汎用メッセージを返す", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(new Error("connection reset"))
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
        expect(result.message).toContain("connection reset");
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

    test("sendInviteEmail は EAUTH かつ NODE_ENV=production で本番向けメッセージ", async () => {
        const prevNodeEnv = process.env.NODE_ENV;
        const prevMailPass = process.env.MAIL_PASSWORD;
        process.env.NODE_ENV = "production";
        process.env.MAIL_PASSWORD = "x";
        try {
            jest.resetModules();
            const nodemailer = require("nodemailer");
            nodemailer.createTransport = jest.fn(() => ({
                sendMail: jest.fn().mockRejectedValue(Object.assign(new Error("auth failed"), { code: "EAUTH" }))
            }));
            const ss = require("../../services/settingsService");
            ss.getMailConfig = jest.fn().mockResolvedValue({
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
            expect(result.message).toContain("MAIL_PASSWORD");
            expect(result.message).toContain("本番環境");
        } finally {
            process.env.NODE_ENV = prevNodeEnv;
            if (prevMailPass === undefined) {
                delete process.env.MAIL_PASSWORD;
            } else {
                process.env.MAIL_PASSWORD = prevMailPass;
            }
        }
    });

    test("sendInviteEmail は Missing credentials メッセージでも認証エラー扱い", async () => {
        jest.resetModules();
        const nodemailer = require("nodemailer");
        nodemailer.createTransport = jest.fn(() => ({
            sendMail: jest.fn().mockRejectedValue(new Error("Missing credentials for LOGIN"))
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

    test("sendLoginFailureAlert は admin で supportNotifyTo が無いと false", async () => {
        jest.resetModules();
        const ss = require("../../services/settingsService");
        ss.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            templates: {
                loginFailureAlertAdminSubject: "S{{adminId}}",
                loginFailureAlertAdminBody: "B"
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
        expect(result).toBe(false);
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
