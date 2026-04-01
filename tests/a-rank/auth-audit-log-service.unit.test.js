"use strict";

const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../../dbPaths");

describe("Aランク: authAuditLogService 分岐", () => {
    afterEach(async () => {
        jest.restoreAllMocks();
        await fs.mkdir(path.dirname(dbPath("logs/admin-auth.json")), { recursive: true });
        await fs.writeFile(dbPath("logs/admin-auth.json"), "[]", "utf8");
        await fs.writeFile(dbPath("logs/customer-auth.json"), "[]", "utf8");
    });

    test("appendAdminAuthLog はログが破損 JSON でも追記できる", async () => {
        await fs.mkdir(path.dirname(dbPath("logs/admin-auth.json")), { recursive: true });
        await fs.writeFile(dbPath("logs/admin-auth.json"), "{broken-json", "utf8");
        const { appendAdminAuthLog } = require("../../services/authAuditLogService");
        await appendAdminAuthLog({ event: "audit-test", ip: "127.0.0.1" });
        const list = JSON.parse(await fs.readFile(dbPath("logs/admin-auth.json"), "utf8"));
        expect(Array.isArray(list)).toBe(true);
        expect(list.some((e) => e.event === "audit-test")).toBe(true);
    });

    test("appendCustomerAuthLog はログが破損 JSON でも追記できる", async () => {
        await fs.mkdir(path.dirname(dbPath("logs/customer-auth.json")), { recursive: true });
        await fs.writeFile(dbPath("logs/customer-auth.json"), "not-json", "utf8");
        const { appendCustomerAuthLog } = require("../../services/authAuditLogService");
        await appendCustomerAuthLog({ event: "cust-audit", ip: "::1" });
        const list = JSON.parse(await fs.readFile(dbPath("logs/customer-auth.json"), "utf8"));
        expect(Array.isArray(list)).toBe(true);
        expect(list.some((e) => e.event === "cust-audit")).toBe(true);
    });

    test("appendAdminAuthLog は ENOENT 以外の読込エラーで console.error（admin）", async () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.spyOn(fs, "readFile").mockImplementationOnce(async () => {
            const e = new Error("read denied");
            e.code = "EACCES";
            throw e;
        });
        const { appendAdminAuthLog } = require("../../services/authAuditLogService");
        await appendAdminAuthLog({ event: "e1", ip: "1.1.1.1" });
        expect(errSpy).toHaveBeenCalledWith("[admin-auth-log] read error:", "read denied");
        errSpy.mockRestore();
    });

    test("appendCustomerAuthLog は ENOENT 以外の読込エラーで console.error", async () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.spyOn(fs, "readFile").mockImplementationOnce(async () => {
            const e = new Error("boom");
            e.code = "EACCES";
            throw e;
        });
        const { appendCustomerAuthLog } = require("../../services/authAuditLogService");
        await appendCustomerAuthLog({ event: "e2", ip: "2.2.2.2" });
        expect(errSpy).toHaveBeenCalledWith("[customer-auth-log] read error:", "boom");
        errSpy.mockRestore();
    });

    test("appendAdminAuthLog は書込失敗で console.error", async () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));
        const { appendAdminAuthLog } = require("../../services/authAuditLogService");
        await appendAdminAuthLog({ event: "wfail", ip: "127.0.0.1" });
        expect(errSpy).toHaveBeenCalledWith("[admin-auth-log] write error:", "disk full");
        errSpy.mockRestore();
    });

    test("appendCustomerAuthLog は書込失敗で console.error", async () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        jest.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("no space"));
        const { appendCustomerAuthLog } = require("../../services/authAuditLogService");
        await appendCustomerAuthLog({ event: "cwfail", ip: "127.0.0.1" });
        expect(errSpy).toHaveBeenCalledWith("[customer-auth-log] write error:", "no space");
        errSpy.mockRestore();
    });
});
