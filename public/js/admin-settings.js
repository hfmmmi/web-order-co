/**
 * admin-settings.js
 * システム設定画面のロジック
 */

let announcementsData = [];

document.addEventListener("DOMContentLoaded", async function () {
    await loadAdminAccount();
    document.dispatchEvent(new CustomEvent("admin-settings-ready"));
    initTabs();
    initSettingsLinkboxes();
    activateSettingsTabFromQuery();
    document.getElementById("settings-form").addEventListener("submit", saveSettings);

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
        { key: "announcements", label: "一般お知らせ（メイン）" }
    ],
    admin: [
        { key: "adminKaitori", label: "買取査定" },
        { key: "adminOrders", label: "受注管理" },
        { key: "adminProducts", label: "商品管理" },
        { key: "adminCustomers", label: "顧客管理" },
        { key: "adminPrices", label: "価格・掛率設定" },
        { key: "adminSupport", label: "サポート" }
    ]
};

/** settings.json の mail.from（"表示名" <addr> または addr のみ）を画面用に分解 */
function parseMailFromField(raw) {
    const s = String(raw || "").trim();
    if (!s) return { displayName: "", address: "" };
    const m = s.match(/^(.+?)\s*<([^<>]+)>\s*$/);
    if (!m) return { displayName: "", address: s };
    let name = m[1].trim();
    if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
        name = name.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return { displayName: name, address: m[2].trim() };
}

/** 画面の2欄を nodemailer 向け mail.from 文字列に結合 */
function buildMailFromField(displayName, address) {
    const addr = String(address || "").trim();
    const name = String(displayName || "").trim();
    if (!addr) return "";
    if (!name) return addr;
    const q = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${q}" <${addr}>`;
}

function getActiveSettingsTabKey() {
    const activeBtn = document.querySelector(".tab-btn.active");
    return activeBtn ? activeBtn.dataset.tab || "" : "";
}

function isSettingsLinkboxMenuVisible(tabKey) {
    const section = document.querySelector('.settings-linkbox-section[data-settings-tab="' + tabKey + '"]');
    if (!section) return false;
    const detail = section.querySelector(".settings-linkbox-detail");
    return !!detail && detail.hasAttribute("hidden");
}

function syncSettingsFooter(tabKey) {
    const settingsFooter = document.querySelector(".settings-footer-actions");
    if (!settingsFooter) return;
    const hideFooter = tabKey === "stock" || tabKey === "prices" || isSettingsLinkboxMenuVisible(tabKey);
    settingsFooter.style.display = hideFooter ? "none" : "";
}

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            const tabKey = btn.dataset.tab || "";
            const tabId = "tab-" + tabKey;
            const panel = document.getElementById(tabId);
            if (panel) panel.classList.add("active");
            document.querySelectorAll(".settings-linkbox-section").forEach(showSettingsLinkboxMenu);
            syncSettingsFooter(tabKey);
        });
    });

    syncSettingsFooter(getActiveSettingsTabKey());
}

function showSettingsLinkboxMenu(section) {
    if (!section) return;
    const menu = section.querySelector(".settings-linkbox-menu");
    const detail = section.querySelector(".settings-linkbox-detail");
    if (menu) menu.removeAttribute("hidden");
    if (detail) detail.setAttribute("hidden", "");
    section.querySelectorAll(".settings-linkbox-panel").forEach(panel => {
        panel.classList.remove("active");
        panel.setAttribute("hidden", "");
    });
    const tabKey = section.dataset.settingsTab || "";
    if (getActiveSettingsTabKey() === tabKey) syncSettingsFooter(tabKey);
}

function showSettingsLinkboxDetail(section, panelKey, label) {
    if (!section) return;
    const menu = section.querySelector(".settings-linkbox-menu");
    const detail = section.querySelector(".settings-linkbox-detail");
    const titleEl = section.querySelector(".settings-linkbox-detail-title");
    const tabKey = section.dataset.settingsTab || "";
    if (menu) menu.setAttribute("hidden", "");
    if (detail) detail.removeAttribute("hidden");
    if (titleEl) titleEl.textContent = label || "";
    section.querySelectorAll(".settings-linkbox-panel").forEach(panel => {
        const isActive = panel.dataset.panel === panelKey;
        panel.classList.toggle("active", isActive);
        if (isActive) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
    });
    if (getActiveSettingsTabKey() === tabKey) syncSettingsFooter(tabKey);
    if (panelKey === "mail-history") {
        loadSettingsMailHistory();
    }
}

const SETTINGS_MAIL_HISTORY_PER_PAGE = 50;
let settingsMailHistoryPage = 1;

function escMailHistory(text) {
    if (typeof escapeHtml !== "undefined") return escapeHtml(text);
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatMailHistoryDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return y + "/" + mo + "/" + da + " " + h + ":" + mi;
}

