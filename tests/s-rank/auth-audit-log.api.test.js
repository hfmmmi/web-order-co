jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const fs = require("fs").promises;
const path = require("path");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    writeJson
} = require("../helpers/testSandbox");

function isIsoString(value) {
    if (typeof value !== "string") return false;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    return d.toISOString() === value;
}

function expectValidIpOrNull(value) {
    expect(value === null || typeof value === "string").toBe(true);
}

function expectChronologicalActions(entries, expectedActions) {
    const actionIndexes = expectedActions.map((action) => entries.findIndex(r => r.action === action));
    actionIndexes.forEach((idx) => expect(idx).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < actionIndexes.length; i += 1) {
        expect(actionIndexes[i]).toBeGreaterThan(actionIndexes[i - 1]);
    }
}

async function waitFor(predicate, { retries = 10, delayMs = 40 } = {}) {
    let lastValue;
    for (let i = 0; i < retries; i += 1) {
        lastValue = await predicate();
        if (lastValue) return lastValue;
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return lastValue;
}

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function readLogJson(relPath) {
    const absPath = path.join(__dirname, "..", "..", relPath);
    try {
        const raw = await fs.readFile(absPath, "utf-8");
        if (!raw.trim()) return null;
        return JSON.parse(raw);
    } catch (_error) {
        return null;
    }
}

describe("Sランク: 認証監査ログ", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        await writeJson("login_rate_limit.json", {});
        await writeJson("logs/customer-auth.json", []);
        await writeJson("logs/admin-auth.json", []);
    });

    test("customer-auth.json は failed_login -> login -> logout の順序と必須項目を満たす", async () => {
        const agent = request.agent(app);

        await request(app).post("/api/login").send({ id: "TEST001", pass: "WrongPassword!" });
        await sleep(80);

        const okLogin = await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        expect(okLogin.statusCode).toBe(200);
        expect(okLogin.body.success).toBe(true);
        await sleep(80);

        const logout = await agent.post("/api/logout").send({});
        expect(logout.statusCode).toBe(200);
        expect(logout.body.success).toBe(true);
        await sleep(80);

        const entries = await waitFor(async () => {
            const rows = await readLogJson("logs/customer-auth.json");
            if (!Array.isArray(rows)) return null;
            const actions = rows.map(r => r.action);
            const hasAll = ["failed_login", "login", "logout"].every(action => actions.includes(action));
            return hasAll ? rows : null;
        });

        expect(Array.isArray(entries)).toBe(true);
        const chain = entries.filter(r => r.customerId === "TEST001" && ["failed_login", "login", "logout"].includes(r.action));
        expectChronologicalActions(chain, ["failed_login", "login", "logout"]);
        const failed = chain.find(r => r.action === "failed_login");
        const login = chain.find(r => r.action === "login");
        const logoutRow = chain.find(r => r.action === "logout");

        expect(failed).toBeTruthy();
        expect(login).toBeTruthy();
        expect(logoutRow).toBeTruthy();

        [failed, login, logoutRow].forEach((row) => {
            expect(isIsoString(row.at)).toBe(true);
            expectValidIpOrNull(row.ip);
            expect(row.customerId).toBe("TEST001");
        });
    });

    test("admin-auth.json は failed_login -> login -> logout の順序と欠損混在ログ耐性を満たす", async () => {
        await fs.writeFile(
            path.join(__dirname, "..", "..", "logs/admin-auth.json"),
            JSON.stringify([{ action: "legacy", at: null }], null, 2),
            "utf-8"
        );

        const agent = request.agent(app);

        await request(app).post("/api/admin/login").send({ id: "test-admin", pass: "WrongPassword!" });
        await sleep(80);

        const okLogin = await agent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        expect(okLogin.statusCode).toBe(200);
        expect(okLogin.body.success).toBe(true);
        await sleep(80);

        const logout = await agent.post("/api/admin/logout").send({});
        expect(logout.statusCode).toBe(200);
        expect(logout.body.success).toBe(true);
        await sleep(80);

        const entries = await waitFor(async () => {
            const rows = await readLogJson("logs/admin-auth.json");
            if (!Array.isArray(rows)) return null;
            const actions = rows.map(r => r.action);
            const hasAll = ["failed_login", "login", "logout"].every(action => actions.includes(action));
            return hasAll ? rows : null;
        });

        expect(Array.isArray(entries)).toBe(true);
        const chain = entries.filter(r => (r.adminId === "test-admin" || r.action === "logout") && ["failed_login", "login", "logout"].includes(r.action));
        expectChronologicalActions(chain, ["failed_login", "login", "logout"]);
        const failed = chain.find(r => r.action === "failed_login");
        const login = chain.find(r => r.action === "login");
        const logoutRow = chain.find(r => r.action === "logout");

        expect(failed).toBeTruthy();
        expect(login).toBeTruthy();
        expect(logoutRow).toBeTruthy();

        [failed, login, logoutRow].forEach((row) => {
            expect(isIsoString(row.at)).toBe(true);
            expectValidIpOrNull(row.ip);
        });
        expect(failed.adminId).toBe("test-admin");
        expect(login.adminId).toBe("test-admin");
        expect(logoutRow.adminId === undefined || logoutRow.adminId === null).toBe(true);
        expect(typeof logoutRow.adminName).toBe("string");
    });
});
