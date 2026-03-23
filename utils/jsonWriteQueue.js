const path = require("path");

/** @type {Map<string, Promise<unknown>>} */
const tails = new Map();

/**
 * 同一ファイルへの JSON 更新をプロセス内で直列化する（read-modify-write の欠落を防ぐ）。
 * マルチプロセスでは無効 — 参照: REFACTOR_INVENTORY.md の永続化メモ。
 * @param {string} filePath
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function runWithJsonFileWriteLock(filePath, task) {
    const key = path.resolve(filePath);
    const prev = tails.get(key) || Promise.resolve();
    const run = prev.then(() => task());
    tails.set(key, run.catch(() => {}));
    return run;
}

module.exports = { runWithJsonFileWriteLock };
