describe("Aランク: loginFailureAlert テンプレート置換", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    test("sendLoginFailureAlert はプレースホルダを展開して送信する", async () => {
        const sendMail = jest.fn().mockResolvedValue({});
        const createTransport = jest.fn(() => ({ sendMail }));
        jest.doMock("nodemailer", () => ({ createTransport }));

        const settingsServiceMock = {
            getMailConfig: jest.fn().mockResolvedValue({
                transporter: { service: "gmail", auth: { user: "u", pass: "p" } },
                from: "from@example.com",
                supportNotifyTo: "support@example.com",
                templates: {
                    loginFailureAlertSubject: "件名 {{customerName}} {{count}}",
                    loginFailureAlertBody: "本文 {{customerName}} {{date}} {{count}}",
                    loginFailureAlertAdminSubject: "管理者 {{adminId}} {{adminName}} {{count}}",
                    loginFailureAlertAdminBody: "管理本文 {{adminId}} {{adminName}} {{date}} {{count}}"
                }
            }),
            applyTemplate: jest.requireActual("../../services/settingsService").applyTemplate
        };
        jest.doMock("../../services/settingsService", () => settingsServiceMock);

        const mailService = require("../../services/mailService");

        const ok = await mailService.sendLoginFailureAlert({
            type: "customer",
            count: 5,
            customer: {
                customerId: "TEST001",
                customerName: "テスト顧客",
                email: "test001@example.com"
            }
        });

        expect(ok).toBe(true);
        expect(createTransport).toHaveBeenCalledTimes(1);
        expect(sendMail).toHaveBeenCalledTimes(1);

        const mail = sendMail.mock.calls[0][0];
        expect(mail.to).toBe("test001@example.com");
        expect(mail.subject).toContain("テスト顧客");
        expect(mail.subject).toContain("5");
        expect(mail.text).toContain("テスト顧客");
        expect(mail.text).toContain("5");
        expect(mail.subject).not.toContain("{{");
        expect(mail.text).not.toContain("{{");
    });
});
