"use strict";

const { requestPasswordReset, safeMessage } = require("../../services/passwordResetRequestService");

describe("branch coverage 100 P1: passwordResetRequestService", () => {
    test("requestPasswordReset は rawId が文字列でなければ safeMessage", async () => {
        const r = await requestPasswordReset({
            rawId: null,
            clientIp: "127.0.0.1",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
    });

    test("requestPasswordReset は空 trimId で safeMessage", async () => {
        const r = await requestPasswordReset({
            rawId: "   ",
            clientIp: "127.0.0.1",
            protocol: "http",
            host: "localhost"
        });
        expect(r.message).toBe(safeMessage);
    });

    test("requestPasswordReset は存在しない ID でも success と同一メッセージ", async () => {
        const r = await requestPasswordReset({
            rawId: "__NO_SUCH_USER_99999",
            clientIp: "127.0.0.1",
            protocol: "http",
            host: "localhost"
        });
        expect(r.success).toBe(true);
        expect(r.message).toBe(safeMessage);
    });

    test("safeMessage は文字列", () => {
        expect(typeof safeMessage).toBe("string");
        expect(safeMessage.length).toBeGreaterThan(10);
    });
});
