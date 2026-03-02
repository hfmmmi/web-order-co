jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson
} = require("../helpers/testSandbox");

describe("Aランク: 代理ログインと公開設定API", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
        await seedBaseData();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    test("代理ログイン承認フローが正常に完了する", async () => {
        const adminAgent = request.agent(app);
        const customerAgent = request.agent(app);

        const adminLogin = await adminAgent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.body.success).toBe(true);

        const customerLogin = await customerAgent
            .post("/api/login")
            .send({ id: "TEST001", pass: "CustPass123!" });
        expect(customerLogin.body.success).toBe(true);

        const reqRes = await adminAgent
            .post("/api/admin/proxy-request")
            .send({ customerId: "TEST001" });
        expect(reqRes.statusCode).toBe(200);
        expect(reqRes.body.success).toBe(true);

        const pending = await customerAgent.get("/api/account/proxy-request");
        expect(pending.statusCode).toBe(200);
        expect(pending.body.pending).toBe(true);

        const approve = await customerAgent.post("/api/account/proxy-request/approve").send({});
        expect(approve.statusCode).toBe(200);
        expect(approve.body.success).toBe(true);

        const status = await adminAgent.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(status.statusCode).toBe(200);
        expect(status.body.status).toBe("approved");

        const proxyLogin = await adminAgent.post("/api/admin/proxy-login").send({ customerId: "TEST001" });
        expect(proxyLogin.statusCode).toBe(200);
        expect(proxyLogin.body.success).toBe(true);

        const session = await adminAgent.get("/api/session");
        expect(session.statusCode).toBe(200);
        expect(session.body.loggedIn).toBe(true);
        expect(session.body.customerId).toBe("TEST001");
        expect(session.body.proxyByAdmin).toBeTruthy();

        const proxyLogout = await adminAgent.post("/api/admin/proxy-logout").send({});
        expect(proxyLogout.statusCode).toBe(200);
        expect(proxyLogout.body.success).toBe(true);
    });

    test("代理ログイン却下フローで状態が消える", async () => {
        const adminAgent = request.agent(app);
        const customerAgent = request.agent(app);

        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        await adminAgent.post("/api/admin/proxy-request").send({ customerId: "TEST001" });
        const reject = await customerAgent.post("/api/account/proxy-request/reject").send({});
        expect(reject.statusCode).toBe(200);
        expect(reject.body.success).toBe(true);

        const status = await adminAgent.get("/api/admin/proxy-request-status?customerId=TEST001");
        expect(status.statusCode).toBe(200);
        expect(status.body.status).toBe("none");
    });

    test("settings/publicはfeaturesとcategory別announcementsを正しく返す", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const now = Date.now();
        const payload = {
            features: {
                orders: true,
                support: false,
                announcements: true
            },
            announcements: [
                {
                    id: "ann-order",
                    title: "受注遅延",
                    body: "配送遅延あり",
                    type: "warning",
                    target: "customer",
                    category: "order",
                    enabled: true,
                    startDate: new Date(now - 60_000).toISOString(),
                    endDate: new Date(now + 3_600_000).toISOString(),
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "ann-general",
                    title: "一般お知らせ",
                    body: "メンテナンス予告",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: new Date(now - 60_000).toISOString(),
                    endDate: new Date(now + 3_600_000).toISOString(),
                    linkUrl: "",
                    linkText: ""
                }
            ]
        };

        const save = await adminAgent.put("/api/admin/settings").send(payload);
        expect(save.statusCode).toBe(200);
        expect(save.body.success).toBe(true);

        const pub = await request(app).get("/api/settings/public");
        expect(pub.statusCode).toBe(200);
        expect(pub.body.features.support).toBe(false);
        expect(Array.isArray(pub.body.orderBanners)).toBe(true);
        expect(pub.body.orderBanners).toHaveLength(1);
        expect(pub.body.orderBanners[0].id).toBe("ann-order");
        expect(Array.isArray(pub.body.announcements)).toBe(true);
        expect(pub.body.announcements).toHaveLength(2);

        const settings = await readJson("settings.json");
        expect(settings.announcements).toHaveLength(2);
    });
});
