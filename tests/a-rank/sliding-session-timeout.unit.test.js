"use strict";

const { createSlidingSessionTimeoutMiddleware } = require("../../middlewares/slidingSessionTimeout");

describe("slidingSessionTimeout 分岐", () => {
    test("lastActivity が idleMs 超過で session.destroy と 401", () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const mw = createSlidingSessionTimeoutMiddleware({ idleMs: 1000 });
        const req = {
            session: {
                customerId: "C1",
                lastActivity: Date.now() - 2000,
                destroy: jest.fn((cb) => cb())
            }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
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
});
