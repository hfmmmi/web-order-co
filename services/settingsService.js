// services/settingsService.js
// 【役割】システム設定の読み書きを一手に担う共通基盤

const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../dbPaths");

const SETTINGS_FILE = dbPath("settings.json");
const isProduction = process.env.NODE_ENV === "production";

// デフォルト設定（設定が無い場合のフォールバック）
const DEFAULTS = {
    blockedManufacturers: [],
    blockedProductCodes: [],
    mail: {
        smtp: {
            service: "gmail",
            user: "m.irikura@hifumim.com",
            host: "",
            port: 587,
            secure: false
        },
        from: "'WEB受注システム' <m.irikura@hifumim.com>",
        orderNotifyTo: "irikura2@hifumi-m.com",
        supportNotifyTo: "irikura2@hifumi-m.com",
        templates: {
            orderSubject: "【受注確認】注文ID: {{orderId}}",
            orderBody: `{{customerName}} 様
ご注文ありがとうございます。以下の通り承りました。
--------------------------------
注文ID: {{orderId}}
注文日時: {{date}}
貴社発注番号: {{clientOrderNumber}}
納品希望日: {{deliveryDate}}
{{shipperInfo}}
--------------------------------
※詳細は「注文履歴」ページをご確認ください。`,
            supportSubject: "【サポート申請】{{categoryLabel}} {{customerName}}様",
            supportBody: `【サポート/不具合申請を受信しました】
--------------------------------
チケットID: {{ticketId}}
区分: {{categoryLabel}}
顧客: {{customerName}} (ID: {{customerId}})
日時: {{date}}

WEB注文ID: {{orderId}}
WEB発注NO: {{customerPoNumber}}

■内容:
{{detail}}
--------------------------------
※管理画面ダッシュボードをご確認ください。`,
            inviteSubject: "【WEB受注システム】初回ログインのご案内",
            inviteBody: `{{customerName}} 様

WEB受注システムへようこそ。
初回ログインのご案内です。

以下のリンクをクリックし、新しいパスワードを設定してください。
設定後、そのパスワードでログインできます。

【初回設定リンク】
{{inviteUrl}}

※このリンクは1回のみ使用でき、24時間で有効期限が切れます。
※心当たりがない場合はこのメールを破棄してください。`,
            passwordResetSubject: "【WEB受注システム】パスワード再設定のご案内",
            passwordResetBody: `{{customerName}} 様

パスワード再設定のご案内です。

以下のリンクをクリックし、新しいパスワードを設定してください。
設定後、そのパスワードでログインできます。

【パスワード設定リンク】
{{inviteUrl}}

※このリンクは1回のみ使用でき、24時間で有効期限が切れます。
※心当たりがない場合はこのメールを破棄してください。`,
            passwordChangedSubject: "【WEB受注システム】パスワードが変更されました",
            passwordChangedBody: `{{customerName}} 様

WEB受注システムのパスワードが変更されました。

変更日時: {{date}}

心当たりがない場合は、至急管理者にお問い合わせください。`,
            loginFailureAlertSubject: "【WEB受注システム】ログイン失敗が5回ありました",
            loginFailureAlertBody: `{{customerName}} 様

WEB受注システムへのログイン試行が5回失敗しました。

日時: {{date}}

心当たりがない場合は、パスワードの変更をお勧めします。
ログイン画面の「パスワードをお忘れの方」から再設定できます。`,
            loginFailureAlertAdminSubject: "【WEB受注システム】管理者ログイン失敗が5回ありました",
            loginFailureAlertAdminBody: `管理者アカウント「{{adminId}}」（{{adminName}}）でログインが5回失敗しました。

日時: {{date}}

心当たりがない場合は、パスワード変更等のご確認をお願いします。`
        }
    },
    features: {
        orders: true,
        kaitori: true,
        support: true,
        cart: true,
        history: true,
        collection: true,
        announcements: true,
        adminKaitori: true,
        adminOrders: true,
        adminProducts: true,
        adminCustomers: true,
        adminPrices: true,
        adminSupport: true
    },
    announcements: [],
    recaptcha: {
        siteKey: "",
        secretKey: ""
    },
    rankCount: 10,  // 利用するランク数（1〜26）。商品マスタ・価格表の列数に反映
    rankNames: {},  // ランクID → 表示名（未設定時は「ランク1」「ランク2」…）。キー: A,B,C,…
    // 送料規定（メーカー別・価格表Excelの各シート先頭に記載）。キー: "default" またはメーカー名
    shippingRules: {},
    // カートの内容確認ページ最下部に表示する「送料・配送に関するお知らせ」（HTML可）
    cartShippingNotice: ""
};

