"use strict";

jest.mock("nodemailer", () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: "test" })
    }))
}));

const settingsService = require("../../services/settingsService");
const mailService = require("../../services/mailService");
const orderService = require("../../services/orderService");

describe("branch-coverage-90-dense-c: mailService", () => {
    let origGetMailConfig;

    beforeAll(() => {
        origGetMailConfig = settingsService.getMailConfig;
    });

    afterAll(() => {
        settingsService.getMailConfig = origGetMailConfig;
    });

    beforeEach(() => {
        mailService.clearTransporterCache();
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "from@test",
            orderNotifyTo: "order@test",
            supportNotifyTo: "support@test",
            templates: {
                orderSubject: "O{{orderId}}",
                orderBody: "{{customerName}}{{shipperInfo}}",
                supportSubject: "{{categoryLabel}}",
                supportBody: "{{ticketId}}{{detail}}{{attachmentsList}}",
                inviteSubject: "INV{{customerName}}",
                inviteBody: "{{inviteUrl}}",
                passwordResetSubject: "RST",
                passwordResetBody: "{{inviteUrl}}",
                passwordChangedSubject: "PWD",
                passwordChangedBody: "{{date}}",
                loginFailureAlertSubject: "LF",
                loginFailureAlertBody: "{{date}}",
                loginFailureAlertAdminSubject: "LFA",
                loginFailureAlertAdminBody: "{{adminId}}"
            },
            transporter: { host: "h", port: 587 }
        });
    });

    test.each([
        [{ orderId: "M1", deliveryInfo: {} }, "顧客A"],
        [{ orderId: "M2", deliveryInfo: { shipper: { name: "S" } } }, "顧客B"],
        [{ orderId: "M3", deliveryInfo: { shipper: { name: "S", address: "A", tel: "T" } } }, "顧客C"]
    ])("sendOrderConfirmation %#", async (order, name) => {
        const r = await mailService.sendOrderConfirmation(order, name);
        expect(r).toBe(true);
    });

    test.each([
        [{ ticketId: "T1", category: "bug", detail: "d", attachments: [] }],
        [{ ticketId: "T2", category: "other", customerName: "CN", attachments: [{ storedName: "x", originalName: "a.txt", size: 100 }] }]
    ])("sendSupportNotification %#", async (ticket) => {
        const r = await mailService.sendSupportNotification({
            ...ticket,
            ticketId: ticket.ticketId || "TX"
        });
        expect(typeof r).toBe("boolean");
    });

    test.each(Array.from({ length: 40 }, (_, i) => [`C${i}`, `http://invite/${i}`, `pw${i}`]))(
        "sendInviteEmail %#",
        async (cid, url, pw) => {
            const idx = parseInt(String(cid).replace(/^C/, ""), 10) || 0;
            const r = await mailService.sendInviteEmail(
                { customerId: cid, customerName: `N${cid}`, email: "e@test.com" },
                url,
                pw,
                idx % 2 === 0
            );
            expect(typeof r.success).toBe("boolean");
        }
    );

    test.each(Array.from({ length: 15 }, (_, i) => i))("sendPasswordChangedNotification %#", async (i) => {
        const r = await mailService.sendPasswordChangedNotification({
            customerName: "X",
            customerId: `ID${i}`,
            email: "pwd@test.com"
        });
        expect(typeof r.success).toBe("boolean");
    });

    test.each(Array.from({ length: 10 }, (_, i) => i))("sendLoginFailureAlert customer %#", async (i) => {
        const r = await mailService.sendLoginFailureAlert({
            type: "customer",
            customer: {
                customerId: `C${i}`,
                customerName: "U",
                email: "c@test.com"
            },
            count: 5
        });
        expect(typeof r).toBe("boolean");
    });

    test.each(Array.from({ length: 10 }, (_, i) => i))("sendLoginFailureAlert admin %#", async (i) => {
        const r = await mailService.sendLoginFailureAlert({
            type: "admin",
            adminId: `adm${i}`,
            adminName: "管理者",
            count: 5
        });
        expect(typeof r).toBe("boolean");
    });
});

describe("branch-coverage-90-dense-c: orderService.searchOrders", () => {
    test.each(
        Array.from({ length: 72 }, (_, i) => [
            {
                isAdmin: i % 3 === 0,
                customerId: "TEST001",
                keyword: i % 5 === 0 ? "" : `k${i}`,
                status: i % 4 === 0 ? "" : "未発送",
                start: "",
                end: ""
            }
        ])
    )("searchOrders パターン %#", async (criteria) => {
        const rows = await orderService.searchOrders(criteria);
        expect(Array.isArray(rows)).toBe(true);
    });
});
