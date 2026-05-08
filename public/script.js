/**
 * script.js
 * 役割: ログイン画面の制御、および全ページ共通のセッション監視
 * 修正: 120分無操作時の自動ログアウト監視を追加
 * 修正: Adminログイン時の遷移先を admin-dashboard.html に変更
 * 修正: トースト通知システム追加 (UX改善)
 * 修正: XSS対策 — 表示用エスケープ関数と代理ログイン表示のエスケープ
 */

/** HTML に挿入する文字列をエスケープ（XSS 対策） */
function escapeHtml(str) {
    if (str == null || typeof str !== "string") return "";
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

/**
 * セッション保存中のカート数量を、グローバルナビの「カート」リンクへ反映する
 * （どの顧客ページを開いても件数を表示するための共通処理）
 */
function updateGlobalCartBadge() {
    const navCart = document.querySelector(".nav-cart");
    if (!navCart) return;

    let cart = [];
    try {
        const raw = sessionStorage.getItem("cart");
        const parsed = raw ? JSON.parse(raw) : [];
        cart = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        cart = [];
    }

    const totalQty = cart.reduce(function (sum, item) {
        const qty = Number(item && item.quantity);
        return sum + (Number.isFinite(qty) ? qty : 0);
    }, 0);

    let badge = navCart.querySelector(".cart-badge");
    if (totalQty > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "cart-badge";
            badge.style.background = "red";
            badge.style.color = "white";
            badge.style.borderRadius = "50%";
            badge.style.padding = "2px 6px";
            badge.style.fontSize = "0.75rem";
            badge.style.marginLeft = "5px";
            navCart.appendChild(badge);
        }
        badge.textContent = String(totalQty);
    } else if (badge) {
        badge.remove();
    }
}

window.updateGlobalCartBadge = updateGlobalCartBadge;

// --- 🍞 0. トースト通知システム (Toast Notification) ---
window.showToast = function(message, type = 'info', duration = 3000) {
    // コンテナがなければ作成
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // アイコンマップ
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    // トースト要素を作成（message はエスケープして XSS を防止）
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(String(message))}</span>
        <button type="button" class="toast-close" aria-label="閉じる">×</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', function () {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    // 自動削除
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
};

// ショートカット関数
window.toastSuccess = (msg, duration) => window.showToast(msg, 'success', duration);
window.toastError = (msg, duration) => window.showToast(msg, 'error', duration);
window.toastWarning = (msg, duration) => window.showToast(msg, 'warning', duration);
window.toastInfo = (msg, duration) => window.showToast(msg, 'info', duration);

// --- 🛡️ 1. セッション切れ監視 (検問所システム: Global Scope) ---
function getFetchRequestUrlString(input) {
    if (typeof input === "string") return input;
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    if (input && typeof input === "object" && typeof input.url === "string") return input.url;
    return "";
}

/** 顧客セッション必須APIで、管理者ログイン中など「顧客IDが無いだけ」の401 — 管理セッションは有効なので再ログイン誘導しない */
function isCustomerOnlyAuth401Passthrough(requestUrlString) {
    if (!requestUrlString) return false;
    try {
        const pathname = new URL(requestUrlString, window.location.origin).pathname;
        const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
        const set = new Set([
            "/api/account/proxy-request",
            "/api/account/proxy-request/approve",
            "/api/account/proxy-request/reject",
            "/support/my-tickets",
            "/request-support"
        ]);
        return set.has(normalized);
    } catch (e) {
        return false;
    }
}

const originalFetch = window.fetch;
window.fetch = async (...args) => {
    try {
        const response = await originalFetch(...args);
        
        // 今いる場所が「ログイン画面」以外で...
        const path = window.location.pathname;
        const isLoginPage = path.endsWith('index.html') || path === '/' || path.endsWith('/');
        
        // 「権限なし(401)」＝期限切れ or システム再起動などでセッションが無効になった場合
        if (response.status === 401 && !isLoginPage) {
            const reqUrl = getFetchRequestUrlString(args[0]);
            if (isCustomerOnlyAuth401Passthrough(reqUrl)) {
                return response;
            }
            if (!window.isRedirecting) {
                window.isRedirecting = true;
                alert("再ログインが必要です。\n（長時間の無操作やシステム更新によりセッションが切れた場合があります）\n\nログイン画面に移動します。");
                window.location.href = "/index.html";
            }
            throw new Error("Session Expired");
        }
        return response;
    } catch (error) {
        throw error;
    }
};

