"use strict";

/** セッションからメール送信履歴用の担当者情報を組み立てる */
function mailLogMetaFromSession(session = {}) {
    const meta = {};
    if (session.isAdmin && session.adminId) {
        meta.sentByAdminId = session.adminId;
        meta.sentByAdminName = session.adminName || session.adminId;
    }
    if (session.customerUserId) {
        meta.sentByCustomerUserId = session.customerUserId;
        meta.sentByContactName = session.contactName || session.customerUserId;
    } else if (session.customerId && !session.isAdmin) {
        meta.sentByCustomerName = session.customerName || session.customerId;
    }
    return meta;
}

module.exports = { mailLogMetaFromSession };
