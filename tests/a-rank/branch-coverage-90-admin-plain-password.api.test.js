"use strict";

/**
 * adminSessionRoutes: 平文パスワード検知→ハッシュ化、invite-reset 分岐
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson, readJson } = require("../helpers/testSandbox");

describe("branch coverage 90: 管理者平文パスワード・招待リセット", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        jest.restoreAllMocks();
    });

    test("平文パスワードの管理者でログインするとハッシュ化される", async () => {
        await writeJson("admins.json", [
            {
                adminId: "plain-admin",
                password: "PlainSecret99!",
                name: "平文管理者"
            }
        ]);
        const agent = request.agent(app);
        const res = await agent.post("/api/admin/login").send({
            id: "plain-admin",
            pass: "PlainSecret99!"
        });
        expect(res.body.success).toBe(true);
        const admins = await readJson("admins.json");
        const adm = admins.find((a) => a.adminId === "plain-admin");
        expect(adm.password.startsWith("$2")).toBe(true);
    });

    test("POST /api/admin/invite-reset は customerId なしで失敗メッセージ", async () => {
        const agent = request.agent(app);
        await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await agent.post("/api/admin/invite-reset").send({});
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toMatch(/顧客ID/);
    });
});
