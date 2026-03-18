jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const { DATA_ROOT } = require("../../dbPaths");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    writeJson
} = require("../helpers/testSandbox");

const fs = require("fs").promises;
const path = require("path");

async function waitForJsonArray(filePath, maxAttempts = 20, delayMs = 50) {
    for (let i = 0; i < maxAttempts; i += 1) {
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch (_err) {
            // ログ追記は非同期のため、一定時間リトライする
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error("log file was not recovered as JSON array in time");
}

describe("Sランク: 監査ログ破損時の耐性", () => {
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

    test("admin-auth.json が破損していてもログイン時に追記再生成できる", async () => {
        const adminLogPath = path.join(DATA_ROOT, "logs", "admin-auth.json");
        await fs.writeFile(adminLogPath, "{broken-json", "utf-8");

        const login = await request(app)
            .post("/api/admin/login")
            .send({ id: "test-admin", pass: "AdminPass123!" });

        expect(login.statusCode).toBe(200);
        expect(login.body.success).toBe(true);

        await new Promise((r) => setTimeout(r, 100));
        const adminLogs = await waitForJsonArray(adminLogPath);
        expect(adminLogs.length).toBeGreaterThan(0);
        expect(adminLogs[adminLogs.length - 1]).toEqual(
            expect.objectContaining({
                action: "login",
                adminId: "test-admin"
            })
        );
    });

    test("customer-auth.json が破損していても失敗ログイン時に追記再生成できる", async () => {
        const customerLogPath = path.join(DATA_ROOT, "logs", "customer-auth.json");
        await fs.writeFile(customerLogPath, "{broken-json", "utf-8");

        const failed = await request(app)
            .post("/api/login")
            .send({ id: "TEST001", pass: "WrongPassword!" });

        expect(failed.statusCode).toBe(200);
        expect(failed.body.success).toBe(false);

        await new Promise((r) => setTimeout(r, 100));
        const customerLogs = await waitForJsonArray(customerLogPath);
        expect(customerLogs.length).toBeGreaterThan(0);
        expect(customerLogs[customerLogs.length - 1]).toEqual(
            expect.objectContaining({
                action: "failed_login",
                customerId: "TEST001"
            })
        );
    });
});
