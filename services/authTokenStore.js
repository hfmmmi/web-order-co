// services/authTokenStore.js
// 認証まわりの JSON ファイル（トークン・管理者一覧の更新）をプロセス内で直列化する
const fs = require("fs").promises;
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");

const INVITE_TOKENS_PATH = dbPath("invite_tokens.json");
const RESET_TOKENS_PATH = dbPath("reset_tokens.json");
const ADMIN_RESET_TOKENS_PATH = dbPath("admin_reset_tokens.json");
const ADMINS_DB_PATH = dbPath("admins.json");

async function readJson(path, fallback) {
    try {
        return JSON.parse(await fs.readFile(path, "utf-8"));
    } catch {
        return fallback;
    }
}

/**
 * @template T
 * @param {string} filePath
 * @param {object|Array} fallbackParsed
 * @param {(data: object|Array) => Promise<T>|T} mutator
 */
async function mutateJsonFile(filePath, fallbackParsed, mutator) {
    return runWithJsonFileWriteLock(filePath, async () => {
        const data = await readJson(filePath, fallbackParsed);
        const out = await mutator(data);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return out;
    });
}

module.exports = {
    INVITE_TOKENS_PATH,
    RESET_TOKENS_PATH,
    ADMIN_RESET_TOKENS_PATH,
    ADMINS_DB_PATH,
    mutateJsonFile
};
