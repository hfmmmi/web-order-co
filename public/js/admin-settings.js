/**
 * admin-settings.js
 * システム設定画面のロジック
 */

let announcementsData = [];

document.addEventListener("DOMContentLoaded", async function () {
    await loadSettings();
    await loadAdminAccount();
    initTabs();
    document.getElementById("settings-form").addEventListener("submit", saveSettings);

    const btnSaveAdminAccount = document.getElementById("btn-save-admin-account");
    if (btnSaveAdminAccount) {
        btnSaveAdminAccount.addEventListener("click", saveAdminAccount);
    }
    
    const btnAddShippingRule = document.getElementById("btn-add-shipping-rule");
    if (btnAddShippingRule) {
        btnAddShippingRule.addEventListener("click", () => addShippingRuleRow("", ""));
    }

    // お知らせ追加ボタン
    const btnAdd = document.getElementById("btn-add-announcement");
    if (btnAdd) {
        btnAdd.addEventListener("click", () => addAnnouncement());
    }
});

// バックエンドの DEFAULT_RANK_IDS と同一順（先頭10は A～I, P で従来互換）
const ALL_RANK_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "P", "J", "K", "L", "M", "N", "O", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

const FEATURE_DEFS = {
    customer: [
        { key: "orders", label: "注文機能" },
        { key: "kaitori", label: "空カートリッジ買取" },
        { key: "support", label: "サポート" },
        { key: "cart", label: "カート" },
        { key: "history", label: "注文履歴" },
        { key: "collection", label: "回収依頼" },
        { key: "announcements", label: "お知らせページ" }
    ],
    admin: [
        { key: "adminKaitori", label: "買取査定" },
        { key: "adminOrders", label: "受注管理" },
        { key: "adminProducts", label: "商品マスタ管理" },
        { key: "adminCustomers", label: "顧客管理" },
        { key: "adminPrices", label: "価格・掛率設定" },
        { key: "adminSupport", label: "サポート・不具合" }
    ]
};

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            const tabId = "tab-" + btn.dataset.tab;
            document.getElementById(tabId).classList.add("active");
        });
    });
}

function renderRankNamesList(container, count, rankNamesData) {
    if (!container) return;
    const rankIds = ALL_RANK_IDS.slice(0, count);
    container.innerHTML = rankIds.map((id, i) => `
        <div class="form-group" style="margin-bottom:8px;">
            <label for="rank-name-${id}" style="font-weight:bold; min-width:24px;">${id}（ランク${i + 1}）</label>
            <input type="text" id="rank-name-${id}" class="form-control" placeholder="ランク${i + 1}" style="max-width:180px;">
        </div>
    `).join("");
    rankIds.forEach(id => {
        const el = document.getElementById("rank-name-" + id);
        if (el && rankNamesData[id] !== undefined) el.value = String(rankNamesData[id]);
    });
}

async function loadAdminAccount() {
    try {
        const res = await fetch("/api/admin/account");
        if (!res.ok) return;
        const data = await res.json();
        const idEl = document.getElementById("admin-account-id");
        const nameEl = document.getElementById("admin-account-name");
        const emailEl = document.getElementById("admin-account-email");
        const passwordEl = document.getElementById("admin-account-password");
        const hintEl = document.getElementById("admin-account-password-hint");
        if (idEl) idEl.value = data.adminId || "";
        if (nameEl) nameEl.value = data.name || "";
        if (emailEl) emailEl.value = data.email || "";
        if (passwordEl) passwordEl.value = "";
        if (hintEl) hintEl.textContent = data.passwordSet ? "パスワード設定済み。変更する場合のみ入力してください。" : "パスワードを入力してください（4文字以上）。";
    } catch (e) {
        console.error("loadAdminAccount:", e);
    }
}

