/**
 * routes/support-api.js … 添付サイズ上限・拡張子スキップ・添付DLの DB 異常系
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const path = require("path");
const fs = require("fs").promises;
const { app } = require("../../server");
const { DATA_ROOT } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

describe("Aランク: support-api 添付・DL 分岐", () => {
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

    test("POST /request-support は 10MB 超の添付で400（FILE_TOO_LARGE）", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
        const res = await customer
            .post("/request-support")
            .field("category", "bug")
            .field("detail", "大きいファイルテスト")
            .attach("attachments", oversized, "large.pdf");
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(String(res.body.message || "")).toContain("大きすぎ");
    });

    test("POST /request-support は非許可拡張子をスキップし申請は成功", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer
            .post("/request-support")
            .field("category", "support")
            .field("detail", "exe は無視される")
            .attach("attachments", Buffer.from("MZ"), "malware.exe");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("GET /support/attachment は support_tickets が配列でないと404", async () => {
        const p = path.join(DATA_ROOT, "support_tickets.json");
        const orig = await fs.readFile(p, "utf-8");
        try {
            await fs.writeFile(p, JSON.stringify({ notArray: true }), "utf-8");
            const customer = request.agent(app);
            await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await customer.get("/support/attachment/T-ABC12345/0_1234567890_abcd1234.pdf");
            expect(res.statusCode).toBe(404);
        } finally {
            await fs.writeFile(p, orig, "utf-8");
        }
    });

    test("POST /request-support は support_tickets 書込失敗で500", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const orig = fs.writeFile.bind(fs);
        const spy = jest.spyOn(fs, "writeFile").mockImplementation(async (target, ...args) => {
            if (String(target).replace(/\\/g, "/").includes("support_tickets.json")) {
                throw new Error("disk full");
            }
            return orig(target, ...args);
        });
        try {
            const res = await customer
                .post("/request-support")
                .field("category", "support")
                .field("detail", "書込エラー")
                .attach("attachments", Buffer.from("%PDF"), "a.pdf");
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
        } finally {
            spy.mockRestore();
        }
    });

    test("GET /support/attachment は support_tickets.json が破損なら500", async () => {
        const p = path.join(DATA_ROOT, "support_tickets.json");
        const orig = await fs.readFile(p, "utf-8");
        try {
            await fs.writeFile(p, "{broken-json", "utf-8");
            const customer = request.agent(app);
            await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await customer.get("/support/attachment/T-ABC12345/0_1234567890_abcd1234.pdf");
            expect(res.statusCode).toBe(500);
            expect(String(res.text || "")).toContain("サーバー");
        } finally {
            await fs.writeFile(p, orig, "utf-8");
        }
    });
});
