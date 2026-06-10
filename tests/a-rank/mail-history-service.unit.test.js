"use strict";

const fs = require("fs").promises;
const path = require("path");
const { dbPath, DATA_ROOT } = require("../../dbPaths");
const mailHistoryService = require("../../services/mailHistoryService");
const { backupDbFiles, restoreDbFiles } = require("../helpers/testSandbox");

const MAIL_HISTORY_PATH = dbPath("logs/mail-history.json");

describe("mailHistoryService", () => {
    let backup;

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        try {
            await fs.unlink(MAIL_HISTORY_PATH);
        } catch (e) {
            if (e.code !== "ENOENT") throw e;
        }
    });

    test("resolveActorLabel は各メタキーを優先する", () => {
        expect(mailHistoryService.resolveActorLabel({ sentByAdminName: "管理者A" })).toBe("管理者A");
        expect(mailHistoryService.resolveActorLabel({ sentByAdminId: "admin1" })).toBe("admin1");
        expect(mailHistoryService.resolveActorLabel({ sentByContactName: "担当B" })).toBe("担当B");
        expect(mailHistoryService.resolveActorLabel({ sentByCustomerUserId: "u1" })).toBe("u1");
        expect(mailHistoryService.resolveActorLabel({ sentByCustomerName: "顧客C" })).toBe("顧客C");
        expect(mailHistoryService.resolveActorLabel({ actorLabel: "自動" })).toBe("自動");
        expect(mailHistoryService.resolveActorLabel({})).toBe("システム");
    });

    test("appendMailHistory / getMailHistory は新規ファイルでも動作する", async () => {
        await mailHistoryService.appendMailHistory({
            mailType: "invite",
            subject: "件名テスト",
            to: "a@example.com",
            success: true,
            sentByAdminName: "送信者"
        });

        const page = await mailHistoryService.getMailHistory({ page: 1, limit: 10 });
        expect(page.total).toBe(1);
        expect(page.items[0].subject).toBe("件名テスト");
        expect(page.items[0].actorLabel).toBe("送信者");
        expect(page.items[0].success).toBe(true);
    });

    test("getMailHistory は keyword で絞り込める", async () => {
        await mailHistoryService.appendMailHistory({
            mailType: "order_confirmation",
            subject: "ユニークキーワードABC",
            to: "b@example.com",
            success: true
        });
        await mailHistoryService.appendMailHistory({
            mailType: "invite",
            subject: "別件名",
            to: "c@example.com",
            success: false,
            errorMessage: "smtp error"
        });

        const hit = await mailHistoryService.getMailHistory({ keyword: "ユニークキーワードABC" });
        expect(hit.total).toBe(1);
        expect(hit.items[0].subject).toContain("ユニークキーワードABC");

        const miss = await mailHistoryService.getMailHistory({ keyword: "存在しない語" });
        expect(miss.total).toBe(0);
    });

    test("破損JSONは read 時にエラー、配列以外は空として扱う", async () => {
        await fs.mkdir(path.dirname(MAIL_HISTORY_PATH), { recursive: true });
        await fs.writeFile(MAIL_HISTORY_PATH, "{broken", "utf-8");
        await expect(mailHistoryService.getMailHistory()).rejects.toThrow();

        await fs.writeFile(MAIL_HISTORY_PATH, JSON.stringify({ not: "array" }), "utf-8");
        const empty = await mailHistoryService.getMailHistory();
        expect(empty.total).toBe(0);
    });

    test("MAX_ENTRIES を超えたら古い行を切り捨てる", async () => {
        const originalMax = 5000;
        const many = [];
        for (let i = 0; i < originalMax + 3; i++) {
            many.push({
                id: `MH-old-${i}`,
                at: new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString(),
                mailType: "invite",
                subject: `s${i}`,
                to: `u${i}@example.com`,
                success: true,
                actorLabel: "t"
            });
        }
        await fs.mkdir(path.dirname(MAIL_HISTORY_PATH), { recursive: true });
        await fs.writeFile(MAIL_HISTORY_PATH, JSON.stringify(many), "utf-8");

        await mailHistoryService.appendMailHistory({
            mailType: "invite",
            subject: "newest",
            to: "new@example.com",
            success: true
        });

        const raw = JSON.parse(await fs.readFile(MAIL_HISTORY_PATH, "utf-8"));
        expect(raw.length).toBe(originalMax);
        expect(raw[raw.length - 1].subject).toBe("newest");
    });
});