async function saveAdminAccount() {
    const idEl = document.getElementById("admin-account-id");
    const nameEl = document.getElementById("admin-account-name");
    const emailEl = document.getElementById("admin-account-email");
    const passwordEl = document.getElementById("admin-account-password");
    const btn = document.getElementById("btn-save-admin-account");
    if (!idEl || !btn) return;
    const adminId = (idEl.value || "").trim();
    if (!adminId) {
        if (typeof toastError === "function") toastError("管理者IDを入力してください");
        else alert("管理者IDを入力してください");
        return;
    }
    btn.disabled = true;
    const body = {
        adminId,
        name: (nameEl && nameEl.value) ? nameEl.value.trim() : "",
        email: (emailEl && emailEl.value) ? emailEl.value.trim() : ""
    };
    if (passwordEl && passwordEl.value.trim()) body.password = passwordEl.value;
    try {
        const res = await fetch("/api/admin/account", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "保存に失敗しました");
        if (typeof toastSuccess === "function") toastSuccess("管理者アカウントを保存しました");
        else alert("管理者アカウントを保存しました");
        passwordEl.value = "";
        await loadAdminAccount();
    } catch (err) {
        if (typeof toastError === "function") toastError(err.message);
        else alert(err.message);
    } finally {
        btn.disabled = false;
    }
}

async function loadSettings() {
    try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("設定の取得に失敗しました");
        const data = await res.json();

        // メール
        document.getElementById("orderNotifyTo").value = data.mail?.orderNotifyTo || "";
        document.getElementById("supportNotifyTo").value = data.mail?.supportNotifyTo || "";
        document.getElementById("mailFrom").value = data.mail?.from || "";
        document.getElementById("smtpHost").value = data.mail?.smtp?.host || "";
        document.getElementById("smtpPort").value = data.mail?.smtp?.port || 587;
        document.getElementById("smtpSecure").checked = !!data.mail?.smtp?.secure;
        document.getElementById("smtpUser").value = data.mail?.smtp?.user || "";
        const smtpPasswordInput = document.getElementById("smtpPassword");
        smtpPasswordInput.value = "";
        const passwordManagedByEnv = !!data.mail?.smtp?.passwordManagedByEnv;
        smtpPasswordInput.disabled = passwordManagedByEnv;
        smtpPasswordInput.placeholder = passwordManagedByEnv ? "本番環境では環境変数 MAIL_PASSWORD で管理します" : "変更する場合のみ入力";
        const hintEl = document.getElementById("smtpPasswordHint");
        if (hintEl) {
            if (passwordManagedByEnv) {
                hintEl.textContent = data.mail?.smtp?.passwordSet
                    ? "本番環境: MAIL_PASSWORD は設定済みです。settings.json には保存されません。"
                    : "本番環境: MAIL_PASSWORD が未設定です。サーバー環境変数を設定してください。";
            } else {
                hintEl.textContent = data.mail?.smtp?.passwordSet
                    ? "パスワード設定済み。変更する場合のみ入力してください。"
                    : "SMTP認証用のパスワードを入力してください。";
            }
        }
        document.getElementById("orderSubject").value = data.mail?.templates?.orderSubject || "";
        document.getElementById("orderBody").value = data.mail?.templates?.orderBody || "";
        document.getElementById("supportSubject").value = data.mail?.templates?.supportSubject || "";
        document.getElementById("supportBody").value = data.mail?.templates?.supportBody || "";
        document.getElementById("inviteSubject").value = data.mail?.templates?.inviteSubject || "";
        document.getElementById("inviteBody").value = data.mail?.templates?.inviteBody || "";
        document.getElementById("passwordResetSubject").value = data.mail?.templates?.passwordResetSubject || "";
        document.getElementById("passwordResetBody").value = data.mail?.templates?.passwordResetBody || "";
        document.getElementById("passwordChangedSubject").value = data.mail?.templates?.passwordChangedSubject || "";
        document.getElementById("passwordChangedBody").value = data.mail?.templates?.passwordChangedBody || "";

        // reCAPTCHA
        const recaptchaSiteKeyEl = document.getElementById("recaptchaSiteKey");
        const recaptchaSecretKeyEl = document.getElementById("recaptchaSecretKey");
        const recaptchaSecretKeyHintEl = document.getElementById("recaptchaSecretKeyHint");
        if (recaptchaSiteKeyEl) recaptchaSiteKeyEl.value = data.recaptcha?.siteKey || "";
        if (recaptchaSecretKeyEl) recaptchaSecretKeyEl.value = "";
        if (recaptchaSecretKeyHintEl) recaptchaSecretKeyHintEl.textContent = data.recaptcha?.secretKeySet ? "シークレットキーは設定済みです。変更する場合のみ入力してください。" : "Google reCAPTCHA 管理コンソールで取得したシークレットキーを入力してください。";

        // 機能ON/OFF
        const features = data.features || {};
        renderFeatureCheckboxes("features-customer", FEATURE_DEFS.customer, features);
        renderFeatureCheckboxes("features-admin", FEATURE_DEFS.admin, features);

        // ランクの数とランクの名前
        const rankCountEl = document.getElementById("rank-count");
        const rankNamesContainer = document.getElementById("rank-names-list");
        if (rankCountEl) {
            const count = Math.min(26, Math.max(1, parseInt(data.rankCount, 10) || 10));
            rankCountEl.value = count;
        }
        if (rankNamesContainer) {
            renderRankNamesList(rankNamesContainer, Math.min(26, Math.max(1, parseInt(data.rankCount, 10) || 10)), data.rankNames || {});
        }
        const rankCountInput = document.getElementById("rank-count");
        if (rankCountInput && rankNamesContainer) {
            rankCountInput.addEventListener("change", function () {
                const count = Math.min(26, Math.max(1, parseInt(this.value, 10) || 10));
                const current = {};
                ALL_RANK_IDS.forEach(id => {
                    const el = document.getElementById("rank-name-" + id);
                    if (el) current[id] = el.value.trim();
                });
                renderRankNamesList(rankNamesContainer, count, current);
            });
        }

        // 送料・カートお知らせ
        const cartNoticeEl = document.getElementById("cart-shipping-notice");
        if (cartNoticeEl) cartNoticeEl.value = data.cartShippingNotice || "";
        const defaultRuleEl = document.getElementById("shipping-rule-default");
        if (defaultRuleEl) defaultRuleEl.value = (data.shippingRules && data.shippingRules.default) ? data.shippingRules.default : "";
        renderShippingRulesList(data.shippingRules || {});

        // お知らせ
        announcementsData = data.announcements || [];
        renderAnnouncements();

        window.AdminSettingsDataFormats.loadDataFormatsTab(data.dataFormats);
    } catch (e) {
        console.error(e);
        if (typeof toastError === "function") toastError("設定の読み込みに失敗しました");
        else alert("設定の読み込みに失敗しました");
    }
}

