/**
 * パスワード再設定トークン: 24h・1回使用の境界を検証（F-3）
 * npm run test:api / test:all で実行
 */
jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Aランク: 再設定トークン 1回使用・期限切れ境界", () => {
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

    test("再設定トークンで1回目は成功し、2回目は「IDまたはパスワードが間違っています」", async () => {
        const token = "reset-token-one-time-use-24chars";
        await writeJson("reset_tokens.json", {
            TEST001: {
                token,
                expiresAt: Date.now() + 24 * 60 * 60 * 1000
            }
        });

        const first = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: token, newPass: "NewPass123!" });
        expect(first.statusCode).toBe(200);
        expect(first.body.success).toBe(true);

        const second = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: token, newPass: "AnotherPass1!" });
        expect(second.statusCode).toBe(200);
        expect(second.body.success).toBe(false);
        expect(second.body.message).toContain("IDまたはパスワードが間違っています");
    });

    test("再設定トークン期限切れの場合は「有効期限（24時間）が切れています」", async () => {
        const token = "reset-token-expired-24charsx";
        await writeJson("reset_tokens.json", {
            TEST001: {
                token,
                expiresAt: Date.now() - 60 * 60 * 1000
            }
        });

        const res = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: token, newPass: "NewPass123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("有効期限");
        expect(res.body.message).toContain("24時間");
    });
});
