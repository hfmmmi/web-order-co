// メール設定の診断スクリプト（送信できない原因を確認）
// 実行: node scripts/check-mail.js
// プロジェクト直下の settings.json を使って送信テストします（DATA_DIR は一時的に無視）

async function main() {
    // 診断時は必ずプロジェクト直下を参照するため DATA_DIR を外す
    if (process.env.DATA_DIR) {
        console.log("注意: DATA_DIR を外してプロジェクト直下の設定で診断します。");
        delete process.env.DATA_DIR;
    }

    const path = require("path");
    const fs = require("fs").promises;

    // どの settings.json を読むか
    const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..");
    const settingsPath = path.join(dataRoot, "settings.json");
    console.log("\n参照している設定ファイル:", settingsPath);

    let raw = {};
    try {
        const data = await fs.readFile(settingsPath, "utf-8");
        raw = JSON.parse(data);
    } catch (e) {
        console.error("設定ファイルの読み込みに失敗しました:", e.message);
        process.exit(1);
    }

    const mail = raw.mail || {};
    const smtp = mail.smtp || {};
    const user = smtp.auth?.user || smtp.user || "";
    const pass = (smtp.password && String(smtp.password).trim()) ? "[設定済み]" : "[空]";
    const from = mail.from || "";
    const orderNotifyTo = mail.orderNotifyTo || "";
    const supportNotifyTo = mail.supportNotifyTo || "";

    console.log("\n--- メール設定の確認 ---");
    console.log("SMTP host:", smtp.host || "(空・Gmail等プリセット)");
    console.log("SMTP port:", smtp.port);
    console.log("SMTP secure:", smtp.secure);
    console.log("SMTP user:", user || "(空)");
    console.log("SMTP password:", pass);
    console.log("送信元 (from):", from || "(空)");
    console.log("受注通知先:", orderNotifyTo || "(空)");
    console.log("サポート通知先:", supportNotifyTo || "(空)");

    if (!user || !from) {
        console.log("\n原因の可能性: 送信元または SMTP ユーザーが空です。システム設定で入力してください。");
        return;
    }
    if (pass === "[空]" && !process.env.MAIL_PASSWORD) {
        console.log("\n原因の可能性: SMTP パスワードが空です。システム設定の「SMTPパスワード」に入力するか、環境変数 MAIL_PASSWORD を設定してください。");
        return;
    }

    // 実際に送信を試す（nodemailer を使用）
    console.log("\n--- 送信テスト（自分宛てに1通送信） ---");
    const nodemailer = require("nodemailer");
    const settingsService = require("../services/settingsService");

    let config;
    try {
        config = await settingsService.getMailConfig();
    } catch (e) {
        console.error("getMailConfig エラー:", e.message);
        return;
    }

    const transporter = nodemailer.createTransport(config.transporter);
    const testTo = orderNotifyTo || supportNotifyTo || user;
    if (!testTo) {
        console.log("送信先が特定できません。orderNotifyTo または supportNotifyTo を設定してください。");
        return;
    }

    try {
        await transporter.sendMail({
            from: config.from,
            to: testTo,
            subject: "[診断用] メール設定テスト（パスワード再設定メールとは別です）",
            text: "このメールは「scripts/check-mail.js」の診断用送信です。\nパスワード再設定のメールではありません。\n届いていればSMTP設定は正常です。"
        });
        console.log("送信成功: 宛先", testTo);
        console.log("※「パスワードをお忘れの方」で送るメールは件名「【WEB受注システム】パスワード再設定のご案内」です。");
    } catch (err) {
        console.error("\n送信エラー（これが届かない原因です）:");
        console.error("  コード:", err.code || "(なし)");
        console.error("  メッセージ:", err.message);
        if (err.response) console.error("  レスポンス:", err.response);
        if (err.code === "EAUTH") {
            console.log("\n→ SMTP 認証エラー: ユーザー名・パスワードを確認してください。");
            console.log("  （Xserver 等は「メールアカウント」のパスワードを使用します）");
        }
        if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
            console.log("\n→ 接続エラー: ホスト・ポート・ファイアウォールを確認してください。");
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