function renderShippingRulesList(shippingRules) {
    const container = document.getElementById("shipping-rules-list");
    if (!container) return;
    const keys = Object.keys(shippingRules).filter(k => k !== "default");
    container.innerHTML = keys.map((maker, idx) => {
        const text = shippingRules[maker] || "";
        return `
            <div class="shipping-rule-row" data-index="${idx}" style="margin-bottom:15px; padding:12px; border:1px solid #ddd; border-radius:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label style="margin:0; font-weight:bold;">メーカー名</label>
                    <button type="button" class="btn-small btn-danger remove-shipping-rule">削除</button>
                </div>
                <input type="text" class="form-control shipping-rule-maker" value="${escapeHtml(maker)}" placeholder="例: RICOH, Canon" style="margin-bottom:8px;">
                <textarea class="form-control shipping-rule-text" rows="3" placeholder="送料規定のテキスト">${escapeHtml(text)}</textarea>
            </div>
        `;
    }).join("");
    container.querySelectorAll(".remove-shipping-rule").forEach(btn => {
        btn.addEventListener("click", function () {
            this.closest(".shipping-rule-row").remove();
        });
    });
}

function addShippingRuleRow(makerName, text) {
    const container = document.getElementById("shipping-rules-list");
    if (!container) return;
    const idx = container.querySelectorAll(".shipping-rule-row").length;
    const div = document.createElement("div");
    div.className = "shipping-rule-row";
    div.dataset.index = idx;
    div.style.cssText = "margin-bottom:15px; padding:12px; border:1px solid #ddd; border-radius:4px;";
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="margin:0; font-weight:bold;">メーカー名</label>
            <button type="button" class="btn-small btn-danger remove-shipping-rule">削除</button>
        </div>
        <input type="text" class="form-control shipping-rule-maker" value="${escapeHtml(makerName)}" placeholder="例: RICOH, Canon" style="margin-bottom:8px;">
        <textarea class="form-control shipping-rule-text" rows="3" placeholder="送料規定のテキスト">${escapeHtml(text)}</textarea>
    `;
    div.querySelector(".remove-shipping-rule").addEventListener("click", function () {
        this.closest(".shipping-rule-row").remove();
    });
    container.appendChild(div);
}

function collectShippingRulesData() {
    const defaultEl = document.getElementById("shipping-rule-default");
    const rules = {};
    if (defaultEl && defaultEl.value.trim()) rules.default = defaultEl.value.trim();
    const list = document.getElementById("shipping-rules-list");
    if (list) {
        list.querySelectorAll(".shipping-rule-row").forEach(row => {
            const makerInput = row.querySelector(".shipping-rule-maker");
            const textArea = row.querySelector(".shipping-rule-text");
            const maker = (makerInput && makerInput.value) ? makerInput.value.trim() : "";
            if (maker) rules[maker] = (textArea && textArea.value) ? textArea.value.trim() : "";
        });
    }
    return rules;
}

function renderFeatureCheckboxes(containerId, defs, features) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = defs.map(({ key, label }) => {
        const checked = features[key] !== false;
        return `
            <div class="feature-item">
                <input type="checkbox" id="feat-${key}" data-key="${key}" ${checked ? "checked" : ""}>
                <label for="feat-${key}" style="margin:0; cursor:pointer;">${label}</label>
            </div>
        `;
    }).join("");
}

async function saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById("btn-save");
    btn.disabled = true;

    const smtpPasswordEl = document.getElementById("smtpPassword");
    const smtpPassword = smtpPasswordEl.value;
    const isPasswordManagedByEnv = smtpPasswordEl.disabled;
    const mail = {
        orderNotifyTo: document.getElementById("orderNotifyTo").value.trim(),
        supportNotifyTo: document.getElementById("supportNotifyTo").value.trim(),
        from: document.getElementById("mailFrom").value.trim(),
        smtp: {
            host: document.getElementById("smtpHost").value.trim(),
            port: parseInt(document.getElementById("smtpPort").value, 10) || 587,
            secure: document.getElementById("smtpSecure").checked,
            user: document.getElementById("smtpUser").value.trim(),
            ...(isPasswordManagedByEnv ? {} : { password: smtpPassword })
        },
        templates: {
            orderSubject: document.getElementById("orderSubject").value.trim(),
            orderBody: document.getElementById("orderBody").value.trim(),
            supportSubject: document.getElementById("supportSubject").value.trim(),
            supportBody: document.getElementById("supportBody").value.trim(),
            inviteSubject: document.getElementById("inviteSubject").value.trim(),
            inviteBody: document.getElementById("inviteBody").value.trim(),
            passwordResetSubject: document.getElementById("passwordResetSubject").value.trim(),
            passwordResetBody: document.getElementById("passwordResetBody").value.trim(),
            passwordChangedSubject: document.getElementById("passwordChangedSubject").value.trim(),
            passwordChangedBody: document.getElementById("passwordChangedBody").value.trim()
        }
    };

    const features = {};
    document.querySelectorAll("[data-key]").forEach(el => {
        const key = el.dataset.key;
        if (key) features[key] = el.checked;
    });

    // お知らせデータを収集
    const announcements = collectAnnouncementsData();

    const recaptchaSiteKeyEl = document.getElementById("recaptchaSiteKey");
    const recaptchaSecretKeyEl = document.getElementById("recaptchaSecretKey");
    const recaptcha = {
        siteKey: recaptchaSiteKeyEl ? recaptchaSiteKeyEl.value.trim() : "",
        secretKey: recaptchaSecretKeyEl ? recaptchaSecretKeyEl.value : ""
    };

    const rankCountEl = document.getElementById("rank-count");
    const rankCount = rankCountEl ? Math.min(26, Math.max(1, parseInt(rankCountEl.value, 10) || 10)) : 10;
    const rankIds = ALL_RANK_IDS.slice(0, rankCount);
    const rankNames = {};
    rankIds.forEach(id => {
        const el = document.getElementById("rank-name-" + id);
        if (el) rankNames[id] = el.value.trim();
    });

    const shippingRules = collectShippingRulesData();
    const cartNoticeEl = document.getElementById("cart-shipping-notice");
    const cartShippingNotice = cartNoticeEl ? cartNoticeEl.value : "";
    const dataFormats = window.AdminSettingsDataFormats.collectDataFormats();
    const partial = {
        mail: { ...mail },
        features,
        announcements,
        recaptcha,
        rankCount,
        rankNames,
        shippingRules,
        cartShippingNotice,
        dataFormats
    };

    try {
        const res = await fetch("/api/admin/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(partial)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "保存に失敗しました");
        if (typeof toastSuccess === "function") toastSuccess("設定を保存しました");
        else alert("設定を保存しました");
    } catch (err) {
        if (typeof toastError === "function") toastError(err.message);
        else alert(err.message);
    } finally {
        btn.disabled = false;
    }
}

// =================================================================
// 📢 お知らせ管理機能
// =================================================================

function renderAnnouncements() {
    const container = document.getElementById("announcements-list");
    if (!container) return;

    if (announcementsData.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">お知らせがありません。右上の「新規追加」ボタンから追加してください。</p>';
        return;
    }

    container.innerHTML = announcementsData.map((ann, index) => {
        const typeColors = {
            info: { bg: "#d1ecf1", border: "#bee5eb", text: "#0c5460" },
            warning: { bg: "#fff3cd", border: "#ffeeba", text: "#856404" },
            error: { bg: "#f8d7da", border: "#f5c6cb", text: "#721c24" },
            success: { bg: "#d4edda", border: "#c3e6cb", text: "#155724" }
        };
        const colors = typeColors[ann.type] || typeColors.info;
        const startDate = ann.startDate ? new Date(ann.startDate).toLocaleString("ja-JP") : "即時表示";
        const endDate = ann.endDate ? new Date(ann.endDate).toLocaleString("ja-JP") : "無期限";
        const targetLabel = ann.target === "customer" ? "顧客向け" : ann.target === "admin" ? "管理画面向け" : "全員向け";
        const categoryLabel = (ann.category || "general") === "order" ? "📦 注文関連（バナー）" : "📄 一般（お知らせページ）";
        
        return `
            <div class="announcement-item" data-index="${index}" style="border-left: 4px solid ${colors.border};">
                <div class="announcement-item-header">
                    <h4 style="color: ${colors.text};">
                        ${ann.enabled ? "✅" : "❌"} ${ann.title || "（タイトルなし）"}
                        <span style="font-size: 0.85rem; font-weight: normal; color: #666; margin-left: 10px;">
                            [${categoryLabel}] [${targetLabel}] ${ann.type || "info"}
                        </span>
                    </h4>
                    <div class="announcement-controls">
                        <button type="button" class="btn-small btn-secondary" onclick="editAnnouncement(${index})">編集</button>
                        <button type="button" class="btn-small btn-danger" onclick="deleteAnnouncement(${index})">削除</button>
                    </div>
                </div>
                <div style="color: #555; margin-bottom: 8px;">
                    <strong>本文:</strong> ${ann.body || "（本文なし）"}
                </div>
                <div style="font-size: 0.85rem; color: #666;">
                    <strong>表示期間:</strong> ${startDate} 〜 ${endDate}
                    ${ann.linkUrl ? `<br><strong>リンク:</strong> <a href="${ann.linkUrl}" target="_blank">${ann.linkText || ann.linkUrl}</a>` : ""}
                </div>
                <div class="announcement-form" id="ann-form-${index}">
                    ${renderAnnouncementForm(ann, index)}
                </div>
            </div>
        `;
    }).join("");
}

function renderAnnouncementForm(ann, index) {
    const startDate = ann.startDate ? new Date(ann.startDate).toISOString().slice(0, 16) : "";
    const endDate = ann.endDate ? new Date(ann.endDate).toISOString().slice(0, 16) : "";
    
    return `
        <div class="form-group">
            <label>タイトル *</label>
            <input type="text" class="form-control" id="ann-title-${index}" value="${escapeHtml(ann.title || "")}" placeholder="例: 夏季休業のお知らせ">
        </div>
        <div class="form-group">
            <label>本文 *</label>
            <textarea class="form-control" id="ann-body-${index}" rows="3" placeholder="例: 8月13日〜16日は夏季休業のため、発送業務をお休みさせていただきます。">${escapeHtml(ann.body || "")}</textarea>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>カテゴリ</label>
                <select class="form-control" id="ann-category-${index}">
                    <option value="order" ${(ann.category || "general") === "order" ? "selected" : ""}>📦 注文関連（商品一覧・注文履歴ページのバナーに表示）</option>
                    <option value="general" ${(ann.category || "general") === "general" ? "selected" : ""}>📄 一般（お知らせページに表示）</option>
                </select>
            </div>
            <div class="form-group">
                <label>種類</label>
                <select class="form-control" id="ann-type-${index}">
                    <option value="info" ${ann.type === "info" ? "selected" : ""}>情報 (info)</option>
                    <option value="warning" ${ann.type === "warning" ? "selected" : ""}>警告 (warning)</option>
                    <option value="error" ${ann.type === "error" ? "selected" : ""}>エラー (error)</option>
                    <option value="success" ${ann.type === "success" ? "selected" : ""}>成功 (success)</option>
                </select>
            </div>
            <div class="form-group">
                <label>表示対象</label>
                <select class="form-control" id="ann-target-${index}">
                    <option value="all" ${ann.target === "all" || !ann.target ? "selected" : ""}>全員向け</option>
                    <option value="customer" ${ann.target === "customer" ? "selected" : ""}>顧客向け</option>
                    <option value="admin" ${ann.target === "admin" ? "selected" : ""}>管理画面向け</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="ann-enabled-${index}" ${ann.enabled !== false ? "checked" : ""}>
                    有効
                </label>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>開始日時（オプション）</label>
                <input type="datetime-local" class="form-control" id="ann-startDate-${index}" value="${startDate}">
                <span class="hint">空欄なら即時表示</span>
            </div>
            <div class="form-group">
                <label>終了日時（オプション）</label>
                <input type="datetime-local" class="form-control" id="ann-endDate-${index}" value="${endDate}">
                <span class="hint">空欄なら無期限</span>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>リンクURL（オプション）</label>
                <input type="url" class="form-control" id="ann-linkUrl-${index}" value="${escapeHtml(ann.linkUrl || "")}" placeholder="https://example.com">
            </div>
            <div class="form-group">
                <label>リンクテキスト（オプション）</label>
                <input type="text" class="form-control" id="ann-linkText-${index}" value="${escapeHtml(ann.linkText || "")}" placeholder="詳細を見る">
            </div>
        </div>
        <div style="margin-top: 10px;">
            <button type="button" class="btn-small btn-primary" onclick="saveAnnouncement(${index})">保存</button>
            <button type="button" class="btn-small btn-secondary" onclick="cancelEditAnnouncement(${index})">キャンセル</button>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function addAnnouncement() {
    const newAnn = {
        id: "ann_" + Date.now(),
        title: "",
        body: "",
        category: "general",
        type: "info",
        target: "all",
        enabled: true,
        startDate: null,
        endDate: null,
        linkUrl: "",
        linkText: ""
    };
    announcementsData.push(newAnn);
    renderAnnouncements();
    // 新規追加時は自動的に編集フォームを開く
    setTimeout(() => {
        const form = document.getElementById(`ann-form-${announcementsData.length - 1}`);
        if (form) {
            form.classList.add("active");
            document.getElementById(`ann-title-${announcementsData.length - 1}`)?.focus();
        }
    }, 100);
}

function editAnnouncement(index) {
    const form = document.getElementById(`ann-form-${index}`);
    if (form) {
        form.classList.toggle("active");
        if (form.classList.contains("active")) {
            document.getElementById(`ann-title-${index}`)?.focus();
        }
    }
}

function cancelEditAnnouncement(index) {
    const form = document.getElementById(`ann-form-${index}`);
    if (form) {
        form.classList.remove("active");
    }
    // データを再読み込みして編集内容を破棄
    loadSettings();
}

function saveAnnouncement(index) {
    const ann = announcementsData[index];
    if (!ann) return;

    const title = document.getElementById(`ann-title-${index}`)?.value.trim();
    const body = document.getElementById(`ann-body-${index}`)?.value.trim();
    
    if (!title || !body) {
        if (typeof toastError === "function") toastError("タイトルと本文は必須です");
        else alert("タイトルと本文は必須です");
        return;
    }

    ann.title = title;
    ann.body = body;
    ann.category = document.getElementById(`ann-category-${index}`)?.value || "general";
    ann.type = document.getElementById(`ann-type-${index}`)?.value || "info";
    ann.target = document.getElementById(`ann-target-${index}`)?.value || "all";
    ann.enabled = document.getElementById(`ann-enabled-${index}`)?.checked !== false;
    
    const startDate = document.getElementById(`ann-startDate-${index}`)?.value;
    ann.startDate = startDate ? new Date(startDate).toISOString() : null;
    
    const endDate = document.getElementById(`ann-endDate-${index}`)?.value;
    ann.endDate = endDate ? new Date(endDate).toISOString() : null;
    
    ann.linkUrl = document.getElementById(`ann-linkUrl-${index}`)?.value.trim() || "";
    ann.linkText = document.getElementById(`ann-linkText-${index}`)?.value.trim() || "";

    renderAnnouncements();
    if (typeof toastSuccess === "function") toastSuccess("お知らせを保存しました（画面上部の「設定を保存」ボタンで確定してください）");
}

function deleteAnnouncement(index) {
    if (!confirm("このお知らせを削除しますか？")) return;
    announcementsData.splice(index, 1);
    renderAnnouncements();
    if (typeof toastSuccess === "function") toastSuccess("お知らせを削除しました（画面上部の「設定を保存」ボタンで確定してください）");
}

function collectAnnouncementsData() {
    // お知らせ一覧のフォームから可能な限りDOMの値を反映（編集フォームの開閉に依存しない）
    announcementsData.forEach((ann, index) => {
        const titleEl = document.getElementById(`ann-title-${index}`);
        const bodyEl = document.getElementById(`ann-body-${index}`);
        if (titleEl && bodyEl) {
            const title = titleEl.value.trim();
            const body = bodyEl.value.trim();
            ann.title = title;
            ann.body = body;
            ann.category = document.getElementById(`ann-category-${index}`)?.value || "general";
            ann.type = document.getElementById(`ann-type-${index}`)?.value || "info";
            ann.target = document.getElementById(`ann-target-${index}`)?.value || "all";
            ann.enabled = document.getElementById(`ann-enabled-${index}`)?.checked !== false;
            const startDate = document.getElementById(`ann-startDate-${index}`)?.value;
            ann.startDate = startDate ? new Date(startDate).toISOString() : null;
            const endDate = document.getElementById(`ann-endDate-${index}`)?.value;
            ann.endDate = endDate ? new Date(endDate).toISOString() : null;
            ann.linkUrl = document.getElementById(`ann-linkUrl-${index}`)?.value.trim() || "";
            ann.linkText = document.getElementById(`ann-linkText-${index}`)?.value.trim() || "";
        }
    });
    return announcementsData;
}

// グローバルスコープに公開（HTMLのonclickから呼び出すため）
window.editAnnouncement = editAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.saveAnnouncement = saveAnnouncement;
window.cancelEditAnnouncement = cancelEditAnnouncement;
