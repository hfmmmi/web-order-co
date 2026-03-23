"use strict";

const DEFAULT_IDLE_MS = 120 * 60 * 1000;

/**
 * 無操作一定時間でセッション破棄（スライディング更新）。
 * @param {{ idleMs?: number }} [opts]
 * @returns {import("express").RequestHandler}
 */
function createSlidingSessionTimeoutMiddleware(opts) {
    const idleMs = (opts && opts.idleMs) || DEFAULT_IDLE_MS;
    return (req, res, next) => {
        if (req.session && (req.session.customerId || req.session.isAdmin)) {
            const now = Date.now();
            const lastActivity = req.session.lastActivity || now;

            if (now - lastActivity > idleMs) {
                console.log(`⏳ Session Expired: User ${req.session.customerId || req.session.adminName}`);
                return req.session.destroy(() => {
                    res.status(401).json({ success: false, message: "再ログインが必要です。", code: "SESSION_EXPIRED" });
                });
            }

            req.session.lastActivity = now;
        }
        next();
    };
}

module.exports = { createSlidingSessionTimeoutMiddleware };
