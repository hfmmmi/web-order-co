/**
 * GET /api/settings/public の catch（設定取得失敗時500）
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const settingsService = require("../../services/settingsService");

describe("Aランク: settingsRoutes GET /settings/public エラー", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("getSettings が失敗すると 500", async () => {
        jest.spyOn(settingsService, "getSettings").mockRejectedValueOnce(new Error("db"));
        const res = await request(app).get("/api/settings/public");
        expect(res.statusCode).toBe(500);
        expect(String(res.body.message || "")).toContain("失敗");
    });
});
