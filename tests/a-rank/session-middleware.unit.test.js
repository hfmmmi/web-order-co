"use strict";

const os = require("os");
const path = require("path");

describe("sessionMiddleware 環境分岐", () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origSecret = process.env.SESSION_SECRET;
    const origPersist = process.env.PERSIST_SESSION;
    const origSessionPath = process.env.SESSION_PATH;

    afterEach(() => {
        process.env.NODE_ENV = origNodeEnv;
        if (origSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = origSecret;
        if (origPersist === undefined) delete process.env.PERSIST_SESSION;
        else process.env.PERSIST_SESSION = origPersist;
        if (origSessionPath === undefined) delete process.env.SESSION_PATH;
        else process.env.SESSION_PATH = origSessionPath;
        jest.restoreAllMocks();
        jest.resetModules();
    });

    test("本番でデフォルト SESSION_SECRET のとき console.warn", () => {
        process.env.NODE_ENV = "production";
        delete process.env.SESSION_SECRET;
        jest.resetModules();
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        const { createSessionMiddleware } = require("../../middlewares/sessionMiddleware");
        createSessionMiddleware();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("SESSION_SECRET"));
        warn.mockRestore();
    });

    test("Windows 開発・PERSIST_SESSION=1 でファイルストアログとミドルウェア生成", () => {
        const origPlatform = process.platform;
        Object.defineProperty(process, "platform", { value: "win32", configurable: true });
        process.env.NODE_ENV = "development";
        process.env.PERSIST_SESSION = "1";
        process.env.SESSION_PATH = path.join(os.tmpdir(), `jest-sess-${Date.now()}`);
        jest.resetModules();
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        try {
            const { createSessionMiddleware } = require("../../middlewares/sessionMiddleware");
            const mw = createSessionMiddleware();
            expect(typeof mw).toBe("function");
            expect(log).toHaveBeenCalledWith(expect.stringContaining("PERSIST_SESSION"));
        } finally {
            log.mockRestore();
            Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
        }
    });

    test("本番で SESSION_PATH が cwd/sessions のとき永続化警告", () => {
        process.env.NODE_ENV = "production";
        process.env.SESSION_SECRET = "not-default-secret-for-test";
        delete process.env.SESSION_PATH;
        const cwdSpy = jest.spyOn(process, "cwd").mockReturnValue("C:\\fakeapp");
        jest.resetModules();
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        const { createSessionMiddleware } = require("../../middlewares/sessionMiddleware");
        createSessionMiddleware();
        const sessionPathWarn = warn.mock.calls.find(
            (c) => typeof c[0] === "string" && c[0].includes("SESSION_PATH")
        );
        expect(sessionPathWarn).toBeDefined();
        cwdSpy.mockRestore();
        warn.mockRestore();
    });
});
