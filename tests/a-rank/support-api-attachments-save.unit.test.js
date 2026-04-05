"use strict";

/**
 * routes/support-api.js の normalizeUploadFiles / saveTicketAttachments 分岐
 */
const path = require("path");
const fs = require("fs").promises;
const { saveTicketAttachments, normalizeUploadFiles } = require("../../routes/support-api");
const { DATA_ROOT } = require("../../dbPaths");

describe("support-api 添付ヘルパー分岐", () => {
    const ATTACH_ROOT = path.join(DATA_ROOT, "support_attachments");

    test("normalizeUploadFiles は falsy で空配列", () => {
        expect(normalizeUploadFiles(null)).toEqual([]);
        expect(normalizeUploadFiles(undefined)).toEqual([]);
    });

    test("normalizeUploadFiles は単一オブジェクトを1要素配列にする", () => {
        const f = { name: "a.pdf", size: 1 };
        expect(normalizeUploadFiles(f)).toEqual([f]);
    });

    test("normalizeUploadFiles は配列をそのまま返す", () => {
        const a = { name: "x.png", size: 2 };
        const b = { name: "y.png", size: 3 };
        expect(normalizeUploadFiles([a, b])).toEqual([a, b]);
    });

    test("saveTicketAttachments は空・無効ファイルをスキップ", async () => {
        expect(await saveTicketAttachments("T-UNIT1", null)).toEqual([]);
        expect(await saveTicketAttachments("T-UNIT1", [])).toEqual([]);
    });

    test("saveTicketAttachments は許可拡子子で file.data 経路を通す", async () => {
        const ticketId = "T-UNITDATA";
        const dir = path.join(ATTACH_ROOT, ticketId);
        try {
            const buf = Buffer.from("hello");
            const out = await saveTicketAttachments(ticketId, {
                name: "doc.pdf",
                size: buf.length,
                data: buf
            });
            expect(out.length).toBe(1);
            expect(out[0].storedName).toMatch(/^\d+_\d+_[a-f0-9]{8}\.pdf$/i);
            const disk = await fs.readdir(dir);
            expect(disk.some((n) => n.endsWith(".pdf"))).toBe(true);
        } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    });

    test("saveTicketAttachments は mv 関数があるとき file.mv を使う", async () => {
        const ticketId = "T-UNITMV";
        const dir = path.join(ATTACH_ROOT, ticketId);
        try {
            const buf = Buffer.from("mvpath");
            const mv = jest.fn().mockImplementation(async (dest) => {
                await fs.writeFile(dest, buf);
            });
            const out = await saveTicketAttachments(ticketId, {
                name: "f.txt",
                size: 6,
                mv
            });
            expect(mv).toHaveBeenCalled();
            expect(out.length).toBe(1);
        } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    });

    test("saveTicketAttachments は mv も data も無ければスキップ", async () => {
        const ticketId = "T-UNITSKIP";
        const dir = path.join(ATTACH_ROOT, ticketId);
        try {
            const out = await saveTicketAttachments(ticketId, {
                name: "x.pdf",
                size: 10
            });
            expect(out).toEqual([]);
        } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    });

    test("saveTicketAttachments は非許可拡張子をスキップ", async () => {
        const out = await saveTicketAttachments("T-UNITEXT", {
            name: "bad.exe",
            size: 1,
            data: Buffer.from([1])
        });
        expect(out).toEqual([]);
    });

    test("saveTicketAttachments は超過サイズで FILE_TOO_LARGE", async () => {
        await expect(
            saveTicketAttachments("T-UNITBIG", {
                name: "huge.pdf",
                size: 11 * 1024 * 1024,
                data: Buffer.alloc(100)
            })
        ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    });
});
