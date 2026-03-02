/**
 * 管理者表示名サニタイズ（sanitizeAdminName）の検証（F-6 XSS対策）
 * ログイン時・proxy-request 返却時に危険文字が除去されることを確認
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

describe("Aランク: 管理者表示名サニタイズ", () => {
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

    test("proxy-request 返却時の adminName がサニタイズされている（ログイン時も session に反映）", async () => {
        const admins = await readJson("admins.json");
        const admin = admins.find((a) => a.adminId === "test-admin");
        if (admin) admin.name = 'Proxy<script>"\'&';
        await writeJson("admins.json", admins);

        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });

        const customerAgent = request.agent(app);
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const proxy = await customerAgent.get("/api/account/proxy-request");
        expect(proxy.statusCode).toBe(200);
        expect(proxy.body.pending).toBe(true);
        const name = proxy.body.adminName;
        expect(name).toBeDefined();
        expect(String(name)).not.toMatch(/[<>"'&]/);
    });
});
