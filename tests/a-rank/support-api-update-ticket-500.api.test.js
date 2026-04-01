"use strict";

/**
 * routes/support-api.js POST /admin/update-ticket の try/catch（500）
 */
const request = require("supertest");
const fs = require("fs").promises;
const { app } = require("../../server");
const { backupDbFiles, restoreDbFiles, seedBaseData, writeJson } = require("../helpers/testSandbox");

describe("Aランク: support-api update-ticket エラー経路", () => {
    let backup;
    const origRead = fs.readFile.bind(fs);

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

    test("POST /admin/update-ticket はチケット読込で例外のとき500", async () => {
        await writeJson("support_tickets.json", [
            {
                ticketId: "T-ERR500",
                status: "open",
                customerId: "TEST001",
                attachments: [],
                history: []
            }
        ]);
        jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("support_tickets.json")) {
                throw new Error("simulated read failure");
            }
            return origRead(p, enc);
        });
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.post("/admin/update-ticket").send({
            ticketId: "T-ERR500",
            status: "resolved"
        });
        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("更新");
    });
});