/** ランクIDの既定順（最大26）。従来互換のため先頭10は A～I, P（以降は J,O,Q～Z 等で26まで） */
const LEGACY_10 = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "P"];
const REST_LETTERS = "JKLMNOQRSTUVWXYZ".split(""); // P は既に含むため N の次は O,Q,...
const DEFAULT_RANK_IDS = [...LEGACY_10, ...REST_LETTERS].slice(0, 26);
const MAX_RANK_COUNT = 26;

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5000; // 5秒キャッシュ

async function loadRaw() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}

/**
 * 設定を取得（キャッシュ付き）
 * @returns {Promise<Object>}
 */
async function getSettings() {
    const now = Date.now();
    if (_cache && now - _cacheTime < CACHE_TTL_MS) {
        return _cache;
    }
    const raw = await loadRaw();
    _cache = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), raw);
    _cacheTime = now;
    return _cache;
}

/**
 * メール設定を取得（本番は環境変数 MAIL_PASSWORD のみ使用）
 * @returns {Promise<Object>}
 */
async function getMailConfig() {
    const s = await getSettings();
    const mail = s.mail || DEFAULTS.mail;
    const smtp = mail.smtp || DEFAULTS.mail.smtp;
    const user = smtp.auth?.user || smtp.user || "";

    // 本番は MAIL_PASSWORD のみ使用し、settings.json の平文パスワードは無視する。
    // 開発/検証環境では既存互換のため settings.json 優先 + 環境変数フォールバック。
    const envPass = String(process.env.MAIL_PASSWORD || "").trim();
    const filePass = (smtp.password && String(smtp.password).trim()) ? String(smtp.password).trim() : "";
    const pass = isProduction ? envPass : (filePass || envPass);
    if (isProduction && !pass) {
        throw new Error("本番環境では MAIL_PASSWORD の設定が必須です");
    }
    let transporterOpts;
    if (smtp.host && smtp.host.trim()) {
        // 自社/他社SMTPサーバー（host指定時）
        transporterOpts = {
            host: smtp.host.trim(),
            port: parseInt(smtp.port, 10) || 587,
            secure: smtp.secure === true,
            auth: { user, pass }
        };
    } else {
        // Gmail等のプリセット（service指定）
        transporterOpts = {
            service: smtp.service || "gmail",
            auth: { user, pass }
        };
    }

    return {
        transporter: transporterOpts,
        from: mail.from || DEFAULTS.mail.from,
        orderNotifyTo: mail.orderNotifyTo || DEFAULTS.mail.orderNotifyTo,
        supportNotifyTo: mail.supportNotifyTo || DEFAULTS.mail.supportNotifyTo,
        templates: deepMerge(DEFAULTS.mail.templates, mail.templates || {})
    };
}

/**
 * 機能フラグを取得
 * @returns {Promise<Object>}
 */
async function getFeatures() {
    const s = await getSettings();
    return deepMerge(DEFAULTS.features, s.features || {});
}

/**
 * 商品スキーマを取得（将来拡張用）
 * @returns {Promise<Object|null>}
 */
async function getProductSchema() {
    const s = await getSettings();
    return s.productSchema || null;
}

/**
 * 利用するランクIDの配列を取得（設定の rankCount に従う）
 * @returns {Promise<string[]>}
 */
async function getRankIds() {
    const s = await getSettings();
    const count = Math.min(MAX_RANK_COUNT, Math.max(1, parseInt(s.rankCount, 10) || 10));
    return DEFAULT_RANK_IDS.slice(0, count);
}

