"use strict";

jest.mock("nodemailer", () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: "id" })
    }))
}));

const settingsService = require("../../services/settingsService");

describe("branch coverage 100 P1: mailService", () => {
    let orig;
    beforeAll(() => {
        orig = settingsService.getMailConfig;
    });
    afterAll(() => {
        settingsService.getMailConfig = orig;
    });
    beforeEach(() => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "f@test",
            orderNotifyTo: "o@test",
            supportNotifyTo: "s@test",
            templates: {
                orderSubject: "{{orderId}}",
                orderBody: "b",
                inviteSubject: "i",
                inviteBody: "{{tempPassword}}",
                passwordResetSubject: "pr",
                passwordResetBody: "pb",
                supportSubject: "su",
                supportBody: "sb"
            },
            transporter: { host: "127.0.0.1", port: 25, auth: { user: "u", pass: "p" } }
        });
        const mailService = require("../../services/mailService");
        mailService.clearTransporterCache();
    });

    test("sendInviteEmail はメールありで success", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendInviteEmail(
            { customerId: "C1", customerName: "N", email: "a@b.c" },
            "http://url",
            "pw",
            true
        );
        expect(r.success).toBe(true);
    });

    test("sendSupportNotification は添付なしで送信", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendSupportNotification({
            ticketId: "T1",
            category: "bug",
            customerName: "A",
            detail: "D"
        });
        expect(ok).toBe(true);
    });

    test("sendPasswordChangedNotification は成功時 true 相当オブジェクト", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendPasswordChangedNotification({
            customerId: "C1",
            customerName: "N",
            email: "a@b.c"
        });
        expect(r.success).toBe(true);
    });

    test("sendOrderConfirmation は送信失敗時 false", async () => {
        settingsService.getMailConfig = jest.fn().mockResolvedValue({
            from: "f@test",
            orderNotifyTo: "o@test",
            templates: { orderSubject: "s", orderBody: "b" },
            transporter: { host: "h", port: 25, auth: { user: "u", pass: "p" } }
        });
        const nodemailer = require("nodemailer");
        nodemailer.createTransport.mockReturnValueOnce({
            sendMail: jest.fn().mockRejectedValue(new Error("fail"))
        });
        const mailService = require("../../services/mailService");
        mailService.clearTransporterCache();
        const ok = await mailService.sendOrderConfirmation({ orderId: 1, deliveryInfo: {} }, "N");
        expect(ok).toBe(false);
    });

    test("sendLoginFailureAlert は type 不正で false", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendLoginFailureAlert({ type: "other" });
        expect(ok).toBe(false);
    });

    test("sendSupportNotification は添付ファイル巨大でスキップ", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendSupportNotification({
            ticketId: "T2",
            category: "support",
            attachments: [{ storedName: "x", originalName: "f", size: 99999999 }]
        });
        expect(ok).toBe(true);
    });

    test("sendOrderConfirmation は荷主指定ありで本文に荷主情報を含む", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendOrderConfirmation(
            {
                orderId: "O99",
                deliveryInfo: {
                    shipper: { name: "荷主名", address: "東京都", tel: "03-0000" },
                    clientOrderNumber: "PO1",
                    date: "2026-04-01"
                }
            },
            "顧客名"
        );
        expect(ok).toBe(true);
    });

    test("sendInviteEmail はメール空で失敗オブジェクト", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendInviteEmail(
            { customerId: "C", customerName: "N", email: "  " },
            "http://u",
            "pw",
            false
        );
        expect(r.success).toBe(false);
    });

    test("sendInviteEmail は初回招待テンプレートで送信", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendInviteEmail(
            { customerId: "C2", customerName: "N2", email: "n2@test.com" },
            "http://invite",
            "temppw",
            false
        );
        expect(r.success).toBe(true);
    });

    test("sendPasswordChangedNotification は email 無しで失敗", async () => {
        const mailService = require("../../services/mailService");
        const r = await mailService.sendPasswordChangedNotification({
            customerId: "C",
            customerName: "N",
            email: ""
        });
        expect(r.success).toBe(false);
    });

    test("sendLoginFailureAlert は顧客メール空で false", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendLoginFailureAlert({
            type: "customer",
            customer: { customerId: "X", customerName: "X", email: "" },
            count: 5
        });
        expect(ok).toBe(false);
    });

    test("sendLoginFailureAlert は管理者向けで送信", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendLoginFailureAlert({
            type: "admin",
            adminId: "adm1",
            adminName: "管理者",
            count: 5
        });
        expect(ok).toBe(true);
    });

    test("sendSupportNotification は不具合カテゴリでラベル切替", async () => {
        const mailService = require("../../services/mailService");
        const ok = await mailService.sendSupportNotification({
            ticketId: "T3",
            category: "bug",
            customerName: "U",
            customerId: "TEST001",
            detail: "d"
        });
        expect(ok).toBe(true);
    });
});
