"use strict";

const path = require("path");
const session = require("express-session");
const FileStore = require("session-file-store")(session);

/**
 * express-session ミドルウェアを生成（ファイル or メモリストア・環境に応じた警告ログ付き）。
 * @returns {import("express").RequestHandler}
 */
function createSessionMiddleware() {
    const isProduction = process.env.NODE_ENV === "production";
    const isTest = process.env.NODE_ENV === "test";
    const isWindowsDev = process.platform === "win32" && !isProduction && !isTest;

    const sessionSecret = process.env.SESSION_SECRET || "mySecretKey12345";
    if (isProduction && sessionSecret === "mySecretKey12345") {
        console.warn("⚠️ 本番環境では SESSION_SECRET を環境変数で設定してください");
    }

    const sessionOptions = {
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        name: "weborder.sid",
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax"
        }
    };

    const useMemorySession = isTest
        || (isWindowsDev && (process.env.PERSIST_SESSION !== "1" && process.env.PERSIST_SESSION !== "true"));

    if (!useMemorySession) {
        const sessionPath = process.env.SESSION_PATH || path.join(process.cwd(), "sessions");
        sessionOptions.store = new FileStore({
            path: sessionPath,
            logFn: function () {},
            retries: 50,
            factor: 1,
            minTimeout: 100,
            maxTimeout: 1000,
            reapInterval: 60 * 60
        });
        if (isProduction && sessionPath === path.join(process.cwd(), "sessions")) {
            console.warn("⚠️ 本番: 再起動後もログインを維持するには SESSION_PATH をアプリ外の永続ディレクトリに設定してください（例: SESSION_PATH=/var/lib/weborder/sessions）");
        }
        if (isWindowsDev) {
            console.log("📁 PERSIST_SESSION 有効: セッションをファイル保存しています（再起動後もログイン維持）。");
        }
    } else if (isWindowsDev && !isTest) {
        console.log("📁 Windows 開発: メモリセッションを使用（ページ遷移は速い。再起動でログアウト）。永続化は PERSIST_SESSION=1 で有効にできます。");
    }

    return session(sessionOptions);
}

module.exports = { createSessionMiddleware };
