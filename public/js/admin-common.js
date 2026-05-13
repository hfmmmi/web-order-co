/**
 * admin-common.js
 * 役割: 管理画面共通のUI生成、認証チェック、ナビゲーション管理
 * 修正: サイドバーのリンク先を「admin-xxx.html」へ更新 (ファイル名変更対応)
 * 修正: トースト通知システム追加 (UX改善)
 * 修正: XSS対策 — 表示用エスケープとトーストのエスケープ
 */

/** HTML に挿入する文字列をエスケープ（XSS 対策）。管理画面共通で利用 */
function escapeHtml(str) {
    if (str == null || typeof str !== "string") return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// --- 🍞 トースト通知システム (Toast Notification for Admin) ---
window.showToast = function(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

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

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
};

window.toastSuccess = (msg, duration) => window.showToast(msg, 'success', duration);
window.toastError = (msg, duration) => window.showToast(msg, 'error', duration);
window.toastWarning = (msg, duration) => window.showToast(msg, 'warning', duration);
window.toastInfo = (msg, duration) => window.showToast(msg, 'info', duration);

/**
 * 管理画面向け fetch。credentials を付与し、401 時はトースト後にログインへ誘導。
 * @param {string|URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
window.adminApiFetch = async function (url, init) {
    const res = await fetch(url, { credentials: "include", ...(init || {}) });
    if (res.status === 401) {
        let msg = "再ログインが必要です";
        try {
            const j = await res.clone().json();
            if (j && j.message) msg = j.message;
        } catch (e) { /* 非JSON */ }
        if (window.toastError) window.toastError(msg);
        window.location.href = "../index.html";
    }
    return res;
};

// --- ⏱️ 無操作監視タイマー (Activity Watcher) ---
const TIMEOUT_LIMIT = 120 * 60 * 1000; // 120分
let inactivityTimer;

function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
        console.warn("💤 Admin Session Timeout");
        alert("管理画面の操作が120分間なかったため、セキュリティ保護のためログアウトします。");
        
        // サーバー側も明示的にログアウトさせる
        try {
            await fetch("/api/admin/logout", { method: "POST" });
        } catch(e) { console.error(e); }

        window.location.href = "../index.html";
    }, TIMEOUT_LIMIT);
}

// ユーザー操作検知
['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
    window.addEventListener(event, resetTimer);
});


function adminIconHtml(iconKey) {
    return window.ADMIN_ICONS && ADMIN_ICONS[iconKey] ? ADMIN_ICONS[iconKey] : "";
}

