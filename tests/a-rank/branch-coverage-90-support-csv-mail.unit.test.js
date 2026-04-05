"use strict";

/**
 * support-api 添付DL・csvService の境界
 */
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const request = require("supertest");
const { app } = require("../../server");
const { dbPath, DATA_ROOT } = require("../../dbPaths");
const csvService = require("../../services/csvService");

const SUPPORT_DB_PATH = dbPath("support_tickets.json");
const ATTACH_DIR = path.join(DATA_ROOT, "support_attachments");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("branch coverage 90: support attachment download", () => {
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

    test("GET /support/attachment は顧客本人の添付を返す", async () => {
        const ticketId = "T-" + Date.now().toString(36).toUpperCase();
        const ext = ".txt";
        const suffix = crypto.randomBytes(4).toString("hex");
        const storedName = `0_${Date.now()}_${suffix}${ext}`;
        const dir = path.join(ATTACH_DIR, ticketId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, storedName), Buffer.from("hello"), "utf-8");
        const tickets = [
            {
                ticketId,
                customerId: "TEST001",
                attachments: [{ storedName, originalName: "a.txt", size: 5, mimeType: "text/plain" }]
            }
        ];
        const prev = await fs.readFile(SUPPORT_DB_PATH, "utf-8").catch(() => "[]");
        await fs.writeFile(SUPPORT_DB_PATH, JSON.stringify(tickets, null, 2), "utf-8");
        try {
            const agent = request.agent(app);
            await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await agent.get(`/support/attachment/${ticketId}/${storedName}`);
            expect(res.statusCode).toBe(200);
        } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
            await fs.writeFile(SUPPORT_DB_PATH, prev, "utf-8");
        }
    });
});

describe("branch coverage 90: csvService", () => {
    test("parseExternalOrdersCsv: 空バッファは行不足で []", () => {
        expect(csvService.parseExternalOrdersCsv(Buffer.alloc(0))).toEqual([]);
    });

    test("parseExternalOrdersCsv: UTF-8 BOM でデコードフォールバック", () => {
        const body = "受注番号,得意先コード\n1,C1\n";
        const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf-8")]);
        const r = csvService.parseExternalOrdersCsv(buf);
        expect(Array.isArray(r)).toBe(true);
    });
});