/**
 * ランク一覧を取得（管理画面のドロップダウン・価格表・商品マスタヘッダー用）
 * 表示名は rankNames で未設定なら「ランク1」「ランク2」…
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
async function getRankList() {
    const s = await getSettings();
    const rankNames = s.rankNames || {};
    const count = Math.min(MAX_RANK_COUNT, Math.max(1, parseInt(s.rankCount, 10) || 10));
    const ids = DEFAULT_RANK_IDS.slice(0, count);
    return ids.map((id, i) => {
        const custom = rankNames[id] && String(rankNames[id]).trim();
        return { id, name: custom || `ランク${i + 1}` };
    });
}

/**
 * お知らせを取得（有効なもののみ、日時フィルタリング済み）
 * @param {string} target - "all" | "customer" | "admin" 表示対象
 * @param {string} [category] - "order" | "general" | undefined(全件) category指定時は該当のみ返却
 * @returns {Promise<Array>}
 */
async function getAnnouncements(target = "all", category) {
    const s = await getSettings();
    const announcements = s.announcements || [];
    const now = new Date();
    
    return announcements.filter(ann => {
        // 無効化されているものは除外
        if (ann.enabled === false) return false;
        
        // カテゴリフィルタ: order=注文関連バナー用, general=お知らせページ用
        if (category) {
            const annCat = ann.category || "general";
            if (annCat !== category) return false;
        }
        
        // 表示対象チェック
        if (target !== "all" && ann.target !== "all" && ann.target !== target) return false;
        
        // 開始日時チェック
        if (ann.startDate) {
            const start = new Date(ann.startDate);
            if (now < start) return false;
        }
        
        // 終了日時チェック
        if (ann.endDate) {
            const end = new Date(ann.endDate);
            if (now > end) return false;
        }
        
        return true;
    }).sort((a, b) => {
        // 開始日時の新しい順（未設定は最後）
        const aStart = a.startDate ? new Date(a.startDate) : new Date(0);
        const bStart = b.startDate ? new Date(b.startDate) : new Date(0);
        return bStart - aStart;
    });
}

/**
 * 設定の一部分を更新
 * セキュリティ:
 * - パスワードが空の場合は既存値を保持（上書きしない）
 * - 本番環境では SMTP パスワードを settings.json に保存しない
 * @param {Object} partial マージする部分
 * @returns {Promise<Object>}
 */
async function updateSettings(partial) {
    const sanitized = JSON.parse(JSON.stringify(partial));

    // パスワードが空の場合はマージ対象から除外（既存値を保持）
    if (sanitized.mail?.smtp && (sanitized.mail.smtp.password === "" || sanitized.mail.smtp.password == null)) {
        delete sanitized.mail.smtp.password;
    }
    // reCAPTCHA シークレットキーが空の場合は既存値を保持
    if (sanitized.recaptcha && (sanitized.recaptcha.secretKey === "" || sanitized.recaptcha.secretKey == null)) {
        delete sanitized.recaptcha.secretKey;
    }

    const current = await loadRaw();
    const merged = deepMerge(current, sanitized);

    // 本番環境では settings.json から SMTP パスワードを必ず除去（平文保存を禁止）
    if (isProduction && merged.mail && merged.mail.smtp) {
        delete merged.mail.smtp.password;
    }
    if (sanitized.recaptcha && !merged.recaptcha.secretKey && current.recaptcha && current.recaptcha.secretKey) {
        merged.recaptcha.secretKey = current.recaptcha.secretKey;
    }
    // お知らせは配列なので明示的に上書き（deepMerge で配列が正しく渡るよう念のため）
    if (Array.isArray(sanitized.announcements)) {
        merged.announcements = sanitized.announcements;
    }
    if (sanitized.shippingRules !== undefined && typeof sanitized.shippingRules === "object") {
        merged.shippingRules = sanitized.shippingRules;
    }
    if (sanitized.cartShippingNotice !== undefined) {
        merged.cartShippingNotice = typeof sanitized.cartShippingNotice === "string" ? sanitized.cartShippingNotice : "";
    }
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
    _cache = null; // キャッシュ破棄
    return merged;
}

/**
 * テンプレート文字列のプレースホルダを置換
 * @param {string} template テンプレート
 * @param {Object} vars 置換用オブジェクト
 * @returns {string}
 */
function applyTemplate(template, vars) {
    if (!template || typeof template !== "string") return "";
    let out = template;
    for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v ?? ""));
    }
    return out;
}

module.exports = {
    getSettings,
    getMailConfig,
    getFeatures,
    getProductSchema,
    getAnnouncements,
    getRankIds,
    getRankList,
    DEFAULT_RANK_IDS,
    MAX_RANK_COUNT,
    updateSettings,
    applyTemplate
};
