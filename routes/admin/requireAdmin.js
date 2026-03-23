"use strict";

function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) {
        return res.status(401).json({ message: "管理者権限が必要です" });
    }
    next();
}

module.exports = { requireAdmin };