/** data-admin-icon を持つ要素に共通SVGを注入（ページ見出し・ダッシュカード等） */
function injectDataAdminIcons() {
    if (!window.ADMIN_ICONS) return;
    document.querySelectorAll("[data-admin-icon]").forEach(function (el) {
        var k = el.getAttribute("data-admin-icon");
        if (k && ADMIN_ICONS[k]) el.innerHTML = ADMIN_ICONS[k];
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    console.log("🚀 Admin System Booting...");
    
    // タイマー始動
    resetTimer();

    injectDataAdminIcons();

    // 1. 共通サイドバーの生成 (DOM操作) - 初回は全メニュー表示
    renderSidebar(null);

    // 2. 認証システムの初期化 (Auth Check)
    await initAuthSystem();
});

/**
 * サイドバーを動的に生成する
 * @param {Object|null} features - 機能フラグ。null の場合は全表示
 */
function renderSidebar(features) {
    const sidebarContainer = document.querySelector('.admin-sidebar');
    if (!sidebarContainer) return; 

    const currentPath = window.location.pathname.split('/').pop();

    const allItems = [
        { name: 'ダッシュボード', iconKey: 'dashboard', link: 'admin-dashboard.html', id: 'dashboard', featureKey: null },
        { name: '受注管理', iconKey: 'orders', link: 'admin-orders.html', id: 'orders', featureKey: 'adminOrders' },
        { name: '買取査定', iconKey: 'kaitori', link: 'admin-kaitori.html', id: 'kaitori', featureKey: 'adminKaitori' },
        { name: 'サポート・不具合', iconKey: 'support', link: 'admin-support.html', id: 'support', featureKey: 'adminSupport' },
        { name: '商品マスタ管理', iconKey: 'products', link: 'admin-products.html', id: 'products', featureKey: 'adminProducts' },
        { name: '見積・特価管理', iconKey: 'estimates', link: 'admin-estimates.html', id: 'estimates', featureKey: 'adminProducts' },
        { name: '顧客管理', iconKey: 'customers', link: 'admin-customers.html', id: 'customers', featureKey: 'adminCustomers' },
        { name: '価格・掛率設定', iconKey: 'prices', link: 'admin-prices.html', id: 'prices', featureKey: 'adminPrices' },
        { name: 'システム設定', iconKey: 'settings', link: 'admin-settings.html', id: 'settings', featureKey: null }
    ];

    const menuItems = features
        ? allItems.filter(item => !item.featureKey || features[item.featureKey] !== false)
        : allItems;

    let menuHtml = `
        <div class="sidebar-brand">WEB受注 ADMIN 3.1</div>
        <ul class="sidebar-menu">
    `;

    menuItems.forEach(item => {
        // active判定も部分一致などで柔軟に対応
        const isProductsFamily =
            item.id === "products" &&
            (currentPath === "admin-products.html" || currentPath === "admin-products-new.html");
        const isOrdersFamily =
            item.id === "orders" &&
            (currentPath === "admin-orders.html" || currentPath === "admin-orders-new.html" || currentPath === "admin-order-detail.html");
        const isActive = currentPath === item.link || isProductsFamily || isOrdersFamily ? "active" : "";
        const iconMarkup = adminIconHtml(item.iconKey);
        menuHtml += `
            <li class="menu-item ${isActive}" onclick="window.location.href='${item.link}'">
                <span class="icon-box" aria-hidden="true">${iconMarkup}</span> ${item.name}
            </li>
        `;
    });

    const logoutIcon = adminIconHtml("logout");
    menuHtml += `</ul>
        <div class="sidebar-footer">
            <button type="button" id="admin-logout-btn" class="sidebar-logout-btn"><span class="icon-box" aria-hidden="true">${logoutIcon}</span><span>ログアウト</span></button>
        </div>
        <div class="sidebar-build-info">
            Build: Federal Model<br>Module: ${escapeHtml(currentPath)}
        </div>
    `;

    sidebarContainer.innerHTML = menuHtml;

    document.getElementById('admin-logout-btn').addEventListener('click', async () => {
        if (!confirm("管理画面からログアウトしますか？")) return;
        try {
            await fetch("/api/admin/logout", { method: "POST" });
            window.location.href = "../index.html"; 
        } catch (err) {
            console.error(err);
            toastError("ログアウト処理に失敗しました");
        }
    });
}

/**
 * 認証チェックとログインオーバーレイ制御
 */
async function initAuthSystem() {
    if (!document.getElementById('admin-login-overlay')) {
        const overlayHtml = `
        <div id="admin-login-overlay">
            <div style="background:white; padding:40px; border-radius:8px; width:300px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                <h2 style="margin-top:0; color:#333;">🛡️ System Command</h2>
                <p style="color:#666; font-size:0.9rem; margin-bottom:20px;">Authorized Personnel Only</p>
                <form id="admin-login-form">
                    <input type="text" id="admin-id-input" placeholder="Admin ID" autocomplete="off" style="width:100%; padding:10px; margin-bottom:10px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;">
                    <input type="password" id="admin-pass-input" placeholder="Password" style="width:100%; padding:10px; margin-bottom:20px; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;">
                    <button type="submit" style="width:100%; padding:10px; background:#007bff; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">LOGIN</button>
                </form>
                <p id="admin-login-msg" style="color:red; font-size:0.8rem; margin-top:10px; display:none;"></p>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
    }

    const overlay = document.getElementById("admin-login-overlay");
    const loginForm = document.getElementById("admin-login-form");
    const loginMsg = document.getElementById("admin-login-msg");

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("admin-id-input").value;
        const pass = document.getElementById("admin-pass-input").value;

        try {
            const res = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, pass })
            });
            const result = await res.json();

            if (result.success) {
                // ★修正: ログイン成功時のリダイレクト先も念のため指定
                if (result.redirectUrl) {
                     window.location.href = "../" + result.redirectUrl;
                } else {
                     location.reload();
                }
            } else {
                loginMsg.textContent = result.message || "認証失敗";
                loginMsg.style.display = "block";
            }
        } catch (err) {
            loginMsg.textContent = "通信エラー";
            loginMsg.style.display = "block";
        }
    });

    try {
        const res = await fetch("/api/admin/check");
        
        if (res.status === 401) {
             throw new Error("Expired");
        }

        const data = await res.json();
        if (data.loggedIn) {
            overlay.style.display = "none";
            console.log("🚀 Admin Auth Confirmed. Dispatching 'admin-ready'...");
            document.dispatchEvent(new Event("admin-ready"));
            try {
                const settingsRes = await fetch("/api/admin/settings");
                if (settingsRes.ok) {
                    const settingsData = await settingsRes.json();
                    renderSidebar(settingsData.features || {});
                }
            } catch (e) { console.warn("Settings fetch failed:", e); }
        } else {
            document.getElementById("admin-id-input").focus();
        }
    } catch (err) {
        console.error("Auth Check Error", err);
    }
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