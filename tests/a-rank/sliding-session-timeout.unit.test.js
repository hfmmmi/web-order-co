"use strict";

const { createSlidingSessionTimeoutMiddleware } = require("../../middlewares/slidingSessionTimeout");

describe("slidingSessionTimeout 分岐", () => {
    test("lastActivity が idleMs 超過で session.destroy と 401", () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 1000 });
        const req = {
            path: "/api/session",
            session: {
                customerId: "C1",
                lastActivity: Date.now() - 2000,
                destroy: jest.fn((cb) => cb())
            }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            redirect: jest.fn()
        };
        const next = jest.fn();
        mw(req, res, next);
        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test("セッションなしは next のみ", () => {
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 1 });
        const next = jest.fn();
        mw({}, {}, next);
        expect(next).toHaveBeenCalled();
    });

    test("期限内は lastActivity 更新して next", () => {
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 60000 });
        const now = Date.now();
        const req = { session: { customerId: "C", lastActivity: now } };
        const next = jest.fn();
        mw(req, {}, next);
        expect(req.session.lastActivity).toBeGreaterThanOrEqual(now);
        expect(next).toHaveBeenCalled();
    });

    test("セッションはあるが顧客IDも管理者フラグも無い場合は next のみ", () => {
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 60000 });
        const req = { session: { lastActivity: Date.now() - 1000 } };
        const next = jest.fn();
        mw(req, {}, next);
        expect(next).toHaveBeenCalled();
    });

    test("管理者セッションで期限内は lastActivity を更新して next", () => {
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 60000 });
        const now = Date.now();
        const req = { session: { isAdmin: true, adminName: "管理者", lastActivity: now } };
        const next = jest.fn();
        mw(req, {}, next);
        expect(req.session.lastActivity).toBeGreaterThanOrEqual(now);
        expect(next).toHaveBeenCalled();
    });

    test("管理者セッションでアイドル超過なら destroy と 401", () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 500 });
        const req = {
            path: "/api/admin/settings",
            session: {
                isAdmin: true,
                adminName: "ADM",
                lastActivity: Date.now() - 2000,
                destroy: jest.fn((cb) => cb())
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), redirect: jest.fn() };
        const next = jest.fn();
        mw(req, res, next);
        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test("lastActivity 未設定の顧客セッションは現在時刻基準で期限内扱い", () => {
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 60000 });
        const req = { session: { customerId: "C2" } };
        const next = jest.fn();
        mw(req, {}, next);
        expect(typeof req.session.lastActivity).toBe("number");
        expect(next).toHaveBeenCalled();
    });

    test("opts 省略時もミドルウェアが動作する", () => {
        const mw = createSlidingSessionTimeoutMiddleware();
        const next = jest.fn();
        mw({ path: "/api/session", session: { customerId: "x", lastActivity: Date.now() } }, {}, next);
        expect(next).toHaveBeenCalled();
    });

    test("期限切れのページ表示はログイン画面へリダイレクト", () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 500 });
        const req = {
            method: "GET",
            path: "/",
            session: {
                customerId: "C1",
                lastActivity: Date.now() - 2000,
                destroy: jest.fn((cb) => cb())
            }
        };
        const res = { redirect: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        mw(req, res, next);
        expect(res.redirect).toHaveBeenCalledWith(302, "/index.html?sessionExpired=1");
        expect(next).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test("期限切れ後の静的アセット要求はセッション破棄後に next", () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 500 });
        const req = {
            method: "GET",
            path: "/style.css",
            session: {
                customerId: "C1",
                lastActivity: Date.now() - 2000,
                destroy: jest.fn((cb) => cb())
            }
        };
        const res = { redirect: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        mw(req, res, next);
        expect(req.session.destroy).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        log.mockRestore();
    });
});