// --- ⏱️ 2. 無操作監視タイマー (Activity Watcher) ---
// 120分 (7200秒) 操作がなければ強制ログアウト
const TIMEOUT_LIMIT = 120 * 60 * 1000; 
let inactivityTimer;

function resetTimer() {
    // ログイン画面ではタイマーを動かさない
    const path = window.location.pathname;
    if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) return;

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        console.warn("💤 120分無操作のため自動ログアウトします");
        alert("長時間操作がなかったため、安全のためログアウトしました。");
        window.location.href = "/index.html";
    }, TIMEOUT_LIMIT);
}

// ユーザーの何らかの操作を検知してタイマーをリセット
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
    window.addEventListener(event, resetTimer);
});


// --- 🖥️ 3. 画面操作ロジック ---
document.addEventListener("DOMContentLoaded", async function() {

    // タイマー始動
    resetTimer();
    updateGlobalCartBadge();

    // ログイン画面の要素を探す
    const loginButton = document.querySelector("#login-btn"); 
    const idInput = document.querySelector("#username-input");
    const passInput = document.querySelector("#password-input");

    // ★安全装置: ID入力欄が存在するページ(ログイン画面)でのみ実行する
    if (idInput && passInput) {
        const btn = loginButton || document.querySelector("button");
        const recaptchaWrap = document.getElementById("recaptcha-wrap");
        const recaptchaContainer = document.getElementById("recaptcha-container");

        // reCAPTCHA: 設定取得とスクリプト読み込み
        let recaptchaSiteKey = "";
        let recaptchaWidgetId = null;
        let recaptchaReady = false;
        try {
            const pubRes = await fetch("/api/settings/public", { credentials: "same-origin" });
            const pubData = await pubRes.json();
            if (pubData.recaptchaSiteKey && pubData.recaptchaSiteKey.trim()) {
                recaptchaSiteKey = pubData.recaptchaSiteKey.trim();
                (function loadRecaptchaScript() {
                    if (window.grecaptcha) { recaptchaReady = true; return; }
                    const s = document.createElement("script");
                    s.src = "https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit";
                    s.async = true;
                    s.defer = true;
                    document.head.appendChild(s);
                })();
            }
        } catch (e) { /* 設定取得失敗時はCAPTCHAなしで運用 */ }
        window.onRecaptchaLoaded = function() { recaptchaReady = true; };

        function showRecaptchaAndRender() {
            if (!recaptchaWrap || !recaptchaContainer || !recaptchaSiteKey) return;
            recaptchaWrap.style.display = "block";
            if (!recaptchaReady || !window.grecaptcha) return;
            if (recaptchaWidgetId !== null) {
                try { window.grecaptcha.reset(recaptchaWidgetId); } catch (e) {}
                return;
            }
            try {
                recaptchaWidgetId = window.grecaptcha.render(recaptchaContainer, {
                    sitekey: recaptchaSiteKey,
                    theme: "light",
                    size: "normal"
                });
            } catch (e) { console.warn("reCAPTCHA render error:", e); }
        }

        if (btn) {
            // 1. ID欄でEnter
            idInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (passInput.value === "") {
                        passInput.focus();
                    } else {
                        btn.click();
                    }
                }
            });

            // 2. パスワード欄でEnter
            passInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    btn.click(); 
                }
            });

            // 実際のクリック処理
            btn.addEventListener("click", async function() {
                const id = idInput.value.trim(); 
                const pass = passInput.value;

                if (id === "" || pass === "") {
                    alert("入力内容を確認してください");
                    return;
                }

                try {
                    btn.disabled = true;

                    // IDによって叩くAPIと行き先を変える
                    let targetApi = "/api/login";       // デフォルト: 顧客用
                    let successUrl = "products.html";   // デフォルト: 商品一覧

                    // IDが "admin" の場合のみ、管理者ルートへ切り替え
                    if (id === "admin") {
                        targetApi = "/api/admin/login";
                        // ★修正: ファイル名変更(admin-dashboard.html)に対応
                        successUrl = "admin/admin-dashboard.html"; 
                    }

                    const body = { id: id, pass: pass };
                    if (recaptchaSiteKey && recaptchaWidgetId !== null && window.grecaptcha) {
                        const token = window.grecaptcha.getResponse(recaptchaWidgetId);
                        if (token) body.captchaToken = token;
                    }

                    const response = await fetch(targetApi, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body)
                    });
                    const data = await response.json();

                    if (data.success) {
                        // APIがredirectUrlを返してきたらそれを優先、なければsuccessUrlを使う
                        window.location.href = data.redirectUrl || successUrl;
                    } else {
                        if (data.captchaRequired) {
                            showRecaptchaAndRender();
                            // スクリプト読み込み遅延時は少し待って再描画
                            if (!recaptchaReady && recaptchaSiteKey) {
                                const check = setInterval(function() {
                                    if (recaptchaReady) {
                                        clearInterval(check);
                                        showRecaptchaAndRender();
                                    }
                                }, 200);
                                setTimeout(function() { clearInterval(check); }, 5000);
                            }
                        }
                        alert(data.message || "ログインに失敗しました");
                        btn.disabled = false;
                    }
                } catch (error) {
                    console.error("ログイン処理エラー:", error);
                    alert("通信に失敗しました");
                    btn.disabled = false;
                }
            });
        }

        // パスワード再設定申込（「パスワードをお忘れの方」）
        const forgotLink = document.getElementById("forgot-password-link");
        const forgotModal = document.getElementById("forgot-password-modal");
        const forgotClose = document.getElementById("forgot-password-close");
        const forgotInput = document.getElementById("forgot-password-input");
        const forgotSubmit = document.getElementById("forgot-password-submit");

        if (forgotLink && forgotModal) {
            forgotLink.addEventListener("click", function (e) {
                e.preventDefault();
                forgotModal.classList.add("active");
                if (forgotInput) forgotInput.value = "";
                setTimeout(function () { if (forgotInput) forgotInput.focus(); }, 100);
            });
            function closeForgotModal() {
                forgotModal.classList.remove("active");
            }
            if (forgotClose) forgotClose.addEventListener("click", closeForgotModal);
            forgotModal.addEventListener("click", function (e) {
                if (e.target === forgotModal) closeForgotModal();
            });
            if (forgotSubmit && forgotInput) {
                forgotSubmit.addEventListener("click", async function () {
                    const id = forgotInput.value.trim();
                    if (!id) {
                        if (window.showToast) window.showToast("ログインIDまたはメールアドレスを入力してください", "warning");
                        else alert("ログインIDまたはメールアドレスを入力してください");
                        return;
                    }
                    forgotSubmit.disabled = true;
                    forgotSubmit.textContent = "送信中...";
                    try {
                        const res = await fetch("/api/request-password-reset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: id })
                        });
                        const data = await res.json();
                        if (window.showToast) {
                            window.showToast(data.message || "送信しました。", "success", 5000);
                        } else {
                            alert(data.message || "送信しました。");
                        }
                        closeForgotModal();
                    } catch (err) {
                        console.error(err);
                        if (window.showToast) window.showToast("通信に失敗しました", "error");
                        else alert("通信に失敗しました");
                    } finally {
                        forgotSubmit.disabled = false;
                        forgotSubmit.textContent = "送信する";
                    }
                });
                forgotInput.addEventListener("keydown", function (e) {
                    if (e.key === "Enter") forgotSubmit.click();
                });
            }
        }
    }
    
    // 顧客向け: 公開設定（features）の取得とお知らせ表示
    const navLinks = document.querySelector(".nav-links");
    const nav = document.querySelector(".global-nav");
    fetch("/api/settings/public")
        .then(function (r) {
            if (!r.ok) return {};
            return r.json();
        })
        .then(function (data) {
            var f = (data && data.features) || {};
            if (navLinks) {
                navLinks.querySelectorAll("[data-feature]").forEach(function (el) {
                    var key = el.dataset.feature;
                    if (f[key] === false) el.style.display = "none";
                });
            }
            // 注文に関するお知らせ（バナー）: 商品一覧・注文履歴ページのみに表示
            var path = window.location.pathname || "";
            var showBanner = path.endsWith("products.html") || path.endsWith("/products") || path === "/products"
                || path.endsWith("history.html") || path.endsWith("/history") || path === "/history";
            var list = (data && data.orderBanners) || (data && data.announcements) || [];
            if (list.length > 0 && nav && showBanner) {
                renderAnnouncements(list);
            }
        })
        .catch(function () {});

    // ログアウト機能
    const logoutBtn = document.querySelector("#logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async function(e) {
            e.preventDefault();
            if(confirm("ログアウトしますか？")) {
                try {
                    await fetch("/api/logout", { method: "POST" });
                } catch(err) {
                    console.error(err);
                }
                window.location.href = "/index.html";
            }
        });
    }

    // 代理ログイン中バナー表示（顧客画面のみ・管理者による代理ログイン時）
    const path = window.location.pathname || "";
    const isLoginPage = path.endsWith("index.html") || path === "/" || path.endsWith("/");
    if (!isLoginPage && nav) {
        fetch("/api/session")
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (data) {
                if (!data || !data.proxyByAdmin) return;
                var adminName = (data.proxyByAdmin && data.proxyByAdmin.adminName) ? data.proxyByAdmin.adminName : "管理者";
                var existing = document.getElementById("proxy-login-banner");
                if (existing) existing.remove();
                var banner = document.createElement("div");
                banner.id = "proxy-login-banner";
                banner.style.cssText = "background: linear-gradient(90deg, #6f42c1 0%, #5a32a3 100%); color: #fff; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);";
                banner.innerHTML = "<span style=\"font-weight: bold;\">🔐 管理者（" + escapeHtml(adminName) + "）による代理ログイン中</span>" +
                    "<button type=\"button\" id=\"proxy-logout-btn\" style=\"background:#fff; color:#6f42c1; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;\">代理ログインを終了</button>";
                nav.insertAdjacentElement("afterend", banner);
                function doProxyLogout() {
                    fetch("/api/admin/proxy-logout", { method: "POST" })
                        .then(function (res) { return res.json(); })
                        .then(function (json) {
                            if (json.success && json.redirectUrl) {
                                window.location.href = json.redirectUrl;
                            } else {
                                if (window.toastError) window.toastError(json.message || "終了に失敗しました");
                                else alert(json.message || "終了に失敗しました");
                            }
                        })
                        .catch(function (err) { console.error(err); });
                }
                document.getElementById("proxy-logout-btn").addEventListener("click", function () { this.disabled = true; doProxyLogout(); });
                // ナビの「ログアウト」を代理終了に差し替え
                if (logoutBtn) {
                    logoutBtn.textContent = "代理ログインを終了";
                    logoutBtn.replaceWith(logoutBtn.cloneNode(true));
                    var newLogoutBtn = document.querySelector("#logout-btn");
                    if (newLogoutBtn) {
                        newLogoutBtn.addEventListener("click", function (e) {
                            e.preventDefault();
                            if (confirm("代理ログインを終了して管理画面に戻りますか？")) {
                                newLogoutBtn.disabled = true;
                                doProxyLogout();
                            }
                        });
                    }
                }
            })
            .catch(function () {});
    }

    // 代理ログイン申請バナー（管理者が申請すると顧客画面に表示・許可/却下。即時1回＋1.5秒間隔で表示を早く）
    if (!isLoginPage && nav) {
        var proxyRequestBannerId = "proxy-request-banner";
        function checkProxyRequest() {
            fetch("/api/account/proxy-request", { credentials: "same-origin" })
                .then(function (r) {
                    if (r.status === 401) return { pending: false };
                    return r.json();
                })
                .then(function (data) {
                    var existing = document.getElementById(proxyRequestBannerId);
                    if (data && data.pending && data.adminName) {
                        if (existing) return;
                        var banner = document.createElement("div");
                        banner.id = proxyRequestBannerId;
                        banner.style.cssText = "background: linear-gradient(90deg, #0d6efd 0%, #0a58ca 100%); color: #fff; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);";
                        banner.innerHTML = "<span style=\"font-weight: bold;\">🔐 管理者（" + escapeHtml(data.adminName || "管理者") + "）が代理ログインを申請しています。許可しますか？</span>" +
                            "<div style=\"display:flex; gap:8px;\"><button type=\"button\" class=\"proxy-request-allow\" style=\"background:#198754; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;\">許可</button>" +
                            "<button type=\"button\" class=\"proxy-request-reject\" style=\"background:#6c757d; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;\">却下</button></div>";
                        nav.insertAdjacentElement("afterend", banner);
                        banner.querySelector(".proxy-request-allow").addEventListener("click", function () {
                            this.disabled = true;
                            banner.querySelector(".proxy-request-reject").disabled = true;
                            fetch("/api/account/proxy-request/approve", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" })
                                .then(function (res) { return res.json(); })
                                .then(function (json) {
                                    var el = document.getElementById(proxyRequestBannerId);
                                    if (el) el.remove();
                                    if (window.toastSuccess) window.toastSuccess(json.message || "許可しました");
                                })
                                .catch(function () {
                                    var el = document.getElementById(proxyRequestBannerId);
                                    if (el) el.remove();
                                });
                        });
                        banner.querySelector(".proxy-request-reject").addEventListener("click", function () {
                            this.disabled = true;
                            banner.querySelector(".proxy-request-allow").disabled = true;
                            fetch("/api/account/proxy-request/reject", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" })
                                .then(function (res) { return res.json(); })
                                .then(function () {
                                    var el = document.getElementById(proxyRequestBannerId);
                                    if (el) el.remove();
                                    if (window.toastSuccess) window.toastSuccess("却下しました");
                                })
                                .catch(function () {
                                    var el = document.getElementById(proxyRequestBannerId);
                                    if (el) el.remove();
                                });
                        });
                    } else {
                        if (existing) existing.remove();
                    }
                })
                .catch(function () {});
        }
        checkProxyRequest();
        setInterval(checkProxyRequest, 1500);
    }
});

