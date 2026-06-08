"use strict";

const DEFAULT_IDLE_MS = 120 * 60 * 1000;
const SESSION_EXPIRED_LOGIN_URL = "/index.html?sessionExpired=1";
const SESSION_EXPIRED_JSON = {
    success: false,
    message: "再ログインが必要です。",
    code: "SESSION_EXPIRED"
};

/**
 * @param {import("express").Request} req
 * @param {string} name
 * @returns {string|undefined}
 */
function getRequestHeader(req, name) {
    if (req && typeof req.get === "function") {
        return req.get(name);
    }
    const headers = (req && req.headers) || {};
    const lower = name.toLowerCase();
    return headers[name] || headers[lower];
}

/**
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function isApiRequest(req) {
    const path = req.path || "";
    if (path.startsWith("/api")) return true;
    if (req.xhr) return true;
    if (String(getRequestHeader(req, "X-Requested-With") || "").toLowerCase() === "xmlhttprequest") return true;
    const accept = String(getRequestHeader(req, "Accept") || "");
    if (accept.includes("application/json") && !accept.includes("text/html")) return true;
    return false;
}

/**
 * ブラウザのページ遷移（HTML）かどうか。静的アセット（.css 等）は false。
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function isBrowserPageNavigation(req) {
    const method = req.method || "GET";
    if (method !== "GET" && method !== "HEAD") return false;
    if (isApiRequest(req)) return false;
    const path = req.path || "";
    if (path === "/" || path.endsWith(".html")) return true;
    return false;
}

/**
 * セッション失効後の応答（API は JSON、ページ表示はログイン画面へ誘導）。
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
function respondSessionExpired(req, res) {
    if (isBrowserPageNavigation(req)) {
        res.redirect(302, SESSION_EXPIRED_LOGIN_URL);
        return;
    }
    res.status(401).json(SESSION_EXPIRED_JSON);
}

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
                return req.session.destroy((err) => {
                    if (err) {
                        console.error("Session destroy error:", err);
                    }
                    if (isBrowserPageNavigation(req) || isApiRequest(req)) {
                        respondSessionExpired(req, res);
                        return;
                    }
                    next();
                });
            }

            req.session.lastActivity = now;
        }
        next();
    };
}

module.exports = {
    createSlidingSessionTimeoutMiddleware,
    isApiRequest,
    isBrowserPageNavigation,
    respondSessionExpired,
    SESSION_EXPIRED_LOGIN_URL,
    SESSION_EXPIRED_JSON
};
