"use strict";

const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../../dbPaths");
const { appendAdminAuthLog, appendCustomerAuthLog } = require("../../services/authAuditLogService");

const ADMIN_LOG = dbPath("logs/admin-auth.json");
const CUST_LOG = dbPath("logs/customer-auth.json");

describe("authAuditLogService 分岐", () => {
    const origRead = fs.readFile.bind(fs);
    const origWrite = fs.writeFile.bind(fs);
    const origMkdir = fs.mkdir.bind(fs);

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("appendAdminAuthLog は既存配列に追記する", async () => {
        await fs.mkdir(path.dirname(ADMIN_LOG), { recursive: true });
        await fs.writeFile(ADMIN_LOG, JSON.stringify([{ at: "past", action: "x" }], null, 2), "utf-8");
        await appendAdminAuthLog({ action: "login", adminId: "a1" });
        const list = JSON.parse(await fs.readFile(ADMIN_LOG, "utf-8"));
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBe(2);
        expect(list[1].action).toBe("login");
    });

    test("appendAdminAuthLog はログが配列でないJSONなら空配列から再構築する", async () => {
        await fs.mkdir(path.dirname(ADMIN_LOG), { recursive: true });
        await fs.writeFile(ADMIN_LOG, JSON.stringify({ not: "array" }, null, 2), "utf-8");
        await appendAdminAuthLog({ action: "probe", adminId: "a2" });
        const list = JSON.parse(await fs.readFile(ADMIN_LOG, "utf-8"));
        expect(list).toEqual([expect.objectContaining({ action: "probe" })]);
    });

    test("appendAdminAuthLog は読込がENOENT以外で失敗しても追記を試みる", async () => {
        let adminReadCount = 0;
        jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("logs/admin-auth.json")) {
                adminReadCount += 1;
                if (adminReadCount === 1) {
                    const e = new Error("perm");
                    e.code = "EACCES";
                    throw e;
                }
            }
            return origRead(p, enc);
        });
        jest.spyOn(fs, "mkdir").mockImplementation(origMkdir);
        jest.spyOn(fs, "writeFile").mockImplementation(origWrite);
        await appendAdminAuthLog({ action: "after_read_fail", adminId: "a3" });
        const list = JSON.parse(await fs.readFile(ADMIN_LOG, "utf-8"));
        expect(list.some((x) => x.action === "after_read_fail")).toBe(true);
    });

    test("appendAdminAuthLog は書込失敗を握りつぶす", async () => {
        jest.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));
        await expect(appendAdminAuthLog({ action: "noop" })).resolves.toBeUndefined();
    });

    test("appendCustomerAuthLog は既存配列に追記する", async () => {
        await fs.mkdir(path.dirname(CUST_LOG), { recursive: true });
        await fs.writeFile(CUST_LOG, JSON.stringify([], null, 2), "utf-8");
        await appendCustomerAuthLog({ action: "login_ok", customerId: "C1" });
        const list = JSON.parse(await fs.readFile(CUST_LOG, "utf-8"));
        expect(list.length).toBe(1);
        expect(list[0].customerId).toBe("C1");
    });

    test("appendCustomerAuthLog は読込がENOENT以外で失敗しても追記を試みる", async () => {
        let custReadCount = 0;
        jest.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
            if (String(p).replace(/\\/g, "/").includes("logs/customer-auth.json")) {
                custReadCount += 1;
                if (custReadCount === 1) {
                    const e = new Error("io");
                    e.code = "EIO";
                    throw e;
                }
            }
            return origRead(p, enc);
        });
        jest.spyOn(fs, "writeFile").mockImplementation(origWrite);
        jest.spyOn(fs, "mkdir").mockImplementation(origMkdir);
        await appendCustomerAuthLog({ action: "cust_after_fail", customerId: "C2" });
        const list = JSON.parse(await fs.readFile(CUST_LOG, "utf-8"));
        expect(list.some((x) => x.action === "cust_after_fail")).toBe(true);
    });
});
