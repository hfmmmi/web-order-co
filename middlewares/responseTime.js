"use strict";

/**
 * X-Response-Time ヘッダと任意の遅延ログ。
 * @returns {import("express").RequestHandler}
 */
function createResponseTimeMiddleware() {
    const PERF_LOG_ENABLED = String(process.env.ENABLE_PERF_LOG || "").trim().toLowerCase() === "true";
    const PERF_LOG_THRESHOLD_MS = Number(process.env.PERF_LOG_THRESHOLD_MS) || 1000;

    return (req, res, next) => {
        const start = Date.now();
        const origEnd = res.end;
        res.end = function (...args) {
            const ms = Date.now() - start;
            if (!res.headersSent) {
                res.setHeader("X-Response-Time", `${ms}ms`);
            }
            if (PERF_LOG_ENABLED && ms >= PERF_LOG_THRESHOLD_MS) {
                console.log(`[PERF] ${req.method} ${req.originalUrl || req.url} ${ms}ms`);
            }
            return origEnd.apply(this, args);
        };
        next();
    };
}

module.exports = { createResponseTimeMiddleware };