function renderSettingsMailHistoryPagination(totalItems) {
    const paginationEl = document.getElementById("settings-mail-history-pagination");
    if (!paginationEl) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / SETTINGS_MAIL_HISTORY_PER_PAGE));
    paginationEl.innerHTML = "";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "前へ";
    prevBtn.disabled = settingsMailHistoryPage <= 1;
    prevBtn.addEventListener("click", () => {
        if (settingsMailHistoryPage > 1) {
            settingsMailHistoryPage -= 1;
            loadSettingsMailHistory();
        }
    });

    const label = document.createElement("span");
    label.textContent =
        settingsMailHistoryPage + " / " + totalPages + " （全 " + totalItems + " 件）";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "次へ";
    nextBtn.disabled = settingsMailHistoryPage >= totalPages;
    nextBtn.addEventListener("click", () => {
        if (settingsMailHistoryPage < totalPages) {
            settingsMailHistoryPage += 1;
            loadSettingsMailHistory();
        }
    });

    paginationEl.appendChild(prevBtn);
    paginationEl.appendChild(label);
    paginationEl.appendChild(nextBtn);
}

function renderSettingsMailHistoryRows(items) {
    const listBody = document.getElementById("settings-mail-history-list-body");
    if (!listBody) return;
    if (!items.length) {
        listBody.innerHTML =
            '<tr><td colspan="6" class="settings-mail-history-empty">送信履歴がありません</td></tr>';
        return;
    }
    listBody.innerHTML = items
        .map((row) => {
            const ok = row.success !== false;
            const statusClass = ok
                ? "settings-mail-history-status--ok"
                : "settings-mail-history-status--ng";
            const statusText = ok ? "成功" : "失敗";
            const title = ok ? "" : ' title="' + escMailHistory(row.errorMessage || "送信失敗") + '"';
            return (
                "<tr>" +
                "<td>" +
                escMailHistory(formatMailHistoryDateTime(row.at)) +
                "</td>" +
                "<td>" +
                escMailHistory(row.mailTypeLabel || row.mailType || "") +
                "</td>" +
                '<td class="settings-mail-history-subject">' +
                escMailHistory(row.subject || "") +
                "</td>" +
                "<td>" +
                escMailHistory(row.to || "") +
                "</td>" +
                "<td>" +
                escMailHistory(row.actorLabel || "") +
                "</td>" +
                '<td class="' +
                statusClass +
                '"' +
                title +
                ">" +
                escMailHistory(statusText) +
                "</td>" +
                "</tr>"
            );
        })
        .join("");
}

async function loadSettingsMailHistory() {
    const listBody = document.getElementById("settings-mail-history-list-body");
    const paginationEl = document.getElementById("settings-mail-history-pagination");
    if (!listBody) return;

    listBody.innerHTML =
        '<tr><td colspan="6" class="settings-mail-history-empty">読み込み中…</td></tr>';

    try {
        const params = new URLSearchParams({
            page: String(settingsMailHistoryPage),
            limit: String(SETTINGS_MAIL_HISTORY_PER_PAGE)
        });

        const fetchFn = typeof adminApiFetch === "function" ? adminApiFetch : fetch;
        const res = await fetchFn("/api/admin/mail-history?" + params.toString(), {
            credentials: "include"
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || "取得に失敗しました");
        }

        const totalItems = data.total || 0;
        renderSettingsMailHistoryRows(Array.isArray(data.items) ? data.items : []);
        renderSettingsMailHistoryPagination(totalItems);
    } catch (err) {
        console.error(err);
        listBody.innerHTML =
            '<tr><td colspan="6" class="settings-mail-history-empty">' +
            escMailHistory(err.message || "読み込みに失敗しました") +
            "</td></tr>";
        if (paginationEl) paginationEl.innerHTML = "";
    }
}

function initSettingsLinkboxes() {
    document.querySelectorAll(".settings-linkbox-section").forEach(section => {
        section.querySelectorAll(".settings-linkbox").forEach(btn => {
            btn.addEventListener("click", () => {
                const panelKey = btn.dataset.panel;
                if (!panelKey) return;
                const label = btn.textContent.trim();
                showSettingsLinkboxDetail(section, panelKey, label);
            });
        });
        const backBtn = section.querySelector(".settings-linkbox-back");
        if (backBtn) backBtn.addEventListener("click", () => showSettingsLinkboxMenu(section));
        showSettingsLinkboxMenu(section);
    });
}

function activateSettingsTabFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const tabKey = params.get("tab");
    if (!tabKey) return;
    const btn = document.querySelector('.tab-btn[data-tab="' + tabKey + '"]');
    if (btn) btn.click();
}

