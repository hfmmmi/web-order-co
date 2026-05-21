function syncKaitoriGlobalNavOffset() {
    const nav = document.querySelector(".global-nav");
    if (!nav) return;
    document.body.style.setProperty("--kaitori-global-nav-offset", nav.offsetHeight + "px");
}

document.addEventListener("DOMContentLoaded", function () {
    syncKaitoriGlobalNavOffset();
    window.addEventListener("resize", syncKaitoriGlobalNavOffset);

    // =========================================
    // 1. DOM要素の取得
    // =========================================
    const productListContainer = document.getElementById("product-list-container");
    const searchInput = document.getElementById("search-input");
    const btnSearch = document.getElementById("btn-search"); // 追加
    const cartContainer = document.getElementById("cart-container");
    const totalPriceDisplay = document.getElementById("total-price-display");
    const btnPreSubmit = document.getElementById("btn-pre-submit");

    // タブ関連
    const tabItems = document.querySelectorAll(".tab-item");
    const viewSections = document.querySelectorAll(".view-section");
    // 履歴関連
    const historyContainer = document.getElementById("history-container");

    // 申込モーダル関連
    const modalLogistics = document.getElementById("modal-logistics");
    const sectionHyogo = document.getElementById("section-hyogo");
    const sectionOsaka = document.getElementById("section-osaka");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnFinalSubmit = document.getElementById("btn-final-submit");

    // 入力フィールド
    const inputHyogoBox = document.getElementById("hyogo-box-count");
    const inputOsakaBox = document.getElementById("osaka-box-count");
    const inputOsakaCarrier = document.getElementById("osaka-carrier");
    const inputOsakaCarrierOther = document.getElementById("osaka-carrier-other");
    const inputOsakaTracking = document.getElementById("osaka-tracking");
    const inputOsakaDate = document.getElementById("osaka-ship-date");

    // データ保持用
    let fullMasterData = [];
    let cart = {};
    let kaitoriHistoryList = [];
    const selectedKaitoriRequestIds = new Set();

    function kaitoriAttrEsc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");
    }

    function kaitoriPrintEsc(s) {
        if (typeof escapeHtml === "function") {
            return escapeHtml(String(s == null ? "" : s));
        }
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    const KAITORI_PRODUCTS_PER_PAGE = 15;
    let kaitoriFilteredList = [];
    let kaitoriProductPage = 1;

    function clearKaitoriProductPagination() {
        const el = document.getElementById("kaitori-pagination-container");
        if (el) el.innerHTML = "";
    }

    function getKaitoriVisiblePageNumbers(current, total, maxSlots = 5) {
        if (total <= maxSlots) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }
        const half = Math.floor(maxSlots / 2);
        let start = Math.max(1, current - half);
        let end = Math.min(total, start + maxSlots - 1);
        if (end - start + 1 < maxSlots) {
            start = Math.max(1, end - maxSlots + 1);
        }
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    function createKaitoriPaginationNavButton(label, pageNum) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "product-pagination__nav";
        btn.textContent = label;
        btn.addEventListener("click", () => {
            kaitoriProductPage = pageNum;
            renderProductListPage();
            const main = document.querySelector(".kaitori-main");
            if (main) main.scrollIntoView({ behavior: "smooth", block: "start" });
            else window.scrollTo({ top: 0, behavior: "smooth" });
        });
        return btn;
    }

    function setupKaitoriProductPagination(totalPages, currentPage) {
        const container = document.getElementById("kaitori-pagination-container");
        if (!container) return;

        container.innerHTML = "";

        if (!totalPages || totalPages <= 1) return;

        const current = Math.min(Math.max(1, currentPage), totalPages);
        const total = totalPages;

        if (current > 1) {
            container.appendChild(createKaitoriPaginationNavButton("前へ", current - 1));
        }

        getKaitoriVisiblePageNumbers(current, total, 5).forEach((p) => {
            if (p === current) {
                const cur = document.createElement("span");
                cur.className = "product-pagination__page is-current";
                cur.textContent = String(p);
                cur.setAttribute("aria-current", "page");
                container.appendChild(cur);
                return;
            }
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "product-pagination__page";
            btn.textContent = String(p);
            btn.addEventListener("click", () => {
                kaitoriProductPage = p;
                renderProductListPage();
                const main = document.querySelector(".kaitori-main");
                if (main) main.scrollIntoView({ behavior: "smooth", block: "start" });
                else window.scrollTo({ top: 0, behavior: "smooth" });
            });
            container.appendChild(btn);
        });

        if (current < total) {
            container.appendChild(createKaitoriPaginationNavButton("次へ", current + 1));
        }
    }

    function renderProductListPage() {
        if (!productListContainer) return;

        productListContainer.innerHTML = "";

        if (kaitoriFilteredList.length === 0) {
            clearKaitoriProductPagination();
            productListContainer.innerHTML = "<p class=\"kaitori-intro-muted\">該当なし</p>";
            return;
        }

        const totalPages = Math.max(1, Math.ceil(kaitoriFilteredList.length / KAITORI_PRODUCTS_PER_PAGE));
        if (kaitoriProductPage > totalPages) kaitoriProductPage = totalPages;
        if (kaitoriProductPage < 1) kaitoriProductPage = 1;

        const start = (kaitoriProductPage - 1) * KAITORI_PRODUCTS_PER_PAGE;
        const pageItems = kaitoriFilteredList.slice(start, start + KAITORI_PRODUCTS_PER_PAGE);

        pageItems.forEach(item => {
            const div = document.createElement("div");
            div.className = "product-card";
            let badgeHtml = item.destination === "兵庫"
                ? `<span class="kaitori-dest-badge kaitori-dest-badge--hyogo">兵庫</span>`
                : `<span class="kaitori-dest-badge kaitori-dest-badge--osaka">大阪</span>`;

            div.innerHTML = `
                <div class="product-card__info">
                    ${badgeHtml}
                    <div class="product-card__name">${item.maker} / ${item.name}</div>
                </div>
                <div class="product-card__qty-row">
                    <span class="product-card__unit-price">単価：¥${item.price.toLocaleString()}</span>
                    <input type="number" min="0" class="qty-input" data-id="${item.id}" value="${cart[item.id]||0}">
                    <span class="product-card__qty-unit">個</span>
                </div>`;

            div.querySelector(".qty-input").addEventListener("change", function() {
                const val = parseInt(this.value, 10);
                if (val > 0) cart[item.id] = val; else delete cart[item.id];
                updateCart();
            });
            productListContainer.appendChild(div);
        });

        setupKaitoriProductPagination(totalPages, kaitoriProductPage);
    }
    // 2. タブ切り替え制御
    // =========================================
    tabItems.forEach(tab => {
        tab.addEventListener("click", () => {
            // アクティブクラスの付け替え
            tabItems.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            // ビューの切り替え
            const targetId = tab.dataset.target;
            viewSections.forEach(sec => {
                sec.classList.remove("active");
                if (sec.id === targetId) sec.classList.add("active");
            });

            // 履歴タブを開いたらデータを更新
            if (targetId === "view-history") {
                fetchHistory();
            }
        });
    });

    // =========================================
    // 3. マスタ・カート機能
    // =========================================

    // マスタ取得
    async function fetchMaster() {
        try {
            // ★修正: /api を削除 (/kaitori-master)
            const res = await fetch("/kaitori-master");
            if (!res.ok) throw new Error("Network response was not ok");
            fullMasterData = await res.json();
            // データ整形
            fullMasterData = fullMasterData.map(d => ({
                ...d,
                destination: d.destination || "大阪"
            }));
            handleFilter(); 
        } catch (error) {
            console.error(error);
            clearKaitoriProductPagination();
            productListContainer.innerHTML = "<p class=\"kaitori-intro-muted\">データ読込失敗</p>";
        }
    }

    /**
     * 文字列の正規化（全角英数→半角、半角カナ→全角など）
     * これにより「ＡＢＣ」でも「ABC」でもヒットするようになる
     */
    function normalizeText(str) {
        if (!str) return "";
        // NFKC正規化: 全角英数→半角、半角カナ→全角に統一される強力なメソッド
        return str.normalize("NFKC").toLowerCase();
    }

    function formatKaitoriRequestDate(dateValue) {
        const d = new Date(dateValue);
        if (Number.isNaN(d.getTime())) return "-";
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return `${y}/${mo}/${da} ${h}:${mi}`;
    }

    function resolveHistoryStatus(status) {
        const s = status || "";
        if (s === "キャンセル(返却)" || s === "キャンセル(廃棄)") {
            return { label: "キャンセル", badgeClass: "st-cancel" };
        }
        if (s.includes("キャンセル")) {
            return { label: s, badgeClass: "st-cancel" };
        }
        if (s.includes("成立")) {
            return { label: s, badgeClass: "st-established" };
        }
        if (s.includes("査定中")) {
            return { label: s, badgeClass: "st-assessing" };
        }
        if (s.includes("保留")) {
            return { label: s, badgeClass: "st-hold" };
        }
        let badgeClass = "st-blue";
        if (s.includes("完了") || s.includes("済")) badgeClass = "st-green";
        if (s.includes("却下") || s.includes("不備")) badgeClass = "st-red";
        return { label: s, badgeClass };
    }

    // 検索
    function handleFilter() {
        const rawKeyword = searchInput ? searchInput.value : "";
        const keyword = normalizeText(rawKeyword); // 正規化して検索語とする

        const filtered = fullMasterData.filter(item => {
            // 比較対象（商品名・メーカー）も正規化して比較する
            const normName = normalizeText(item.name);
            const normMaker = normalizeText(item.maker);
            return normName.includes(keyword) || normMaker.includes(keyword);
        });
        kaitoriFilteredList = filtered;
        kaitoriProductPage = 1;
        renderProductListPage();
    }

    // ★イベントリスナー設定（Enter対応・ボタン対応）
    if(searchInput) {
        // 入力中のエンターキー監視
        searchInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault(); // フォーム送信などを防ぐ
                handleFilter();
            }
        });
    }

    if(btnSearch) {
        btnSearch.addEventListener("click", handleFilter);
    }

    // =========================================
    // 4. カート更新
    // =========================================
    function syncProductListQuantities() {
        if (!productListContainer) return;
        productListContainer.querySelectorAll(".qty-input").forEach(input => {
            const id = input.dataset.id;
            input.value = cart[id] || 0;
        });
    }

    function renderCartItemRow(entry) {
        const idAttr = String(entry.id).replace(/"/g, "&quot;");
        return `<li>
            <span class="cart-item-name">${entry.name}</span>
            <span class="cart-qty-wrap">
                <input type="number" min="0" class="cart-qty-input" data-id="${idAttr}" value="${entry.qty}" aria-label="数量">
                個
            </span>
        </li>`;
    }

    function updateCart() {
        let total = 0;
        const groups = { "兵庫": [], "大阪": [] };
        Object.keys(cart).forEach(id => {
            const item = fullMasterData.find(d => d.id === id);
            if (item) {
                const qty = cart[id];
                const sub = item.price * qty;
                total += sub;
                const dest = groups[item.destination] ? item.destination : "大阪";
                groups[dest].push({ id, name: item.name, qty, sub });
            }
        });

        let html = "";
        if (groups["兵庫"].length > 0) {
            html += `<div style="margin-bottom:15px; border-left:3px solid #D6E7F1; padding-left:10px;">
                        <div style="font-weight:normal; color:#374151; font-size:0.9rem;">兵庫センター行</div>
                        <ul style="padding-left:0; margin:6px 0; list-style:none;">`;
            groups["兵庫"].forEach(g => { html += renderCartItemRow(g); });
            html += `</ul></div>`;
        }
        if (groups["大阪"].length > 0) {
            html += `<div style="margin-bottom:15px; border-left:3px solid #9ca3af; padding-left:10px;">
                        <div style="font-weight:normal; color:#374151; font-size:0.9rem;">大阪センター行</div>
                        <ul style="padding-left:0; margin:6px 0; list-style:none;">`;
            groups["大阪"].forEach(g => { html += renderCartItemRow(g); });
            html += `</ul></div>`;
        }

        if (total === 0) html = "<p class=\"kaitori-intro-muted\">商品を選択してください</p>";
        cartContainer.innerHTML = html;

        cartContainer.querySelectorAll(".cart-qty-input").forEach(input => {
            input.addEventListener("change", function () {
                const id = this.dataset.id;
                const val = parseInt(this.value, 10);
                if (val > 0) cart[id] = val;
                else delete cart[id];
                syncProductListQuantities();
                updateCart();
            });
        });

        totalPriceDisplay.textContent = `合計: ¥${total.toLocaleString()}`;

        if (btnPreSubmit) {
            btnPreSubmit.disabled = (total === 0);
        }
        return groups;
    }

    function buildKaitoriHistoryDetailInnerHtml(item) {
        let logisticsHtml = "";
        if (item.logistics) {
            if (item.logistics.hyogo) {
                logisticsHtml += "<div>兵庫 / 回収： 梱包 " + kaitoriPrintEsc(item.logistics.hyogo.boxCount) + "個</div>";
            }
            if (item.logistics.osaka) {
                const os = item.logistics.osaka;
                logisticsHtml +=
                    '<div style="margin-top:6px;">大阪 / 発送： 梱包 ' +
                    kaitoriPrintEsc(os.boxCount) +
                    "個 / " +
                    kaitoriPrintEsc(os.carrier || "-") +
                    " / No." +
                    kaitoriPrintEsc(os.tracking || "-") +
                    "</div>";
            }
        }
        const noteHtml = item.customerNote
            ? '<div style="margin-top:8px;">事務局メッセージ： ' + kaitoriPrintEsc(item.customerNote) + "</div>"
            : "";
        const metaHtml =
            '<div style="margin-bottom:10px;font-size:0.9rem;">' +
            "<div>受付番号： " +
            kaitoriPrintEsc(item.requestId) +
            "</div>" +
            logisticsHtml +
            noteHtml +
            "</div>";

        let tableHtml =
            '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">' +
            "<thead><tr><th style=\"border:1px solid #ccc;padding:6px;\">商品名</th>" +
            "<th style=\"border:1px solid #ccc;padding:6px;\">単価</th>" +
            "<th style=\"border:1px solid #ccc;padding:6px;\">個数</th>" +
            "<th style=\"border:1px solid #ccc;padding:6px;text-align:right;\">小計</th></tr></thead><tbody>";
        let grandTotal = 0;
        if (item.items && Array.isArray(item.items)) {
            item.items.forEach(function (itm) {
                const sub = itm.subtotal || itm.price * itm.qty;
                grandTotal += sub;
                const destTag = itm.destination === "兵庫" ? "[兵庫] " : "[大阪] ";
                tableHtml +=
                    "<tr><td style=\"border:1px solid #ccc;padding:6px;\">" +
                    kaitoriPrintEsc(destTag + (itm.name || "")) +
                    "</td><td style=\"border:1px solid #ccc;padding:6px;\">¥" +
                    (itm.price || 0).toLocaleString() +
                    "</td><td style=\"border:1px solid #ccc;padding:6px;\">" +
                    kaitoriPrintEsc(itm.qty) +
                    '</td><td style="border:1px solid #ccc;padding:6px;text-align:right;">¥' +
                    sub.toLocaleString() +
                    "</td></tr>";
            });
        }
        tableHtml +=
            "</tbody></table>" +
            '<div style="text-align:right;font-weight:700;margin-top:8px;">合計査定額： ¥' +
            grandTotal.toLocaleString() +
            "</div>";
        return metaHtml + tableHtml;
    }

    function collectSelectedKaitoriHistory() {
        if (selectedKaitoriRequestIds.size === 0) return [];
        const idSet = selectedKaitoriRequestIds;
        return kaitoriHistoryList.filter(function (item) {
            return idSet.has(String(item.requestId != null ? item.requestId : ""));
        });
    }

    function buildKaitoriHistoryPrintHtml(items, includeToolbar) {
        const toolbar = includeToolbar !== false
            ? '<div class="no-print" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:12px 16px;background:#1f2937;color:#fff;margin:-12px -16px 20px;position:sticky;top:0;z-index:10;">' +
              '<button type="button" onclick="window.print()" style="padding:8px 18px;font-weight:700;border:none;background:#3b82f6;color:#fff;cursor:pointer;">この内容を印刷</button>' +
              '<span style="font-size:0.82rem;opacity:0.9;">ブラウザの印刷ダイアログでプリンタを選べます</span>' +
              "</div>"
            : "";
        const style =
            "<style>*{box-sizing:border-box;}body{font-family:'Noto Sans JP',system-ui,sans-serif;margin:0;padding:12px 16px 24px;font-size:12px;color:#111;}" +
            ".kaitori-print-block{border:2px solid #111;padding:14px 16px;margin:0 0 20px;}" +
            ".kaitori-print-block h1{margin:0 0 12px;font-size:1.2rem;border-bottom:2px solid #111;padding-bottom:6px;}" +
            "@media print{.no-print{display:none!important;}.kaitori-print-block{page-break-after:always;}.kaitori-print-block:last-of-type{page-break-after:auto;}}</style>";
        const blocks = items.map(function (item) {
            const dateStr = formatKaitoriRequestDate(item.requestDate);
            const statusInfo = resolveHistoryStatus(item.status);
            return (
                '<article class="kaitori-print-block"><h1>空カートリッジ買取 申請内容</h1>' +
                "<p><strong>申請日時：</strong> " +
                kaitoriPrintEsc(dateStr) +
                " · <strong>ステータス：</strong> " +
                kaitoriPrintEsc(statusInfo.label) +
                "</p>" +
                buildKaitoriHistoryDetailInnerHtml(item) +
                "</article>"
            );
        });
        return (
            "<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"UTF-8\"><title>申請内容印刷</title>" +
            style +
            "</head><body>" +
            toolbar +
            blocks.join("") +
            "</body></html>"
        );
    }

    function openKaitoriHistorySaveWindow(items, options) {
        options = options || {};
        const format = options.format === "png" ? "png" : "pdf";
        const preview = options.preview !== false;
        const html = buildKaitoriHistoryPrintHtml(items, false);
        if (!window.PrintDocumentSave) {
            if (window.toastError) window.toastError("保存機能の読み込みに失敗しました");
            return;
        }
        window.PrintDocumentSave.openSavePreview(html, {
            filePrefix: "kaitori-history",
            format: format,
            preview: preview
        });
    }

    function openKaitoriHistoryPrintWindow(items) {
        const html = buildKaitoriHistoryPrintHtml(items, true);
        let blobUrl = null;
        try {
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            blobUrl = URL.createObjectURL(blob);
        } catch (err) {
            console.error(err);
            if (window.toastError) window.toastError("印刷用ページの生成に失敗しました");
            return;
        }
        const newTab = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!newTab) {
            URL.revokeObjectURL(blobUrl);
            if (window.toastError) window.toastError("新しいタブで開けませんでした（ポップアップを許可してください）");
            return;
        }
        setTimeout(function () {
            try {
                URL.revokeObjectURL(blobUrl);
            } catch (e) { /* noop */ }
        }, 300000);
    }

    function syncKaitoriHistorySelectAll(table) {
        const selectAll = table.querySelector(".kaitori-history-select-all");
        if (!selectAll) return;
        const boxes = Array.from(table.querySelectorAll(".kaitori-history-row-select"));
        const n = boxes.length;
        const checked = boxes.filter(function (b) {
            return b.checked;
        }).length;
        selectAll.checked = n > 0 && checked === n;
        selectAll.indeterminate = checked > 0 && checked < n;
    }

    function attachKaitoriHistorySelectionHandlers() {
        if (!historyContainer) return;
        const table = historyContainer.querySelector(".history-table");
        if (!table) return;

        table.querySelectorAll(".kaitori-history-row-select").forEach(function (ch) {
            const id = ch.getAttribute("data-request-id");
            ch.checked = id !== "" && selectedKaitoriRequestIds.has(String(id));
            ch.addEventListener("click", function (e) {
                e.stopPropagation();
            });
            ch.addEventListener("change", function (e) {
                e.stopPropagation();
                const key = ch.getAttribute("data-request-id");
                if (!key) return;
                if (ch.checked) selectedKaitoriRequestIds.add(String(key));
                else selectedKaitoriRequestIds.delete(String(key));
                syncKaitoriHistorySelectAll(table);
            });
        });

        const selectAll = table.querySelector(".kaitori-history-select-all");
        if (selectAll) {
            selectAll.addEventListener("change", function () {
                const on = selectAll.checked;
                table.querySelectorAll(".kaitori-history-row-select").forEach(function (ch) {
                    const key = ch.getAttribute("data-request-id");
                    if (!key) return;
                    ch.checked = on;
                    if (on) selectedKaitoriRequestIds.add(String(key));
                    else selectedKaitoriRequestIds.delete(String(key));
                });
                selectAll.indeterminate = false;
            });
            syncKaitoriHistorySelectAll(table);
        }
    }

    /**
     * いずれかの詳細が開いているとき、詳細が閉じている申請の要約行だけ薄くする（注文履歴と同様）。
     */
    function syncKaitoriHistorySummaryRowDimming(tbody) {
        if (!tbody) return;
        let anyOpen = false;
        tbody.querySelectorAll(".history-detail-row").forEach(function (detTr) {
            if (detTr.classList.contains("open")) {
                anyOpen = true;
            }
        });
        tbody.querySelectorAll(".history-main-row").forEach(function (mainTr) {
            const detTr = mainTr.nextElementSibling;
            const pairOpen =
                detTr &&
                detTr.classList.contains("history-detail-row") &&
                detTr.classList.contains("open");
            mainTr.classList.toggle("history-main-row--dimmed", anyOpen && !pairOpen);
            mainTr.classList.toggle("history-main-row--detail-open", pairOpen);
        });
    }

    function attachKaitoriHistoryRowToggleHandlers() {
        document.querySelectorAll(".history-main-row").forEach(function (row) {
            row.addEventListener("click", function (e) {
                if (e.target.closest(".col-select")) return;
                const reqId = this.dataset.id;
                const detailRow = document.getElementById("detail-" + reqId);
                if (!detailRow) return;
                this.classList.toggle("active");
                detailRow.classList.toggle("open");
                const tbody = this.closest("tbody");
                if (tbody) syncKaitoriHistorySummaryRowDimming(tbody);
            });
        });
    }

    function closeAllKaitoriHistoryDetails() {
        document.querySelectorAll(".history-detail-row.open").forEach(function (row) {
            row.classList.remove("open");
        });
        document.querySelectorAll(".history-main-row.active").forEach(function (row) {
            row.classList.remove("active");
        });
        if (historyContainer) {
            historyContainer.querySelectorAll(".history-table tbody").forEach(syncKaitoriHistorySummaryRowDimming);
        }
    }

    function setupKaitoriMoreMenu() {
        const btnMore = document.getElementById("kaitori-btn-more");
        const moreMenu = document.getElementById("kaitori-more-menu");
        const btnPrint = document.getElementById("kaitori-btn-print-selected");
        const btnSave = document.getElementById("kaitori-btn-save-selected");
        const btnCloseAll = document.getElementById("kaitori-btn-close-all-details");
        const saveModal = document.getElementById("kaitori-save-slip-modal");
        const saveBackdrop = document.getElementById("kaitori-save-slip-modal-backdrop");
        const saveCancel = document.getElementById("kaitori-save-slip-modal-cancel");
        const saveSubmit = document.getElementById("kaitori-save-slip-modal-submit");

        function setKaitoriMoreMenuOpen(open) {
            if (!moreMenu || !btnMore) return;
            moreMenu.classList.toggle("is-open", open);
            moreMenu.setAttribute("aria-hidden", open ? "false" : "true");
            btnMore.setAttribute("aria-expanded", open ? "true" : "false");
        }

        function setKaitoriSaveModalOpen(open) {
            if (!saveModal) return;
            saveModal.classList.toggle("is-open", open);
            saveModal.setAttribute("aria-hidden", open ? "false" : "true");
        }

        if (btnMore && moreMenu) {
            btnMore.addEventListener("click", function (e) {
                e.stopPropagation();
                setKaitoriMoreMenuOpen(!moreMenu.classList.contains("is-open"));
            });
        }

        document.addEventListener("click", function () {
            setKaitoriMoreMenuOpen(false);
        });

        if (moreMenu) {
            moreMenu.addEventListener("click", function (e) {
                e.stopPropagation();
            });
        }

        if (btnPrint) {
            btnPrint.addEventListener("click", function (e) {
                e.stopPropagation();
                if (selectedKaitoriRequestIds.size === 0) {
                    if (window.toastWarning) window.toastWarning("チェックした申請がありません");
                    else alert("チェックした申請がありません");
                    return;
                }
                const selected = collectSelectedKaitoriHistory();
                if (selected.length === 0) {
                    if (window.toastWarning) window.toastWarning("選択した申請が見つかりません。一覧を再読み込みしてください。");
                    return;
                }
                setKaitoriMoreMenuOpen(false);
                openKaitoriHistoryPrintWindow(selected);
            });
        }

        if (btnSave) {
            btnSave.addEventListener("click", function (e) {
                e.stopPropagation();
                if (selectedKaitoriRequestIds.size === 0) {
                    if (window.toastWarning) window.toastWarning("チェックした申請がありません");
                    else alert("チェックした申請がありません");
                    return;
                }
                setKaitoriMoreMenuOpen(false);
                setKaitoriSaveModalOpen(true);
            });
        }

        if (saveBackdrop) {
            saveBackdrop.addEventListener("click", function () {
                setKaitoriSaveModalOpen(false);
            });
        }
        if (saveCancel) {
            saveCancel.addEventListener("click", function () {
                setKaitoriSaveModalOpen(false);
            });
        }
        if (saveSubmit && saveModal) {
            saveSubmit.addEventListener("click", function (e) {
                e.stopPropagation();
                const selected = collectSelectedKaitoriHistory();
                if (selected.length === 0) {
                    if (window.toastWarning) window.toastWarning("選択した申請が見つかりません。一覧を再読み込みしてください。");
                    return;
                }
                const formatInput = saveModal.querySelector('input[name="kaitori-save-slip-format"]:checked');
                const previewInput = saveModal.querySelector('input[name="kaitori-save-slip-preview"]:checked');
                const format = formatInput && formatInput.value === "png" ? "png" : "pdf";
                const preview = !previewInput || previewInput.value === "preview";
                setKaitoriSaveModalOpen(false);
                openKaitoriHistorySaveWindow(selected, { format: format, preview: preview });
            });
        }
        if (saveModal) {
            saveModal.querySelector(".kaitori-print-modal__dialog")?.addEventListener("click", function (e) {
                e.stopPropagation();
            });
        }

        if (btnCloseAll) {
            btnCloseAll.addEventListener("click", function (e) {
                e.stopPropagation();
                setKaitoriMoreMenuOpen(false);
                closeAllKaitoriHistoryDetails();
            });
        }
    }

    // =========================================
    // 5. 履歴表示 (Secure View)
    // =========================================

    async function fetchHistory() {
        if (!historyContainer) return;
        historyContainer.innerHTML = "<p class=\"kaitori-intro-muted\">読み込み中...</p>";
        try {
            // ★修正: /api を削除 (/my-kaitori-history)
            const res = await fetch("/my-kaitori-history");
            if (!res.ok) return;
            const list = await res.json();
            kaitoriHistoryList = Array.isArray(list) ? list : [];

            if (kaitoriHistoryList.length === 0) {
                historyContainer.innerHTML = "<p class=\"kaitori-intro-muted\">履歴はありません。</p>";
                return;
            }

            // テーブルヘッダー
            let html = `<table class="history-table">
                <thead>
                    <tr>
                        <th scope="col" class="col-select">
                            <input type="checkbox" class="kaitori-history-select-all" aria-label="すべて選択">
                        </th>
                        <th style="width:140px;">申請日時</th>
                        <th>申請内容</th>
                        <th style="width:100px;">ステータス</th>
                        <th style="width:60px;">点数</th>
                        <th style="width:40px;"></th>
                    </tr>
                </thead>
                <tbody>`;
            
            kaitoriHistoryList.forEach((item) => {
                const dateStr = formatKaitoriRequestDate(item.requestDate);
                const { label: statusLabel, badgeClass } = resolveHistoryStatus(item.status);
                const totalQty = item.items ? item.items.reduce((sum, i) => sum + (i.qty || 0), 0) : 0;

                // 頭出しの作成
                let summary = "-";
                if (item.items && item.items.length > 0) {
                    const first = item.items[0];
                    summary = `<span style="font-weight:normal; color:#111827;">${first.name}</span>`;
                    if (item.items.length > 1) {
                        summary += ` <span style="font-size:0.8rem; color:#6b7280;">...他 ${item.items.length - 1}種</span>`;
                    }
                }

                // === 詳細コンテンツのHTML構築 ===
                // 1. 物流情報
                let logisticsHtml = "";
                if (item.logistics) {
                    if (item.logistics.hyogo) {
                        logisticsHtml += `<div>兵庫 / 回収： 梱包 ${item.logistics.hyogo.boxCount}個</div>`;
                    }
                    if (item.logistics.osaka) {
                        const os = item.logistics.osaka;
                        logisticsHtml += `<div style="margin-top:6px;">大阪 / 発送： 梱包 ${os.boxCount}個 / ${os.carrier || "-"} / No.${os.tracking || "-"}</div>`;
                    }
                }
                
                const noteHtml = item.customerNote 
                    ? `<div style="color:#374151; margin-top:8px; background:#f9fafb; padding:10px 12px; border-radius:8px; border:1px solid #e5e7eb; border-left:3px solid #D6E7F1;">
                         事務局メッセージ： ${item.customerNote}
                       </div>` 
                    : "";

                const metaHtml = `
                    <div style="margin-bottom:10px; font-size:0.9rem;">
                        <div style="margin-bottom:5px;">受付番号： ${item.requestId}</div>
                        ${logisticsHtml}
                        ${noteHtml}
                    </div>
                `;

                // 2. アイテムリスト
                let tableHtml = `<table class="detail-table">
                    <thead><tr><th>商品名</th><th>単価</th><th>個数</th><th style="text-align:right;">小計</th></tr></thead>
                    <tbody>`;
                
                let grandTotal = 0;
                if (item.items && Array.isArray(item.items)) {
                    item.items.forEach(itm => {
                        const sub = itm.subtotal || (itm.price * itm.qty);
                        grandTotal += sub;
                        const destTag = itm.destination === "兵庫" ? '<span style="color:#6b7280; font-size:0.8rem; font-weight:normal;">[兵庫]</span>' : '<span style="color:#6b7280; font-size:0.8rem; font-weight:normal;">[大阪]</span>';
                        tableHtml += `<tr>
                            <td>${destTag} ${itm.name}</td>
                            <td>¥${itm.price.toLocaleString()}</td>
                            <td>${itm.qty}</td>
                            <td style="text-align:right;">¥${sub.toLocaleString()}</td>
                        </tr>`;
                    });
                }
                tableHtml += `</tbody></table>
                    <div class="detail-total">合計査定額： ¥${grandTotal.toLocaleString()}</div>`;


                const reqIdEsc = kaitoriAttrEsc(String(item.requestId != null ? item.requestId : ""));

                // === 行セットの追加 (親行 + 子行) ===
                html += `<tr class="history-main-row" data-id="${item.requestId}">
                    <td class="col-select">
                        <input type="checkbox" class="kaitori-history-row-select" data-request-id="${reqIdEsc}" aria-label="この申請を選択">
                    </td>
                    <td class="history-date-cell">${dateStr}</td>
                    <td>${summary}</td>
                    <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td>${totalQty}点</td>
                    <td style="text-align:center;"><span class="toggle-icon">▼</span></td>
                </tr>`;
                
                html += `<tr class="history-detail-row" id="detail-${item.requestId}">
                    <td colspan="6" style="padding:0; border:none;">
                        <div class="detail-content-wrapper">
                            ${metaHtml}
                            ${tableHtml}
                        </div>
                    </td>
                </tr>`;
            });

            html += `</tbody></table>`;
            historyContainer.innerHTML = html;

            attachKaitoriHistorySelectionHandlers();
            attachKaitoriHistoryRowToggleHandlers();

        } catch (error) {
            console.error("History error", error);
            historyContainer.innerHTML = "<p class=\"kaitori-intro-muted\">読み込みエラー</p>";
        }
    }
    // =========================================
    // 6. 申込モーダル制御
    // =========================================

    if(inputOsakaCarrier) {
        inputOsakaCarrier.addEventListener("change", function() {
            if(this.value === "その他") {
                inputOsakaCarrierOther.style.display = "block";
            } else {
                inputOsakaCarrierOther.style.display = "none";
            }
        });
    }

    if(btnPreSubmit) {
        btnPreSubmit.addEventListener("click", () => {
            const groups = updateCart();
            sectionHyogo.style.display = "none";
            sectionOsaka.style.display = "none";
            if(groups["兵庫"].length > 0) sectionHyogo.style.display = "block";
            if(groups["大阪"].length > 0) sectionOsaka.style.display = "block";
            modalLogistics.style.display = "flex";
        });
    }

    if(btnCancel) {
        btnCancel.addEventListener("click", () => {
            modalLogistics.style.display = "none";
        });
    }

    if(btnFinalSubmit) {
        btnFinalSubmit.addEventListener("click", async () => {
            const groups = updateCart();
            
            // バリデーション
            if(groups["兵庫"].length > 0) {
                if(!inputHyogoBox.value) { toastWarning("兵庫行きの梱包個数を入力してください"); return; }
            }
            if (groups["大阪"].length > 0) {
                if (!inputOsakaBox.value) { toastWarning("大阪行きの梱包個数を入力してください"); return; }
            }

            if (!confirm("この内容で確定しますか？")) return;

            let carrierName = inputOsakaCarrier.value;
            if (carrierName === "その他") carrierName = inputOsakaCarrierOther.value.trim();

            const itemsToSend = Object.keys(cart).map(id => {
                const item = fullMasterData.find(d => d.id === id);
                return {
                    id: item.id,
                    maker: item.maker,
                    name: item.name,
                    price: item.price,
                    qty: cart[id],
                    subtotal: item.price * cart[id],
                    destination: item.destination 
                };
            });

            const logisticsData = {
                hyogo: groups["兵庫"].length > 0 ? {
                    boxCount: inputHyogoBox.value,
                    status: "回収手配待ち"
                } : null,
                osaka: groups["大阪"].length > 0 ? {
                    boxCount: inputOsakaBox.value,
                    carrier: carrierName,
                    tracking: inputOsakaTracking.value,
                    shipDate: inputOsakaDate.value,
                    status: "着荷待ち"
                } : null
            };

            try {
                btnFinalSubmit.disabled = true;
                btnFinalSubmit.textContent = "送信中...";

                // ★修正: /api を削除 (/kaitori-request)
                const res = await fetch("/kaitori-request", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: itemsToSend, logistics: logisticsData, note: "" })
                });

                const result = await res.json();

                if (result.success) {
                    toastSuccess(`申請完了！ 受付番号: ${result.requestId}`, 4000);
                    // リセット処理
                    cart = {}; 
                    updateCart(); 
                    searchInput.value = ""; // 検索窓クリア
                    handleFilter();
                    modalLogistics.style.display = "none";
                    inputHyogoBox.value = "";
                    inputOsakaBox.value = "";
                    inputOsakaCarrier.value = "";
                    inputOsakaCarrierOther.value = "";
                    inputOsakaTracking.value = "";
                    inputOsakaDate.value = "";
                    inputOsakaCarrierOther.style.display = "none";

                    // 履歴タブへ移動して更新
                    tabItems[1].click(); 
                    
                } else {
                    toastError("エラー: " + (result.message || "不明なエラー"));
                }
            } catch (err) {
                console.error(err);
                toastError("通信エラー");
            } finally {
                btnFinalSubmit.disabled = false;
                btnFinalSubmit.textContent = "申請を確定する";
            }
        });
    }

    setupKaitoriMoreMenu();

    // 初期化
    fetchMaster();
});