// =================================================================
// 📢 お知らせ表示機能
// =================================================================

function renderAnnouncements(announcements) {
    // 既存のお知らせコンテナがあれば削除
    const existing = document.getElementById("announcements-container");
    if (existing) existing.remove();

    // ナビゲーションの下にコンテナを追加
    const nav = document.querySelector(".global-nav");
    if (!nav) return;

    const container = document.createElement("div");
    container.id = "announcements-container";
    container.style.cssText = "width: 100%; margin: 0 auto; padding: 0 20px; box-sizing: border-box;";

    announcements.forEach(ann => {
        const banner = createAnnouncementBanner(ann);
        container.appendChild(banner);
    });

    // ナビの後に挿入
    nav.insertAdjacentElement("afterend", container);
}

function createAnnouncementBanner(ann) {
    const typeStyles = {
        info: { bg: "#d1ecf1", border: "#bee5eb", text: "#0c5460", icon: "ℹ️" },
        warning: { bg: "#fff3cd", border: "#ffeeba", text: "#856404", icon: "⚠️" },
        error: { bg: "#f8d7da", border: "#f5c6cb", text: "#721c24", icon: "❌" },
        success: { bg: "#d4edda", border: "#c3e6cb", text: "#155724", icon: "✅" }
    };

    const style = typeStyles[ann.type] || typeStyles.info;
    const banner = document.createElement("div");
    banner.className = "announcement-banner";
    banner.style.cssText = `
        background: ${style.bg};
        border-left: 4px solid ${style.border};
        color: ${style.text};
        padding: 15px 20px;
        margin: 10px 0;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        display: flex;
        align-items: flex-start;
        gap: 12px;
    `;

    const icon = document.createElement("span");
    icon.textContent = style.icon;
    icon.style.cssText = "font-size: 1.2rem; flex-shrink: 0;";

    const content = document.createElement("div");
    content.style.cssText = "flex: 1;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight: bold; font-size: 1.05rem; margin-bottom: 5px;";
    title.textContent = ann.title;

    const body = document.createElement("div");
    body.style.cssText = "line-height: 1.6; white-space: pre-wrap;";
    body.textContent = ann.body;

    content.appendChild(title);
    content.appendChild(body);

    if (ann.linkUrl) {
        const link = document.createElement("a");
        link.href = ann.linkUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = ann.linkText || "詳細を見る";
        link.style.cssText = `
            display: inline-block;
            margin-top: 8px;
            color: ${style.text};
            text-decoration: underline;
            font-weight: bold;
        `;
        content.appendChild(link);
    }

    banner.appendChild(icon);
    banner.appendChild(content);

    return banner;
}

/**
 * ネイティブの <input type="date">: フォーカス中に同コントロールを再度押下するとピッカーを閉じる。
 * 初回フォーカス時は showPicker で開く（動的追加された日付入力にも MutationObserver で対応）。
 */
(function initDatePickerToggleAll() {
    function bindDatePickerToggle(el) {
        if (!el || el.nodeName !== "INPUT" || el.type !== "date" || el.dataset.datePickerToggleBound) return;
        el.dataset.datePickerToggleBound = "1";
        if (el.getAttribute("onclick")) el.removeAttribute("onclick");
        el.addEventListener("mousedown", function (e) {
            if (document.activeElement === el) {
                e.preventDefault();
                el.blur();
            }
        });
        el.addEventListener("focus", function () {
            if (typeof el.showPicker !== "function") return;
            try {
                el.showPicker();
            } catch (err) { /* 非対応ブラウザ等 */ }
        });
    }
    function scan(root) {
        (root || document).querySelectorAll('input[type="date"]').forEach(bindDatePickerToggle);
    }
    function start() {
        scan(document);
        if (!document.body) return;
        var t;
        var mo = new MutationObserver(function () {
            clearTimeout(t);
            t = setTimeout(function () { scan(document); }, 50);
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();