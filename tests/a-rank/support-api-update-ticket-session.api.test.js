/**
 * support-api update-ticket: adminName 無し時の履歴 by フォールバック分岐
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const express = require("express");
const session = require("express-session");
const request = require("supertest");
const fs = require("fs").promises;
const supportRouter = require("../../routes/support-api");
const { dbPath } = require("../../dbPaths");
const { backupDbFiles, restoreDbFiles, seedBaseData } = require("../helpers/testSandbox");

const SUPPORT = dbPath("support_tickets.json");

describe("Aランク: support-api update-ticket セッション分岐", () => {
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

    test("newHistoryLog の by は adminName 無しなら Admin", async () => {
        const app = express();
        app.use(
            session({
                secret: "support-api-update-test",
                resave: false,
                saveUninitialized: true
            })
        );
        app.use(express.json());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use((req, res, next) => {
            req.session.isAdmin = true;
            delete req.session.adminName;
            next();
        });
        app.use("/", supportRouter);

        await fs.writeFile(
            SUPPORT,
            JSON.stringify([{ ticketId: "T-BYADM", customerId: "C1", status: "open", history: [] }], null, 2),
            "utf-8"
        );

        const agent = request.agent(app);
        const res = await agent.post("/admin/update-ticket").send({
            ticketId: "T-BYADM",
            status: "open",
            newHistoryLog: "メモ"
        });
        expect(res.statusCode).toBe(200);
        const tickets = JSON.parse(await fs.readFile(SUPPORT, "utf-8"));
        const t = tickets.find((x) => x.ticketId === "T-BYADM");
        expect(t.history[t.history.length - 1].by).toBe("Admin");
    });

});
