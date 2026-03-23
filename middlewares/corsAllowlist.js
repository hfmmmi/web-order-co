"use strict";

/**
 * ALLOWED_ORIGINS が空なら no-op。指定時のみ CORS を許可リストで有効化。
 * @param {string[]} allowedOrigins
 * @returns {import("express").RequestHandler}
 */
function createCorsAllowlistMiddleware(allowedOrigins) {
    if (!allowedOrigins || allowedOrigins.length === 0) {
        return (_req, _res, next) => next();
    }
    return (req, res, next) => {
        const origin = req.headers.origin;
        if (!origin) {
            return next();
        }
        if (allowedOrigins.includes(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
            if (req.method === "OPTIONS") {
                return res.status(204).end();
            }
            return next();
        }
        return res.status(403).json({ success: false, message: "CORS origin is not allowed" });
    };
}

module.exports = { createCorsAllowlistMiddleware };
