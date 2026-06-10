"use strict";

/** セッションから監査表示用の担当者名を取得 */
function getActorNameFromSession(session = {}) {
    if (session.isAdmin) {
        const name = session.adminName || session.adminId || "管理者";
        return String(name).trim() || "管理者";
    }
    if (session.contactName) {
        return String(session.contactName).trim();
    }
    if (session.customerName) {
        return String(session.customerName).trim();
    }
    if (session.customerId) {
        return String(session.customerId).trim();
    }
    return "—";
}

function applyAuditOnCreate(target, actorName) {
    const now = new Date().toISOString();
    const name = actorName && String(actorName).trim() ? String(actorName).trim() : "—";
    target.createdBy = name;
    target.createdAt = now;
    target.updatedBy = name;
    target.updatedAt = now;
}

function applyAuditOnUpdate(target, actorName) {
    const now = new Date().toISOString();
    const name = actorName && String(actorName).trim() ? String(actorName).trim() : "—";
    if (!target.createdBy) target.createdBy = name;
    if (!target.createdAt) target.createdAt = now;
    target.updatedBy = name;
    target.updatedAt = now;
}

function pickAuditFields(record) {
    if (!record || typeof record !== "object") {
        return { createdBy: "", createdAt: "", updatedBy: "", updatedAt: "" };
    }
    return {
        createdBy: record.createdBy || "",
        createdAt: record.createdAt || "",
        updatedBy: record.updatedBy || "",
        updatedAt: record.updatedAt || ""
    };
}

module.exports = {
    getActorNameFromSession,
    applyAuditOnCreate,
    applyAuditOnUpdate,
    pickAuditFields
};
