/**
 * 招待トークン: 24時間有効・1回使用で無効化の境界を検証（F-2）
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
const bcrypt = require("bcryptjs");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");
const { app } = require("../../server");

describe("Aランク: 招待トークン 24h・1回使用境界", () => {
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

    test("招待リンク（key=一時PW）で1回目は成功し、2回目は「IDまたはパスワードが間違っています」", async () => {
        const tempPassword = "invitetmp12";
        const hashedTemp = await bcrypt.hash(tempPassword, 10);
        const customers = await readJson("customers.json");
        const c = customers.find((x) => x.customerId === "TEST001");
        if (c) c.password = hashedTemp;
        await writeJson("customers.json", customers);

        await writeJson("invite_tokens.json", {
            TEST001: Date.now() + 24 * 60 * 60 * 1000
        });

        const first = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: tempPassword, newPass: "NewPass123!" });
        expect(first.statusCode).toBe(200);
        expect(first.body.success).toBe(true);

        const second = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: tempPassword, newPass: "AnotherPass1!" });
        expect(second.statusCode).toBe(200);
        expect(second.body.success).toBe(false);
        expect(second.body.message).toContain("IDまたはパスワードが間違っています");
    });

    test("招待トークン期限切れの場合は「有効期限が切れています」", async () => {
        const tempPassword = "inviteexp12";
        const hashedTemp = await bcrypt.hash(tempPassword, 10);
        const customers = await readJson("customers.json");
        const c = customers.find((x) => x.customerId === "TEST001");
        if (c) c.password = hashedTemp;
        await writeJson("customers.json", customers);

        await writeJson("invite_tokens.json", {
            TEST001: Date.now() - 60 * 60 * 1000
        });

        const res = await request(app)
            .post("/api/setup")
            .send({ id: "TEST001", key: tempPassword, newPass: "NewPass123!" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("有効期限");
        expect(res.body.message).toContain("24時間");
    });
});
