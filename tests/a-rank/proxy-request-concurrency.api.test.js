jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const bcrypt = require("bcryptjs");
const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Aランク: 代理ログイン申請の競合ケース", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("proxy_requests.json", {});
    });

    test("同一顧客への多重申請は最新申請で上書きされる", async () => {
        const admins = await readJson("admins.json");
        const hash = await bcrypt.hash("Admin2Pass123!", 10);
        admins.push({
            adminId: "test-admin-2",
            password: hash,
            name: "第二管理者"
        });
        await writeJson("admins.json", admins);

        const admin1 = request.agent(app);
        const admin2 = request.agent(app);

        await admin1.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const login2 = await admin2.post("/api/admin/login").send({ id: "test-admin-2", pass: "Admin2Pass123!" });
        expect(login2.statusCode).toBe(200);

        const r1 = await admin1.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        expect(r1.statusCode).toBe(200);
        expect(r1.body.success).toBe(true);

        const first = await readJson("proxy_requests.json");
        const firstRequestedAt = first.TEST001.requestedAt;
        expect(first.TEST001.adminName).toBe("テスト管理者");

        const r2 = await admin2.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        expect(r2.statusCode).toBe(200);
        expect(r2.body.success).toBe(true);

        const second = await readJson("proxy_requests.json");
        expect(second.TEST001.adminName).toBe("第二管理者");
        expect(second.TEST001.requestedAt).toBeGreaterThanOrEqual(firstRequestedAt);
        expect(second.TEST001.approved).toBe(false);
    });

    test("承認済み申請へ再申請すると pending に戻る", async () => {
        const admin = request.agent(app);
        const customer = request.agent(app);

        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        const approve = await customer.post("/api/account/proxy-request/approve").send({});
        expect(approve.statusCode).toBe(200);
        expect(approve.body.success).toBe(true);

        const approvedStatus = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(approvedStatus.statusCode).toBe(200);
        expect(approvedStatus.body.status).toBe("approved");

        const reRequest = await admin.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        expect(reRequest.statusCode).toBe(200);
        expect(reRequest.body.success).toBe(true);

        const pendingStatus = await admin.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(pendingStatus.statusCode).toBe(200);
        expect(pendingStatus.body.status).toBe("pending");
    });
});
