/**
 * adminSessionRoutes: saveSession 失敗分岐（jest.resetModules で server を再読込）
 */
"use strict";

const request = require("supertest");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: 管理者ログイン saveSession 失敗（分岐80%・隔離モック）", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
    });

    test("POST /api/admin/login はセッション保存失敗時に success false", async () => {
        jest.resetModules();
        jest.doMock("../../utils/sessionAsync", () => ({
            regenerateSession: jest.fn().mockResolvedValue(),
            saveSession: jest.fn().mockRejectedValue(new Error("session save failed"))
        }));
        jest.doMock("../../services/mailService", () => ({
            sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
            sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
            sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
            sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
            sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
        }));
        const { app } = require("../../server");
        const res = await request(app).post("/api/admin/login").send({
            id: "test-admin",
            pass: "AdminPass123!"
        });
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("セッション");
    });
});
