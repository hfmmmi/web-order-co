"use strict";

/**
 * 管理画面「ランク価格 Excel 取込」multipart から Buffer を解決する（分岐テスト可能に分離）
 * @param {import("express").Request} req
 * @returns {{ ok: true, fileBuffer: Buffer } | { ok: false }}
 */
function getRankPriceImportBuffer(req) {
    const uploaded = req.files && (req.files.rankExcelFile || req.files.file);
    if (!uploaded) {
        return { ok: false };
    }
    const file = uploaded.data ? uploaded : (req.files.rankExcelFile || req.files.file);
    const fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
    return { ok: true, fileBuffer };
}

module.exports = { getRankPriceImportBuffer };