function renderRankNamesList(container, count, rankNamesData) {
    if (!container) return;
    const rankIds = ALL_RANK_IDS.slice(0, count);
    container.innerHTML = rankIds.map((id, i) => `
        <div class="form-group" style="margin-bottom:8px;">
            <label for="rank-name-${id}" style="min-width:24px;">${id}（ランク${i + 1}）</label>
            <input type="text" id="rank-name-${id}" class="form-control" placeholder="ランク${i + 1}" style="max-width:180px;">
        </div>
    `).join("");
    rankIds.forEach(id => {
        const el = document.getElementById("rank-name-" + id);
        if (el && rankNamesData[id] !== undefined) el.value = String(rankNamesData[id]);
    });
}

async function loadAdminAccount() {
    if (window.AdminSettingsUsers && window.AdminSettingsUsers.refreshAll) {
        await window.AdminSettingsUsers.refreshAll();
    }
}

/** 「設定を保存」と同時に呼ぶ。管理者アカウント欄が無い画面では何もしない */
async function persistAdminAccountFromForm() {
    if (window.AdminSettingsUsers && window.AdminSettingsUsers.persistSelfAccountFromForm) {
        await window.AdminSettingsUsers.persistSelfAccountFromForm();
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
        const fromParts = parseMailFromField(data.mail?.from || "");
        document.getElementById("mailFromDisplayName").value = fromParts.displayName;
        document.getElementById("mailFromAddress").value = fromParts.address;
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
            <div class="shipping-rule-row" data-index="${idx}">
                <div class="shipping-rule-row-head">
                    <label for="shipping-rule-maker-${idx}">メーカー名</label>
                    <button type="button" class="btn-small btn-danger remove-shipping-rule">削除</button>
                </div>
                <input type="text" id="shipping-rule-maker-${idx}" class="form-control shipping-rule-maker" value="${escapeHtml(maker)}" placeholder="例: RICOH, Canon">
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
    div.dataset.index = String(idx);
    div.innerHTML = `
        <div class="shipping-rule-row-head">
            <label for="shipping-rule-maker-new-${idx}">メーカー名</label>
            <button type="button" class="btn-small btn-danger remove-shipping-rule">削除</button>
        </div>
        <input type="text" id="shipping-rule-maker-new-${idx}" class="form-control shipping-rule-maker" value="${escapeHtml(makerName)}" placeholder="例: RICOH, Canon">
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
        from: buildMailFromField(
            document.getElementById("mailFromDisplayName").value,
            document.getElementById("mailFromAddress").value
        ),
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
// お知らせ管理機能
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
        const categoryLabel = (ann.category || "general") === "order" ? "注文関連（バナー）" : "一般（ホーム）";
        
        return `
            <div class="announcement-item" data-index="${index}" style="border-left: 4px solid ${colors.border};">
                <div class="announcement-item-header">
                    <h4 style="color: ${colors.text};">
                        ${ann.enabled ? '<span style="font-size:0.8rem;color:#15803d;margin-right:6px;">有効</span>' : '<span style="font-size:0.8rem;color:#b91c1c;margin-right:6px;">無効</span>'} ${ann.title || "（タイトルなし）"}
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
                    本文: ${ann.body || "（本文なし）"}
                </div>
                <div style="font-size: 0.85rem; color: #666;">
                    表示期間: ${startDate} 〜 ${endDate}
                    ${ann.linkUrl ? `<br>リンク: <a href="${ann.linkUrl}" target="_blank">${ann.linkText || ann.linkUrl}</a>` : ""}
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
                    <option value="order" ${(ann.category || "general") === "order" ? "selected" : ""}>注文関連（注文ページ・注文履歴ページのバナーに表示）</option>
                    <option value="general" ${(ann.category || "general") === "general" ? "selected" : ""}>一般（ホーム上部に表示）</option>
                </select>
            </div>
            <div class="form-group">
                <label>種類</label>
                <select class="form-control" id="ann-type-${index}">
                    <option value="info" ${ann.type === "info" ? "selected" : ""}>情報</option>
                    <option value="warning" ${ann.type === "warning" ? "selected" : ""}>警告</option>
                    <option value="error" ${ann.type === "error" ? "selected" : ""}>エラー</option>
                    <option value="success" ${ann.type === "success" ? "selected" : ""}>成功</option>
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
    if (typeof toastSuccess === "function") toastSuccess("お知らせを保存しました（画面上部の「保存」ボタンで確定してください）");
}

function deleteAnnouncement(index) {
    if (!confirm("このお知らせを削除しますか？")) return;
    announcementsData.splice(index, 1);
    renderAnnouncements();
    if (typeof toastSuccess === "function") toastSuccess("お知らせを削除しました（画面上部の「保存」ボタンで確定してください）");
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
