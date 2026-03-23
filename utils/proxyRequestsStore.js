const fs = require("fs").promises;
const { dbPath } = require("../dbPaths");
const { runWithJsonFileWriteLock } = require("./jsonWriteQueue");

const PROXY_REQUESTS_PATH = dbPath("proxy_requests.json");
/** 代理ログイン申請の有効期限（ミリ秒） */
const PROXY_REQUEST_EXPIRY_MS = 10 * 60 * 1000;

async function loadProxyRequests() {
    try {
        const data = await fs.readFile(PROXY_REQUESTS_PATH, "utf-8");
        const obj = JSON.parse(data);
        return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch (e) {
        return {};
    }
}

/**
 * proxy_requests.json を read-modify-write 単位で直列化する。
 * @param {(requests: Record<string, unknown>) => void | Promise<unknown>} mutator - オブジェクトを直接変更する
 * @returns {Promise<unknown>}
 */
async function mutateProxyRequests(mutator) {
    return runWithJsonFileWriteLock(PROXY_REQUESTS_PATH, async () => {
        let requests;
        try {
            const data = await fs.readFile(PROXY_REQUESTS_PATH, "utf-8");
            const parsed = JSON.parse(data);
            requests = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            requests = {};
        }
        const result = await mutator(requests);
        await fs.writeFile(PROXY_REQUESTS_PATH, JSON.stringify(requests, null, 2));
        return result;
    });
}

module.exports = {
    loadProxyRequests,
    mutateProxyRequests,
    PROXY_REQUEST_EXPIRY_MS
};
