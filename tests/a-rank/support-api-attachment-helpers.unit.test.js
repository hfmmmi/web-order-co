"use strict";

/**
 * routes/support-api.js の normalizeUploadFiles / saveTicketAttachments（router に生やしたテスト用プロパティ）
 */
const path = require("path");
const fs = require("fs").promises;
const supportRouter = require("../../routes/support-api");
const { DATA_ROOT } = require("../../dbPaths");

describe("support-api 添付ヘルパー分岐", () => {
    test("normalizeUploadFiles は falsy で空・単一を配列化・配列はそのまま", () => {
        expect(supportRouter.normalizeUploadFiles(null)).toEqual([]);
        expect(supportRouter.normalizeUploadFiles(undefined)).toEqual([]);
        const one = { name: "x.pdf", size: 1 };
        expect(supportRouter.normalizeUploadFiles(one)).toEqual([one]);
        const two = [one, { name: "y.pdf", size: 2 }];
        expect(supportRouter.normalizeUploadFiles(two)).toEqual(two);
    });

    test("saveTicketAttachments は空・無名・size0 を除外して空配列", async () => {
        const r = await supportRouter.saveTicketAttachments("T-JEST-EMPTY", [
            null,
            { name: "", size: 10 },
            { name: "a.pdf", size: 0 }
        ]);
        expect(r).toEqual([]);
    });

    test("saveTicketAttachments は file.data で書き込み（mv なし）", async () => {
        const tid = "T-JEST-DATA";
        const dir = path.join(DATA_ROOT, "support_attachments", tid);
        await fs.rm(dir, { recursive: true, force: true });
        const r = await supportRouter.saveTicketAttachments(tid, {
            name: "doc.pdf",
            size: 4,
            mimetype: "application/pdf",
            data: Buffer.from("%PDF")
        });
        expect(r.length).toBe(1);
        expect(r[0].storedName).toMatch(/\.pdf$/i);
        await fs.rm(dir, { recursive: true, force: true });
    });

    test("saveTicketAttachments は mv があるとき mv を優先", async () => {
        const tid = "T-JEST-MV";
        const dir = path.join(DATA_ROOT, "support_attachments", tid);
        await fs.rm(dir, { recursive: true, force: true });
        let mvDest;
        const r = await supportRouter.saveTicketAttachments(tid, {
            name: "note.txt",
            size: 3,
            mimetype: "text/plain",
            mv: async (dest) => {
                mvDest = dest;
                await fs.writeFile(dest, "abc", "utf-8");
            }
        });
        expect(r.length).toBe(1);
        expect(mvDest).toBeTruthy();
        await fs.rm(dir, { recursive: true, force: true });
    });

    test("saveTicketAttachments は mv も data も無いファイルをスキップ", async () => {
        const r = await supportRouter.saveTicketAttachments("T-JEST-NODATA", {
            name: "orphan.pdf",
            size: 100,
            mimetype: "application/pdf"
        });
        expect(r).toEqual([]);
    });
});
