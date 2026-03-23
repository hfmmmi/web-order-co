"use strict";

/**
 * helmet があれば CSP 付きで適用。無ければ何もしない。
 * @param {import("express").Express} app
 */
function applyHelmetIfAvailable(app) {
    try {
        const helmet = require("helmet");
        app.use(helmet({
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    "default-src": ["'self'"],
                    "script-src": ["'self'", "'unsafe-inline'", "https://www.google.com", "https://www.gstatic.com"],
                    "script-src-attr": ["'unsafe-inline'"],
                    "style-src": ["'self'", "'unsafe-inline'"],
                    "frame-src": ["'self'", "https://www.google.com", "https://www.recaptcha.net"],
                    "img-src": ["'self'", "data:"],
                    "connect-src": ["'self'"],
                    "font-src": ["'self'"],
                    "base-uri": ["'self'"],
                    "form-action": ["'self'"]
                }
            }
        }));
    } catch (e) {
        // helmet 未インストール時はスキップ
    }
}

module.exports = { applyHelmetIfAvailable };
