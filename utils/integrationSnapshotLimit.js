"use strict";

/**
 * 連携スナップショット API の limit 上限。
 * JSON 台帳の現実的な件数内では打ち切られない（従来の 2000 / 5000 上限を撤廃）。
 */
const INTEGRATION_SNAPSHOT_MAX_LIMIT = Number.MAX_SAFE_INTEGER;

module.exports = { INTEGRATION_SNAPSHOT_MAX_LIMIT };
