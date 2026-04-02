"use strict";

/**
 * 分岐50本計画: mailService 4 本
 */
jest.mock("nodemailer", () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: "test-id" })
    }))
}));

const settingsService = require("../../services/settingsService");

function mailConfig() {
    return {
        from: "from@test",
        orderNotifyTo: "order@test",
        supportNotifyTo: "support@test",
        templates: {
            orderSubject: "o{{orderId}}",
            orderBody: "b",
            supportSubject: "s",
            supportBody: "body",
            passwordChangedSubject: "pc{{customerId}}",
            passwordChangedBody: "pb",
            inviteSubject: "i",
            inviteBody: "ib",
            loginFailureAlertSubject: "lf",
            loginFailureAlertBody: "lfb",
            loginFailureAlertAdminSubject: "lfa{{adminId}}",
            loginFailureAlertAdminBody: "lfab"
        },
        transporter: { host: "127.0.0.1", port: 25, auth: { user: "u", pass: "p" } }
    };
}

describe("branch coverage plan 50: mailService", () => {
    let origGetMailConfig;

    beforeAll(() => {
        origGetMailConfig = settingsService.getMailConfig;
    });

    afterAll(() => {
        settingsService.getMailConfig = origGetMailConfig;
    });

    beforeEach(() => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue(mailConfig());
        const mailService = require("../../services/mailService");
        mailService.clearTransporterCache();
    });

    test("sendPasswordChangedNotification はメールアドレスなしで success false", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendPasswordChangedNotification({
            customerId: "X1",
            customerName: "N",
            email: ""
        });
        expect(r.success).toBe(false);
    });

    test("sendLoginFailureAlert は customer でメールなし false", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendLoginFailureAlert({
            type: "customer",
            customer: { customerId: "C1", email: "   " }
        });
        expect(ok).toBe(false);
    });

    test("sendLoginFailureAlert は admin で supportNotifyTo へ送信して true", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendLoginFailureAlert({
            type: "admin",
            adminId: "test-admin",
            adminName: "管理者",
            count: 5
        });
        expect(ok).toBe(true);
    });

    test("sendInviteEmail はメールアドレスなしで success false", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendInviteEmail(
            { customerId: "C2", customerName: "N2", email: "" },
            "http://invite",
            "temp",
            false
        );
        expect(r.success).toBe(false);
    });
});
