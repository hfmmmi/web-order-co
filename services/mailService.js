// services/mailService.js
// 【役割】メール通知に関する全責任を負う専門部隊
// 設定は settingsService から取得。パスワードは環境変数 MAIL_PASSWORD
const path = require("path");
const fs = require("fs").promises;
const nodemailer = require("nodemailer");
const settingsService = require("./settingsService");
const mailHistoryService = require("./mailHistoryService");
const { DATA_ROOT } = require("../dbPaths");

let _transporter = null;

/** 設定変更後に呼ぶと、次回送信で新しい設定が使われます（サーバー再起動不要） */
function clearTransporterCache() {
    _transporter = null;
}

async function getTransporter() {
    if (_transporter) return _transporter;
    const config = await settingsService.getMailConfig();
    _transporter = nodemailer.createTransport(config.transporter);
    return _transporter;
}

async function recordMailHistory(entry) {
    try {
        await mailHistoryService.appendMailHistory(entry);
    } catch (err) {
        console.error("[Mail History] record failed:", err.message);
    }
}

/**
 * 注文確定メールを送信する
 * @param {Object} order - 注文データオブジェクト
 * @param {String} customerName - 顧客名
 * @param {Object} logMeta - 送信履歴用（担当者情報など）
 */
async function sendOrderConfirmation(order, customerName, logMeta = {}) {
    try {
        const config = await settingsService.getMailConfig();
        const deliveryInfo = order.deliveryInfo || {};

        // 荷主情報のテキスト生成
        let shipperInfoText = "";
        if (deliveryInfo.shipper && deliveryInfo.shipper.name) {
            shipperInfoText = `
            --------------------------------
            【荷主指定あり】
            依頼主: ${deliveryInfo.shipper.name}
            住所: ${deliveryInfo.shipper.address || ""}
            TEL: ${deliveryInfo.shipper.tel || ""}
            --------------------------------`;
        }

        const t = config.templates;
        const body = settingsService.applyTemplate(t.orderBody, {
            customerName,
            orderId: order.orderId,
            date: new Date().toLocaleString("ja-JP"),
            clientOrderNumber: deliveryInfo.clientOrderNumber || "なし",
            deliveryDate: deliveryInfo.date || "指定なし",
            shipperInfo: shipperInfoText.trim()
        });

        const subject = settingsService.applyTemplate(t.orderSubject, {
            orderId: order.orderId
        });

        const transporter = await getTransporter();
        const mailOptions = {
            from: config.from,
            to: config.orderNotifyTo,
            subject,
            text: body
        };

        await transporter.sendMail(mailOptions);
        console.log(`[Mail] Sent confirmation for OrderID: ${order.orderId}`);
        await recordMailHistory({
            mailType: "order_confirmation",
            subject,
            to: config.orderNotifyTo,
            from: config.from,
            success: true,
            ...logMeta
        });
        return true;
    } catch (error) {
        console.error("[Mail Error] 送信失敗:", error);
        await recordMailHistory({
            mailType: "order_confirmation",
            subject: order && order.orderId ? `注文 ${order.orderId}` : "",
            to: "",
            success: false,
            errorMessage: error.message,
            ...logMeta
        });
        return false;
    }
}

/** サポートチケットの category を通知メール用の日本語ラベルに変換（旧 support/bug を含む） */
function supportCategoryMailLabel(category) {
    switch (String(category || "")) {
        case "product":
            return "商品について";
        case "system":
            return "システムについて";
        case "other":
            return "その他";
        case "bug":
            return "システムについて";
        case "support":
            return "通常のお問い合わせ";
        default:
            return "その他";
    }
}

/**
 * サポート申請受付メールを管理者に送信する
 * @param {Object} ticketData - チケットデータ
 * @param {Object} logMeta - 送信履歴用
 * @returns {Promise<boolean>}
 */
