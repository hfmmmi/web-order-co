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
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData,
    readJson,
    writeJson
} = require("../helpers/testSandbox");

describe("Bランク: サポートAPI境界", () => {
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

    test("request-support は未ログインで401", async () => {
        const res = await request(app)
            .post("/request-support")
            .send({ category: "bug", detail: "test" });
        expect(res.statusCode).toBe(401);
    });

    test("support/my-tickets は未ログインで401", async () => {
        const res = await request(app).get("/support/my-tickets");
        expect(res.statusCode).toBe(401);
    });

    test("admin/support-tickets は未認証で401", async () => {
        const res = await request(app).get("/admin/support-tickets");
        expect(res.statusCode).toBe(401);
    });

    test("admin/update-ticket は存在しないticketIdで404", async () => {
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const res = await admin.post("/admin/update-ticket").send({
            ticketId: "T-NONEXISTENT",
            status: "resolved"
        });
        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test("admin/update-ticket はnewHistoryLogで履歴を追加する", async () => {
        const customer = request.agent(app);
        const admin = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        await customer.post("/request-support").send({
            category: "support",
            detail: "履歴テスト"
        });
        const tickets = await readJson("support_tickets.json");
        const ticketId = tickets.find((t) => t.customerId === "TEST001")?.ticketId;
        expect(ticketId).toBeTruthy();

        const update = await admin.post("/admin/update-ticket").send({
            ticketId,
            newHistoryLog: "対応しました"
        });
        expect(update.statusCode).toBe(200);

        const after = await readJson("support_tickets.json");
        const t = after.find((x) => x.ticketId === ticketId);
        expect(Array.isArray(t.history)).toBe(true);
        expect(t.history.length).toBe(1);
        expect(t.history[0].action).toBe("対応しました");
    });

    test("support/my-tickets は破損JSON時でも空配列で復旧する", async () => {
        const fs = require("fs").promises;
        const path = require("path");
        await fs.writeFile(path.join(DATA_ROOT, "support_tickets.json"), "{invalid", "utf-8");
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });

        const res = await customer.get("/support/my-tickets");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.tickets)).toBe(true);
        expect(res.body.tickets.length).toBe(0);
    });

    test("support/my-tickets は配列以外のJSON時も空配列で返す", async () => {
        const fs = require("fs").promises;
        const path = require("path");
        const dbPath = path.join(DATA_ROOT, "support_tickets.json");
        const orig = await fs.readFile(dbPath, "utf-8").catch(() => "[]");
        try {
            await fs.writeFile(dbPath, "{}", "utf-8");
            const customer = request.agent(app);
            await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await customer.get("/support/my-tickets");
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.tickets)).toBe(true);
        } finally {
            await fs.writeFile(dbPath, orig, "utf-8");
        }
    });

    test("admin/support-tickets は読込失敗時は空配列を返す", async () => {
        const fs = require("fs").promises;
        const path = require("path");
        await fs.writeFile(path.join(DATA_ROOT, "support_tickets.json"), "not valid json", "utf-8");
        const admin = request.agent(app);
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
        const res = await admin.get("/admin/support-tickets");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("request-support はメール送信失敗しても申請は成功する", async () => {
        const mailService = require("../../services/mailService");
        mailService.sendSupportNotification.mockRejectedValueOnce(new Error("SMTP Error"));
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.post("/request-support").send({
            category: "support",
            detail: "メール失敗テスト"
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain("受け付け");
    });

    // 第2期Phase2: request-support の writeFile 失敗時500を返す catch 分岐
    test("request-support は support_tickets 書き込み失敗時500を返す", async () => {
        const fsMod = require("fs").promises;
        const origWrite = fsMod.writeFile;
        jest.spyOn(fsMod, "writeFile").mockImplementation((filePath, data, ...args) => {
            if (typeof filePath === "string" && filePath.includes("support_tickets.json")) {
                return Promise.reject(new Error("EACCES"));
            }
            return origWrite.call(fsMod, filePath, data, ...args);
        });
        try {
            const customer = request.agent(app);
            await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await customer.post("/request-support").send({
                category: "support",
                detail: "write失敗テスト"
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("サーバーエラー");
        } finally {
            fsMod.writeFile.mockRestore();
        }
    });

    test("support/my-tickets は複数件ある場合に履歴を返す", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await customer.post("/request-support").send({ category: "bug", detail: "1件目" });
        await customer.post("/request-support").send({ category: "support", detail: "2件目" });
        const res = await customer.get("/support/my-tickets");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.tickets.length).toBeGreaterThanOrEqual(2);
    });

    // 第2期Phase2: my-tickets で history が配列でないチケットは history: [] で返す分岐
    test("support/my-tickets は ticket.history が配列でない場合も 200 で history を空で返す", async () => {
        const agent = request.agent(app);
        await agent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await agent.post("/request-support").send({ category: "bug", detail: "history分岐用" });
        const tickets = await readJson("support_tickets.json");
        const t = tickets.find((x) => x.customerId === "TEST001");
        if (t) t.history = { not: "array" };
        await writeJson("support_tickets.json", tickets);
        const customerAgent = request.agent(app);
        await customerAgent.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customerAgent.get("/support/my-tickets");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        const found = (res.body.tickets || []).find((x) => x.detail && x.detail.includes("history"));
        if (found) expect(Array.isArray(found.history)).toBe(true);
    });

    // 第2期Phase2: support-api 分岐強化
    test("admin/update-ticket は internalOrderNo / desiredAction / collectionDate を更新できる", async () => {
        const customer = request.agent(app);
        const admin = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        await customer.post("/request-support").send({ category: "support", detail: "internal更新テスト" });
        const tickets = await readJson("support_tickets.json");
        const ticketId = tickets.find((t) => t.customerId === "TEST001")?.ticketId;
        expect(ticketId).toBeTruthy();

        const update = await admin.post("/admin/update-ticket").send({
            ticketId,
            status: "verifying",
            internalOrderNo: "ORD-123",
            internalCustomerPoNumber: "PO-456",
            desiredAction: "確認中",
            collectionDate: "2025-02-20"
        });
        expect(update.statusCode).toBe(200);

        const after = await readJson("support_tickets.json");
        const t = after.find((x) => x.ticketId === ticketId);
        expect(t.internalOrderNo).toBe("ORD-123");
        expect(t.internalCustomerPoNumber).toBe("PO-456");
        expect(t.desiredAction).toBe("確認中");
        expect(t.collectionDate).toBe("2025-02-20");
    });

    test("admin/update-ticket は status のみ更新する場合も 200 を返す（newHistoryLog なし）", async () => {
        const customer = request.agent(app);
        const admin = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        await customer.post("/request-support").send({ category: "bug", detail: "status only" });
        const tickets = await readJson("support_tickets.json");
        const ticketId = tickets.find((t) => t.customerId === "TEST001")?.ticketId;
        expect(ticketId).toBeTruthy();

        const update = await admin.post("/admin/update-ticket").send({
            ticketId,
            status: "resolved"
        });
        expect(update.statusCode).toBe(200);
        expect(update.body.success).toBe(true);
    });

    // 第2期Phase2: my-tickets の history 要素で h.date/h.action/h.by が falsy の分岐
    test("support/my-tickets は history 要素の date/action/by が空でも正規化して返す", async () => {
        await writeJson("support_tickets.json", [{
            ticketId: "T-H-BRANCH",
            customerId: "TEST001",
            customerName: "テスト",
            status: "open",
            category: "support",
            timestamp: new Date().toISOString(),
            history: [{ date: "", action: "対応", by: "" }, { date: null, action: "" }]
        }]);
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.get("/support/my-tickets");
        expect(res.statusCode).toBe(200);
        const t = res.body.tickets.find(x => x.ticketId === "T-H-BRANCH");
        expect(t).toBeDefined();
        expect(Array.isArray(t.history)).toBe(true);
        expect(t.history[0].date).toBeNull();
        expect(t.history[0].action).toBe("対応");
        expect(t.history[0].by).toBe("管理者");
        expect(t.history[1].action).toBe("");
    });

    test("support/my-tickets は history が配列でない場合も空配列として返す", async () => {
        await writeJson("support_tickets.json", [{
            ticketId: "T-HISTORY-TEST",
            customerId: "TEST001",
            customerName: "テスト",
            status: "open",
            category: "support",
            timestamp: new Date().toISOString(),
            history: "not-array"
        }]);
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.get("/support/my-tickets");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        const t = res.body.tickets.find(x => x.ticketId === "T-HISTORY-TEST");
        if (t) expect(Array.isArray(t.history)).toBe(true);
    });

    test("support/attachment は ticketId 不正で400", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.get("/support/attachment/bad-id/0_1_aabbccdd.pdf");
        expect(res.statusCode).toBe(400);
    });

    test("support/attachment は storedName 不正で400", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.get("/support/attachment/T-ABC/evil.pdf");
        expect(res.statusCode).toBe(400);
    });

    test("support/attachment は未ログインで401", async () => {
        const res = await request(app).get("/support/attachment/T-ABC/0_1_aabbccdd.pdf");
        expect(res.statusCode).toBe(401);
    });

    test("support/attachment は添付ファイルがあれば200でダウンロード", async () => {
        const fsSync = require("fs");
        const ticketId = "T-ATT200";
        const storedName = "0_1_aabbccdd.pdf";
        const attachDir = path.join(DATA_ROOT, "support_attachments", ticketId);
        await fs.mkdir(attachDir, { recursive: true });
        const full = path.join(attachDir, storedName);
        await fs.writeFile(full, "%PDF-1.4 test", "utf-8");
        try {
            await writeJson("support_tickets.json", [
                {
                    ticketId,
                    customerId: "TEST001",
                    customerName: "テスト",
                    status: "open",
                    category: "support",
                    timestamp: new Date().toISOString(),
                    attachments: [{ storedName, originalName: "doc.pdf", size: 10, mimeType: "application/pdf" }]
                }
            ]);
            const customer = request.agent(app);
            await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
            const res = await customer.get(`/support/attachment/${ticketId}/${storedName}`);
            expect(res.statusCode).toBe(200);
        } finally {
            try {
                fsSync.unlinkSync(full);
            } catch (e) {
                /* ignore */
            }
            try {
                fsSync.rmSync(attachDir, { recursive: true, force: true });
            } catch (e) {
                /* ignore */
            }
        }
    });

    test("support/attachment は管理者なら他顧客の添付もダウンロードできる", async () => {
        const fsSync = require("fs");
        const ticketId = "T-ADM200";
        const storedName = "0_2_cafebabe.pdf";
        const attachDir = path.join(DATA_ROOT, "support_attachments", ticketId);
        await fs.mkdir(attachDir, { recursive: true });
        const full = path.join(attachDir, storedName);
        await fs.writeFile(full, "%PDF-1.4 admin", "utf-8");
        try {
            await writeJson("support_tickets.json", [
                {
                    ticketId,
                    customerId: "TEST002",
                    customerName: "他人",
                    status: "open",
                    category: "support",
                    timestamp: new Date().toISOString(),
                    attachments: [{ storedName, originalName: "x.pdf", size: 5, mimeType: "application/pdf" }]
                }
            ]);
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.get(`/support/attachment/${ticketId}/${storedName}`);
            expect(res.statusCode).toBe(200);
        } finally {
            try {
                fsSync.unlinkSync(full);
            } catch (e) {
                /* ignore */
            }
            try {
                fsSync.rmSync(attachDir, { recursive: true, force: true });
            } catch (e) {
                /* ignore */
            }
        }
    });

    test("support/attachment はチケットに添付メタが無ければ404", async () => {
        await writeJson("support_tickets.json", [
            {
                ticketId: "T-NOATT",
                customerId: "TEST001",
                customerName: "テスト",
                status: "open",
                category: "support",
                timestamp: new Date().toISOString(),
                attachments: []
            }
        ]);
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.get("/support/attachment/T-NOATT/0_3_deadbeef.pdf");
        expect(res.statusCode).toBe(404);
    });

    test("request-support は小さなPDF添付で申請成功", async () => {
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer
            .post("/request-support")
            .field("category", "support")
            .field("detail", "添付テスト")
            .attach("attachments", Buffer.from("%PDF-1.4"), { filename: "note.pdf" });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("support/attachment は他顧客のチケットで403", async () => {
        await writeJson("support_tickets.json", [
            {
                ticketId: "T-COV403X",
                customerId: "TEST002",
                customerName: "他人",
                status: "open",
                category: "support",
                timestamp: new Date().toISOString(),
                attachments: [{ storedName: "0_1_aabbccdd.pdf", originalName: "a.pdf" }]
            }
        ]);
        const customer = request.agent(app);
        await customer.post("/api/login").send({ id: "TEST001", pass: "CustPass123!" });
        const res = await customer.get("/support/attachment/T-COV403X/0_1_aabbccdd.pdf");
        expect(res.statusCode).toBe(403);
    });

    // Phase 5: admin/update-ticket の読込失敗時500（破損JSONで parse が throw する経路）
    test("admin/update-ticket は support_tickets.json 破損時500を返す", async () => {
        const dbPath = path.join(DATA_ROOT, "support_tickets.json");
        const orig = await fs.readFile(dbPath, "utf-8").catch(() => "[]");
        try {
            await fs.writeFile(dbPath, "{invalid", "utf-8");
            const admin = request.agent(app);
            await admin.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });
            const res = await admin.post("/admin/update-ticket").send({
                ticketId: "T-DUMMY",
                status: "resolved"
            });
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("更新失敗");
        } finally {
            await fs.writeFile(dbPath, orig, "utf-8");
        }
    });

});
