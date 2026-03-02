const { EventEmitter } = require("events");
const request = require("supertest");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    writeJson
} = require("../helpers/testSandbox");

function createHttpsMock(mode = "error") {
    return {
        request: jest.fn((_options, callback) => {
            const req = new EventEmitter();
            req.setTimeout = (_ms, handler) => {
                if (mode === "timeout" && typeof handler === "function") {
                    handler();
                }
            };
            req.write = () => {};
            req.destroy = () => {
                if (req._onError) req._onError(new Error("timeout"));
            };
            req.on = (name, handler) => {
                if (name === "error") req._onError = handler;
                return req;
            };
            req.end = () => {
                if (mode === "error") {
                    if (req._onError) req._onError(new Error("network error"));
                    return;
                }
                const res = new EventEmitter();
                callback(res);
                if (mode === "invalid-json") {
                    res.emit("data", "not-json");
                    res.emit("end");
                    return;
                }
                res.emit("data", JSON.stringify({ success: false }));
                res.emit("end");
            };
            return req;
        })
    };
}

function loadAppWithHttpsMock(mode = "error") {
    jest.resetModules();
    jest.doMock("../../services/mailService", () => ({
        sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
        sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
        sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
        sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
        sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
    }));
    jest.doMock("https", () => createHttpsMock(mode));
    const { app } = require("../../server");
    return app;
}

describe("Aランク: reCAPTCHA検証API障害時の安全側動作", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        jest.resetModules();
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
    });

    test("siteverify がネットワーク障害でもログイン成功せず captchaRequired=true を返す", async () => {
        const app = loadAppWithHttpsMock("error");
        const adminAgent = request.agent(app);

        const adminLogin = await adminAgent
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });
        expect(adminLogin.statusCode).toBe(200);
        expect(adminLogin.body.success).toBe(true);

        const saveRecaptcha = await adminAgent.put("/api/admin/settings").send({
            recaptcha: {
                siteKey: "site-key-test",
                secretKey: "secret-key-test"
            }
        });
        expect(saveRecaptcha.statusCode).toBe(200);
        expect(saveRecaptcha.body.success).toBe(true);

        await request(app).post("/api/login").send({ id: "TEST001", pass: "WrongPassword!" });
        await request(app).post("/api/login").send({ id: "TEST001", pass: "WrongPassword!" });

        const third = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "WrongPassword!", captchaToken: "dummy-token" });

        expect(third.statusCode).toBe(200);
        expect(third.body.success).toBe(false);
        expect(third.body.captchaRequired).toBe(true);
        expect(third.body.message).toContain("確認に失敗");
    });
});