async function sendSupportNotification(ticketData, logMeta = {}) {
    try {
        const config = await settingsService.getMailConfig();
        const categoryLabel = supportCategoryMailLabel(ticketData.category);

        const att = Array.isArray(ticketData.attachments) ? ticketData.attachments : [];
        const attachmentsList = att.length
            ? att.map((a) => (a && a.originalName) || (a && a.storedName) || "file").join(", ")
            : "なし";

        const nodemailerAttachments = [];
        const mailFileMax = 5 * 1024 * 1024;
        const baseDir = path.join(DATA_ROOT, "support_attachments", ticketData.ticketId || "");
        for (const a of att.slice(0, 3)) {
            if (!a || !a.storedName) continue;
            if ((a.size || 0) > mailFileMax) continue;
            const p = path.join(baseDir, a.storedName);
            try {
                await fs.stat(p);
                nodemailerAttachments.push({
                    filename: String(a.originalName || "attachment").replace(/[\r\n]/g, "").slice(0, 180),
                    path: p
                });
            } catch (_) {
                /* ファイルが無い場合は本文のみ */
            }
        }

        const body = settingsService.applyTemplate(config.templates.supportBody, {
            ticketId: ticketData.ticketId,
            categoryLabel,
            customerName: ticketData.customerName || "",
            customerId: ticketData.customerId || "",
            date: new Date().toLocaleString("ja-JP"),
            orderId: ticketData.orderId || "指定なし",
            customerPoNumber: ticketData.customerPoNumber || "なし",
            detail: ticketData.detail || "",
            attachmentsList
        });

        const subject = settingsService.applyTemplate(config.templates.supportSubject, {
            categoryLabel,
            customerName: ticketData.customerName || ""
        });

        const transporter = await getTransporter();
        const mailOpts = {
            from: config.from,
            to: config.supportNotifyTo,
            subject,
            text: body
        };
        if (nodemailerAttachments.length) {
            mailOpts.attachments = nodemailerAttachments;
        }
        await transporter.sendMail(mailOpts);
        console.log(`[Mail] Sent support notification for Ticket: ${ticketData.ticketId}`);
        await recordMailHistory({
            mailType: "support_notification",
            subject,
            to: config.supportNotifyTo,
            from: config.from,
            success: true,
            ...logMeta
        });
        return true;
    } catch (error) {
        console.error("[Mail Error] サポート通知送信失敗:", error);
        await recordMailHistory({
            mailType: "support_notification",
            subject: ticketData && ticketData.ticketId ? `サポート ${ticketData.ticketId}` : "",
            to: "",
            success: false,
            errorMessage: error.message,
            ...logMeta
        });
        return false;
    }
}

/**
 * 招待メール（初回ログイン・パスワード再設定）を顧客へ送信する
 * @param {Object} customer - { customerId, customerName, email }
 * @param {string} inviteUrl - 招待URL（setup.html?id=xxx&key=yyy）
 * @param {string} tempPassword - 一時パスワード
 * @param {boolean} isPasswordReset - true=パスワード再設定用テンプレート, false=初回招待
 * @param {Object} logMeta - 送信履歴用
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
async function sendInviteEmail(customer, inviteUrl, tempPassword, isPasswordReset = false, logMeta = {}) {
    try {
        if (!customer.email || !customer.email.trim()) {
            return { success: false, message: "顧客のメールアドレスが登録されていません" };
        }

        const config = await settingsService.getMailConfig();
        const t = config.templates;

        const templateKey = isPasswordReset ? "passwordReset" : "invite";
        const subjectKey = templateKey + "Subject";
        const bodyKey = templateKey + "Body";

        const subject = settingsService.applyTemplate(t[subjectKey] || t.inviteSubject, {
            customerName: customer.customerName,
            customerId: customer.customerId,
            inviteUrl,
            tempPassword
        });
        const body = settingsService.applyTemplate(t[bodyKey] || t.inviteBody, {
            customerName: customer.customerName,
            customerId: customer.customerId,
            inviteUrl,
            tempPassword
        });

        const transporter = await getTransporter();
        const to = customer.email.trim();
        await transporter.sendMail({
            from: config.from,
            to,
            subject,
            text: body
        });
        console.log(`[Mail] Sent invite to ${customer.customerId} (${customer.email})`);
        await recordMailHistory({
            mailType: isPasswordReset ? "password_reset" : "invite",
            subject,
            to,
            from: config.from,
            success: true,
            ...logMeta
        });
        return { success: true };
    } catch (error) {
        console.error("[Mail Error] 招待メール送信失敗:", error);
        if (error.code === "EAUTH" || (error.message && error.message.includes("Missing credentials"))) {
            const isProduction = process.env.NODE_ENV === "production";
            const message = isProduction
                ? "メール認証エラー: 本番環境では SMTP パスワードを環境変数 MAIL_PASSWORD に設定してください。"
                : "メール認証エラー: SMTPパスワードが設定されていません。システム設定＞メール でパスワードを入力するか、MAIL_PASSWORD を設定してください。";
            await recordMailHistory({
                mailType: isPasswordReset ? "password_reset" : "invite",
                subject: customer && customer.customerId ? `${customer.customerId} 宛` : "",
                to: customer && customer.email ? customer.email.trim() : "",
                success: false,
                errorMessage: message,
                ...logMeta
            });
            return { success: false, message };
        }
        await recordMailHistory({
            mailType: isPasswordReset ? "password_reset" : "invite",
            subject: customer && customer.customerId ? `${customer.customerId} 宛` : "",
            to: customer && customer.email ? customer.email.trim() : "",
            success: false,
            errorMessage: error.message,
            ...logMeta
        });
        return { success: false, message: error.message || "メール送信に失敗しました" };
    }
}

/**
 * パスワード変更完了通知を顧客に送信する
 * @param {Object} customer - { customerId, customerName, email }
 * @param {Object} logMeta - 送信履歴用
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
async function sendPasswordChangedNotification(customer, logMeta = {}) {
    try {
        if (!customer || !(customer.email || "").trim()) {
            return { success: false, message: "顧客のメールアドレスが登録されていません" };
        }

        const config = await settingsService.getMailConfig();
        const t = config.templates;
        const dateStr = new Date().toLocaleString("ja-JP");

        const subject = settingsService.applyTemplate(t.passwordChangedSubject || "【発注システム】パスワードが変更されました", {
            customerName: customer.customerName,
            customerId: customer.customerId,
            date: dateStr
        });
        const body = settingsService.applyTemplate(t.passwordChangedBody || "", {
            customerName: customer.customerName,
            customerId: customer.customerId,
            date: dateStr
        });

        const transporter = await getTransporter();
        await transporter.sendMail({
            from: config.from,
            to: customer.email.trim(),
            subject,
            text: body
        });
        console.log(`[Mail] Sent password-changed notification to ${customer.customerId}`);
        await recordMailHistory({
            mailType: "password_changed",
            subject,
            to: customer.email.trim(),
            from: config.from,
            success: true,
            ...logMeta
        });
        return { success: true };
    } catch (error) {
        console.error("[Mail Error] パスワード変更通知送信失敗:", error);
        await recordMailHistory({
            mailType: "password_changed",
            subject: customer && customer.customerId ? `${customer.customerId} 宛` : "",
            to: customer && customer.email ? customer.email.trim() : "",
            success: false,
            errorMessage: error.message,
            ...logMeta
        });
        return { success: false, message: error.message || "メール送信に失敗しました" };
    }
}

/**
 * ログイン失敗5回通知を送信する（顧客宛 or 管理者宛）
 * @param {Object} opts - { type: 'customer', customer, count } または { type: 'admin', adminId, adminName, count }
 * @param {Object} logMeta - 送信履歴用
 * @returns {Promise<boolean>}
 */
