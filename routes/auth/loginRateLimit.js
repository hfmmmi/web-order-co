const fs = require("fs").promises;
const { dbPath } = require("../../dbPaths");
const { runWithJsonFileWriteLock } = require("../../utils/jsonWriteQueue");

const LOGIN_RATE_LIMIT_PATH = dbPath("login_rate_limit.json");
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MESSAGE =
    "ログインの試行が多すぎます。15分後に再度お試しください。パスワードをお忘れの場合は「パスワードを忘れた方」から再設定できます。";
const LOGIN_CAPTCHA_REQUIRED_MESSAGE = "確認のため、下の「私はロボットではありません」にチェックを入れて再度送信してください。";
const LOGIN_CAPTCHA_FAILED_MESSAGE = "確認に失敗しました。チェックボックスを再度お試しください。";
const LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES = 2;

async function readLoginRateLimitData() {
    try {
        const data = await fs.readFile(LOGIN_RATE_LIMIT_PATH, "utf-8");
        const parsed = JSON.parse(data);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

async function mutateLoginRateLimit(mutator) {
    return runWithJsonFileWriteLock(LOGIN_RATE_LIMIT_PATH, async () => {
        const data = await readLoginRateLimitData();
        const out = await mutator(data);
        await fs.writeFile(LOGIN_RATE_LIMIT_PATH, JSON.stringify(data, null, 2));
        return out;
    });
}

/** アカウントキー（customer:ID または admin:ID）がロック中か */
async function isLoginLocked(accountKey) {
    if (!accountKey) return false;
    return mutateLoginRateLimit(async (data) => {
        const entry = data[accountKey];
        if (!entry || !entry.lockedUntil) return false;
        if (Date.now() < entry.lockedUntil) return true;
        delete data[accountKey];
        return false;
    });
}

/**
 * ログイン失敗を記録。5回でロックし、ちょうど5回目になったら justHitFive: true
 * @returns {Promise<{ locked: boolean, justHitFive: boolean, lockedUntil?: number }>}
 */
async function recordLoginFailure(accountKey) {
    return mutateLoginRateLimit(async (data) => {
        const now = Date.now();
        const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
        if (!data[accountKey]) data[accountKey] = { attempts: [], lockedUntil: null };
        const entry = data[accountKey];
        entry.attempts = (entry.attempts || []).filter((ts) => ts > windowStart);
        entry.attempts.push(now);
        const count = entry.attempts.length;
        let justHitFive = false;
        if (count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
            entry.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
            if (count === LOGIN_RATE_LIMIT_MAX_ATTEMPTS) justHitFive = true;
        }
        return {
            locked: count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
            justHitFive,
            lockedUntil: entry.lockedUntil || undefined
        };
    });
}

/** ログイン成功時に失敗履歴をクリア */
async function clearLoginFailures(accountKey) {
    if (!accountKey) return;
    await mutateLoginRateLimit(async (data) => {
        if (data[accountKey]) delete data[accountKey];
    });
}

/** 現在の失敗回数（15分窓内）を返す。記録はしない。ファイルは mutate と同じキューで読む（直列化書き込み直後の未反映読み取りを防ぐ）。 */
async function getLoginFailureCount(accountKey) {
    if (!accountKey) return 0;
    return runWithJsonFileWriteLock(LOGIN_RATE_LIMIT_PATH, async () => {
        const data = await readLoginRateLimitData();
        const entry = data[accountKey];
        if (!entry || !Array.isArray(entry.attempts)) return 0;
        const now = Date.now();
        const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
        return entry.attempts.filter((ts) => ts > windowStart).length;
    });
}

module.exports = {
    LOGIN_RATE_LIMIT_WINDOW_MS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_LOCK_DURATION_MS,
    LOGIN_LOCK_MESSAGE,
    LOGIN_CAPTCHA_REQUIRED_MESSAGE,
    LOGIN_CAPTCHA_FAILED_MESSAGE,
    LOGIN_CAPTCHA_REQUIRED_AFTER_FAILURES,
    isLoginLocked,
    recordLoginFailure,
    clearLoginFailures,
    getLoginFailureCount
};