async function sendLoginFailureAlert(opts, logMeta = {}) {
    try {
        const config = await settingsService.getMailConfig();
        const t = config.templates;
        const dateStr = new Date().toLocaleString("ja-JP");

        if (opts.type === "customer" && opts.customer) {
            if (!(opts.customer.email || "").trim()) return false;
            const subject = settingsService.applyTemplate(t.loginFailureAlertSubject || "【発注システム】ログイン失敗が5回ありました", {
                customerName: opts.customer.customerName || opts.customer.customerId,
                date: dateStr,
                count: opts.count || 5
            });
            const body = settingsService.applyTemplate(t.loginFailureAlertBody || "", {
                customerName: opts.customer.customerName || opts.customer.customerId,
                date: dateStr,
                count: opts.count || 5
            });
            const transporter = await getTransporter();
            await transporter.sendMail({
                from: config.from,
                to: opts.customer.email.trim(),
                subject,
                text: body
            });
            console.log(`[Mail] Sent login-failure alert to customer ${opts.customer.customerId}`);
            await recordMailHistory({
                mailType: "login_failure_alert",
                subject,
                to: opts.customer.email.trim(),
                from: config.from,
                success: true,
                actorLabel: "システム",
                ...logMeta
            });
            return true;
        }

        if (opts.type === "admin" && config.supportNotifyTo) {
            const subject = settingsService.applyTemplate(t.loginFailureAlertAdminSubject || "【発注システム】管理者ログイン失敗が5回ありました", {
                adminId: opts.adminId || "",
                adminName: opts.adminName || "",
                date: dateStr,
                count: opts.count || 5
            });
            const body = settingsService.applyTemplate(t.loginFailureAlertAdminBody || "", {
                adminId: opts.adminId || "",
                adminName: opts.adminName || "",
                date: dateStr,
                count: opts.count || 5
            });
            const transporter = await getTransporter();
            await transporter.sendMail({
                from: config.from,
                to: config.supportNotifyTo,
                subject,
                text: body
            });
            console.log(`[Mail] Sent admin login-failure alert for ${opts.adminId}`);
            await recordMailHistory({
                mailType: "login_failure_alert",
                subject,
                to: config.supportNotifyTo,
                from: config.from,
                success: true,
                actorLabel: "システム",
                ...logMeta
            });
            return true;
        }
        return false;
    } catch (error) {
        console.error("[Mail Error] ログイン失敗通知送信失敗:", error);
        await recordMailHistory({
            mailType: "login_failure_alert",
            subject: "",
            to: "",
            success: false,
            errorMessage: error.message,
            actorLabel: "システム",
            ...logMeta
        });
        return false;
    }
}

module.exports = {
    sendOrderConfirmation,
    sendSupportNotification,
    sendInviteEmail,
    sendPasswordChangedNotification,
    sendLoginFailureAlert,
    clearTransporterCache,
    getTransporter
};
