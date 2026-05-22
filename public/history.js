let allOrders = []; // 検索用に全データをここに保持しておく

function escapeHistoryHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 受注管理（admin-orders.js）と同じ正規化（全角英数→半角・小文字化） */
function normalizeString(str) {
    if (!str) return "";
    return str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
        })
        .toLowerCase();
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            func.apply(context, args);
        }, wait);
    };
}

function setupHistoryClearButton(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener("click", function () {
        input.value = "";
        input.focus();
        input.dispatchEvent(new Event("input"));
    });
    btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            btn.click();
        }
    });
}

function extractHistoryLeadingCode(str) {
    const match = str.match(/^\((.+?)\)/);
    return match && match[1] ? match[1].trim() : null;
}

function orderMatchesHistoryKeyword(order, rawSearchVal, searchKeyword, leadingCodeRaw) {
    if (!searchKeyword) return true;
    const safeId = String(order.customerId || "");
    const safeName = order.customerName || "";
    if (leadingCodeRaw) {
        if (safeId === leadingCodeRaw) return true;
        if (String(order.orderId ?? "") === leadingCodeRaw) return true;
        if (order.items) {
            return order.items.some(function (item) {
                return item.code === leadingCodeRaw;
            });
        }
        return false;
    }
    const orderIdNorm = normalizeString(String(order.orderId ?? ""));
    if (orderIdNorm.includes(searchKeyword)) return true;
    const custBlob = normalizeString(safeId + " " + safeName);
    if (custBlob.includes(searchKeyword)) return true;
    if (order.items) {
        const hitItem = order.items.some(function (item) {
            return normalizeString((item.code || "") + " " + (item.name || "")).includes(searchKeyword);
        });
        if (hitItem) return true;
    }
    const info = order.deliveryInfo || {};
    const ship = info.shipper || {};
    const extra = normalizeString(
        (info.name || "") +
            " " +
            (info.address || "") +
            " " +
            (info.note || "") +
            " " +
            (info.zip || "") +
            " " +
            (info.tel || "") +
            " " +
            (ship.name || "") +
            " " +
            (ship.address || "")
    );
    if (extra.includes(searchKeyword)) return true;
    return false;
}

/** ツールバー条件で allOrders を絞り込む（受注管理の computeFilteredOrders に準拠＋納品先・荷主テキスト） */
function computeFilteredHistoryOrders() {
    const statusSelect = document.querySelector("#history-order-status-filter");
    const dateStartInput = document.querySelector("#history-filter-date-start");
    const dateEndInput = document.querySelector("#history-filter-date-end");
    const searchTextInput = document.querySelector("#history-order-search-text");

    const status = statusSelect ? statusSelect.value : "";
    const start = dateStartInput ? dateStartInput.value : "";
    const end = dateEndInput ? dateEndInput.value : "";
    const rawSearchVal = searchTextInput ? searchTextInput.value : "";
    const searchKeyword = normalizeString(rawSearchVal);
    const leadingCodeRaw = extractHistoryLeadingCode(rawSearchVal);

    return allOrders.filter(function (order) {
        if (status) {
            const orderSt = order.status || "未発送";
            if (orderSt !== status) return false;
        }

        if (start || end) {
            const d = new Date(order.orderDate);
            const jstTime = d.getTime() + 9 * 60 * 60 * 1000;
            const jstDateObj = new Date(jstTime);
            const orderDateJST = jstDateObj.toISOString().split("T")[0];
            if (start && orderDateJST < start) return false;
            if (end && orderDateJST > end) return false;
        }

        if (!orderMatchesHistoryKeyword(order, rawSearchVal, searchKeyword, leadingCodeRaw)) return false;
        return true;
    });
}

function execHistoryClientSearch(options) {
    const container = document.querySelector("#history-list-container");
    if (!container) return;
    const filtered = computeFilteredHistoryOrders();
    const keepPage = options && options.keepPage;
    historyListContainerEl = container;
    historyViewOrders = filtered;
    if (keepPage) {
        const totalPages = Math.max(1, Math.ceil(historyViewOrders.length / HISTORY_PER_PAGE));
        if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
        if (historyCurrentPage < 1) historyCurrentPage = 1;
        renderHistoryPage();
    } else {
        historyCurrentPage = 1;
        renderHistoryPage();
    }
}

/** 受注管理（admin-orders-view）と同じく注文日を YYYY/MM/DD（JST 日付）で表示 */
function formatHistoryOrderDateYmdSlash(orderDate) {
    const d = new Date(orderDate);
    if (Number.isNaN(d.getTime())) return "—";
    const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
    const x = new Date(jstMs);
    const y = x.getUTCFullYear();
    const m = String(x.getUTCMonth() + 1).padStart(2, "0");
    const day = String(x.getUTCDate()).padStart(2, "0");
    return y + "/" + m + "/" + day;
}

/** 1ページあたりの表示件数（商品一覧のページ送りと同型UI） */
const HISTORY_PER_PAGE = 25;
/** 現在表示している注文配列（全件または検索結果） */
let historyViewOrders = [];
let historyCurrentPage = 1;
/** 最後に renderHistoryList に渡したリスト用コンテナ（ページ切替で再利用） */
let historyListContainerEl = null;

function clearHistoryPagination() {
    const pag = document.querySelector("#pagination-container");
    if (pag) pag.innerHTML = "";
}

/** 商品一覧 products.js と同じ窓表示ロジック */
function getHistoryVisiblePageNumbers(current, total, maxSlots = 5) {
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

function createHistoryPaginationNavButton(label, pageNum) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "product-pagination__nav";
    btn.textContent = label;
    btn.addEventListener("click", () => {
        historyCurrentPage = pageNum;
        renderHistoryPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return btn;
}

function setupHistoryPagination(totalPages, currentPage) {
    const container = document.querySelector("#pagination-container");
    if (!container) return;

    container.innerHTML = "";

    if (!totalPages || totalPages <= 1) return;

    const current = Math.min(Math.max(1, currentPage), totalPages);
    const total = totalPages;

    if (current > 1) {
        container.appendChild(createHistoryPaginationNavButton("前へ", current - 1));
    }

    getHistoryVisiblePageNumbers(current, total, 5).forEach((p) => {
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
            historyCurrentPage = p;
            renderHistoryPage();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        container.appendChild(btn);
    });

    if (current < total) {
        container.appendChild(createHistoryPaginationNavButton("次へ", current + 1));
    }
}

/**
 * いずれかの詳細が開いているとき、詳細が閉じている注文の要約行だけ薄くする（受注管理と同様）。
 */
function syncHistorySummaryRowDimming(tbody) {
    if (!tbody) return;
    let anyOpen = false;
    tbody.querySelectorAll(".order-detail-row").forEach(function (detTr) {
        if (detTr.style.display !== "none") {
            anyOpen = true;
        }
    });
    tbody.querySelectorAll(".order-summary-row").forEach(function (sumTr) {
        const detTr = sumTr.nextElementSibling;
        const pairOpen =
            detTr &&
            detTr.classList.contains("order-detail-row") &&
            detTr.style.display !== "none";
        sumTr.classList.toggle("order-summary-row--dimmed", anyOpen && !pairOpen);
        sumTr.classList.toggle("order-summary-row--detail-open", pairOpen);
        const toggleBtn = sumTr.querySelector(".btn-toggle-detail");
        if (toggleBtn) {
            toggleBtn.setAttribute("aria-expanded", pairOpen ? "true" : "false");
        }
    });
}

function setHistoryDetailRowOpen(sumTr, detTr, toggleBtn, open) {
    if (!detTr) return;
    detTr.style.display = open ? "table-row" : "none";
    if (toggleBtn) {
        toggleBtn.textContent = open ? "閉じる ▲" : "詳細 ▼";
        toggleBtn.style.backgroundColor = "#dfe3e6";
        toggleBtn.style.borderColor = "#c5cdd5";
        toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    const orderId = getHistoryOrderIdFromSummaryRow(sumTr);
    if (orderId) {
        if (open) openHistoryDetailOrderIds.add(orderId);
        else openHistoryDetailOrderIds.delete(orderId);
    }
    const tbody = sumTr && sumTr.closest("tbody");
    if (tbody) syncHistorySummaryRowDimming(tbody);
}

function toggleHistoryDetailRow(sumTr, detTr, toggleBtn) {
    if (!detTr) return;
    setHistoryDetailRowOpen(sumTr, detTr, toggleBtn, detTr.style.display === "none");
}

function restoreHistoryOpenDetails(tbody) {
    if (!tbody || openHistoryDetailOrderIds.size === 0) return;
    tbody.querySelectorAll(".order-summary-row").forEach(function (sumTr) {
        const orderId = getHistoryOrderIdFromSummaryRow(sumTr);
        if (!orderId || !openHistoryDetailOrderIds.has(orderId)) return;
        const detTr = sumTr.nextElementSibling;
        if (!detTr || !detTr.classList.contains("order-detail-row")) return;
        const toggleBtn = sumTr.querySelector(".btn-toggle-detail");
        if (detTr.style.display === "none") {
            setHistoryDetailRowOpen(sumTr, detTr, toggleBtn, true);
        }
    });
}

/** 一覧で選択中の注文ID（ページをまたいで保持） */
const selectedHistoryOrderIds = new Set();
/** 詳細パネルを開いている注文ID（再描画・タブ復帰後も保持） */
const openHistoryDetailOrderIds = new Set();

function getHistoryOrderIdFromSummaryRow(sumTr) {
    if (!sumTr) return "";
    const ch = sumTr.querySelector(".order-row-select");
    if (ch) {
        const id = ch.getAttribute("data-order-id");
        if (id != null && id !== "") return String(id);
    }
    const link = sumTr.querySelector("a.order-id-link");
    if (link && link.textContent) return String(link.textContent).trim();
    return "";
}

function orderHistorySelectionKeyFromCheckbox(ch) {
    const id = ch.getAttribute("data-order-id");
    return id != null ? String(id) : "";
}

function syncHistorySelectAllCheckbox(table) {
    const selectAll = table.querySelector(".order-select-all");
    if (!selectAll) return;
    const boxes = Array.from(table.querySelectorAll("tbody .order-row-select"));
    const n = boxes.length;
    const checked = boxes.filter(function (b) {
        return b.checked;
    }).length;
    selectAll.checked = n > 0 && checked === n;
    selectAll.indeterminate = checked > 0 && checked < n;
}

function attachHistoryRowSelectionHandlers(table) {
    const selectAll = table.querySelector(".order-select-all");
    table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
        const key = orderHistorySelectionKeyFromCheckbox(ch);
        ch.checked = key !== "" && selectedHistoryOrderIds.has(key);
    });
    syncHistorySelectAllCheckbox(table);

    if (selectAll) {
        selectAll.addEventListener("change", function () {
            const on = selectAll.checked;
            table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
                const key = orderHistorySelectionKeyFromCheckbox(ch);
                if (!key) return;
                ch.checked = on;
                if (on) selectedHistoryOrderIds.add(key);
                else selectedHistoryOrderIds.delete(key);
            });
            selectAll.indeterminate = false;
        });
    }

    table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
        ch.addEventListener("change", function () {
            const key = orderHistorySelectionKeyFromCheckbox(ch);
            if (!key) return;
            if (ch.checked) selectedHistoryOrderIds.add(key);
            else selectedHistoryOrderIds.delete(key);
            syncHistorySelectAllCheckbox(table);
        });
    });
}

function collectSelectedHistoryOrders() {
    if (selectedHistoryOrderIds.size === 0) return [];
    const idSet = selectedHistoryOrderIds;
    return allOrders.filter(function (o) {
        return idSet.has(String(o.orderId != null ? o.orderId : ""));
    });
}

function historySlipEscHtml(str) {
    if (typeof escapeHtml !== "undefined") {
        return escapeHtml(String(str == null ? "" : str));
    }
    return escapeHistoryHtml(str);
}

function buildHistoryOrderSlipsPrintHtml(orders, preview) {
    const toolbar = preview
        ? '<div class="print-preview-toolbar no-print">' +
          '<button type="button" onclick="window.print()">この内容を印刷</button>' +
          '<span class="print-preview-hint">ブラウザの印刷ダイアログでプリンタを選べます</span>' +
          "</div>"
        : "";
    const style =
        "<style>" +
        "*{box-sizing:border-box;}" +
        "body{font-family:'Noto Sans JP',system-ui,sans-serif;margin:0;padding:12px 16px 24px;color:#111;background:#fff;font-size:12px;}" +
        ".print-preview-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:12px 16px;background:#1f2937;color:#fff;margin:-12px -16px 20px;position:sticky;top:0;z-index:10;}" +
        ".print-preview-toolbar button{padding:8px 18px;font-weight:700;border:none;border-radius:0;background:#3b82f6;color:#fff;cursor:pointer;font-size:0.95rem;}" +
        ".order-slip{border:2px solid #111;padding:14px 16px;margin:0 0 20px;}" +
        ".order-slip-title{margin:0 0 12px;font-size:1.25rem;border-bottom:2px solid #111;padding-bottom:6px;}" +
        ".order-slip-meta,.order-slip-items{width:100%;border-collapse:collapse;}" +
        ".order-slip-meta td,.order-slip-meta th,.order-slip-items td,.order-slip-items th{border:1px solid #ccc;padding:6px 8px;}" +
        ".order-slip-meta th{width:7.5em;background:#f3f4f6;text-align:left;}" +
        ".order-slip-items th{background:#e5e7eb;}" +
        ".order-slip-total{text-align:right;font-weight:700;margin-top:8px;font-size:1.05rem;}" +
        "@media print{.no-print{display:none!important;}.order-slip{page-break-after:always;}.order-slip:last-of-type{page-break-after:auto;}}" +
        "</style>";

    const blocks = orders.map(function (order) {
        const info = order.deliveryInfo || {};
        const dateStr = formatHistoryOrderDateYmdSlash(order.orderDate);
        const delivDate = info.dateUnknown ? "確約不可" : historySlipEscHtml(info.date || "—");
        let rows = "";
        let sum = 0;
        (order.items || []).forEach(function (item) {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const sub = qty * price;
            sum += sub;
            rows +=
                "<tr><td>" + historySlipEscHtml(item.code) + "</td><td>" + historySlipEscHtml(item.name) +
                "</td><td style='text-align:right'>" + qty + "</td><td style='text-align:right'>¥" +
                price.toLocaleString() + "</td><td style='text-align:right'>¥" + sub.toLocaleString() + "</td></tr>";
        });
        const totalShown = order.totalAmount != null ? Number(order.totalAmount) : sum;
        return (
            '<article class="order-slip"><h1 class="order-slip-title">注文伝票</h1>' +
            '<table class="order-slip-meta"><tr><th>注文ID</th><td>' + historySlipEscHtml(order.orderId) +
            "</td><th>注文日</th><td>" + historySlipEscHtml(dateStr) + "</td></tr>" +
            "<tr><th>ステータス</th><td colspan=\"3\">" + historySlipEscHtml(order.status || "未発送") + "</td></tr>" +
            "<tr><th>納品先</th><td colspan=\"3\">" + historySlipEscHtml(info.name || "") + " 様</td></tr>" +
            "<tr><th>住所</th><td colspan=\"3\">" + historySlipEscHtml(info.address || "") + "</td></tr>" +
            "</table>" +
            '<table class="order-slip-items"><thead><tr><th>商品コード</th><th>商品名</th><th>数量</th><th>単価</th><th>金額</th></tr></thead><tbody>' +
            rows + "</tbody></table>" +
            '<div class="order-slip-total">合計 ¥' + totalShown.toLocaleString() + "</div></article>"
        );
    });

    return (
        "<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"UTF-8\"><title>伝票印刷</title>" +
        style + "</head><body>" + toolbar + blocks.join("") + "</body></html>"
    );
}

function openHistoryOrderSlipsSaveWindow(orders, options) {
    options = options || {};
    const format = options.format === "png" ? "png" : "pdf";
    const preview = options.preview !== false;
    const html = buildHistoryOrderSlipsPrintHtml(orders, false);
    if (!window.PrintDocumentSave) {
        if (window.toastError) window.toastError("保存機能の読み込みに失敗しました");
        else alert("保存機能の読み込みに失敗しました");
        return;
    }
    window.PrintDocumentSave.openSavePreview(html, {
        filePrefix: "order-history",
        format: format,
        preview: preview
    });
}

function openHistoryOrderSlipsPrintWindow(orders, preview) {
    const html = buildHistoryOrderSlipsPrintHtml(orders, preview);
    let blobUrl = null;
    try {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        blobUrl = URL.createObjectURL(blob);
    } catch (err) {
        console.error(err);
        if (window.toastError) window.toastError("印刷用ページの生成に失敗しました");
        else alert("印刷用ページの生成に失敗しました");
        return;
    }
    const newTab = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!newTab) {
        URL.revokeObjectURL(blobUrl);
        if (window.toastError) window.toastError("新しいタブで開けませんでした（ポップアップを許可してください）");
        else alert("新しいタブで開けませんでした");
        return;
    }
    if (!preview) {
        setTimeout(function () {
            try {
                newTab.focus();
                newTab.print();
            } catch (err) {
                console.error(err);
            }
        }, 450);
    }
    setTimeout(function () {
        try {
            URL.revokeObjectURL(blobUrl);
        } catch (e) { /* noop */ }
    }, 300000);
}

function closeAllHistoryOrderDetails() {
    openHistoryDetailOrderIds.clear();
    const container = historyListContainerEl || document.querySelector("#history-list-container");
    if (!container) return;
    container.querySelectorAll(".order-detail-row").forEach(function (row) {
        row.style.display = "none";
    });
    container.querySelectorAll(".btn-toggle-detail").forEach(function (btn) {
        btn.textContent = "詳細 ▼";
        btn.style.backgroundColor = "#dfe3e6";
        btn.style.borderColor = "#c5cdd5";
        btn.setAttribute("aria-expanded", "false");
    });
    container.querySelectorAll(".orders-list-table tbody").forEach(syncHistorySummaryRowDimming);
}

async function postCustomerDeleteOrderRequest(orderId) {
    const response = await fetch("/order-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: orderId })
    });
    if (response.status === 401) {
        return { ok: false, message: "セッションが切れました" };
    }
    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        return { ok: false, message: "サーバー応答の解析に失敗しました" };
    }
    return { ok: !!data.success, message: data.message || "" };
}

function setupHistoryMoreMenu() {
    const btnMore = document.getElementById("history-btn-more");
    const moreMenu = document.getElementById("history-more-menu");
    const btnPrint = document.getElementById("history-btn-print-selected");
    const btnSave = document.getElementById("history-btn-save-selected");
    const btnDelete = document.getElementById("history-btn-delete-selected");
    const btnCloseAll = document.getElementById("history-btn-close-all-details");
    const printModal = document.getElementById("history-print-slip-modal");
    const printBackdrop = document.getElementById("history-print-slip-modal-backdrop");
    const printCancel = document.getElementById("history-print-slip-modal-cancel");
    const printSubmit = document.getElementById("history-print-slip-modal-submit");
    const saveModal = document.getElementById("history-save-slip-modal");
    const saveBackdrop = document.getElementById("history-save-slip-modal-backdrop");
    const saveCancel = document.getElementById("history-save-slip-modal-cancel");
    const saveSubmit = document.getElementById("history-save-slip-modal-submit");

    function setHistoryMoreMenuOpen(open) {
        if (!moreMenu || !btnMore) return;
        moreMenu.classList.toggle("is-open", open);
        moreMenu.setAttribute("aria-hidden", open ? "false" : "true");
        btnMore.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function setHistoryPrintModalOpen(open) {
        if (!printModal) return;
        printModal.classList.toggle("is-open", open);
        printModal.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function setHistorySaveModalOpen(open) {
        if (!saveModal) return;
        saveModal.classList.toggle("is-open", open);
        saveModal.setAttribute("aria-hidden", open ? "false" : "true");
    }

    if (btnMore && moreMenu) {
        btnMore.addEventListener("click", function (e) {
            e.stopPropagation();
            const opening = !moreMenu.classList.contains("is-open");
            setHistoryMoreMenuOpen(opening);
        });
    }

    document.addEventListener("click", function () {
        setHistoryMoreMenuOpen(false);
    });

    if (moreMenu) {
        moreMenu.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    if (btnPrint) {
        btnPrint.addEventListener("click", function (e) {
            e.stopPropagation();
            if (selectedHistoryOrderIds.size === 0) {
                if (window.toastWarning) window.toastWarning("一覧でチェックした伝票がありません");
                else alert("一覧でチェックした伝票がありません");
                return;
            }
            setHistoryMoreMenuOpen(false);
            setHistoryPrintModalOpen(true);
        });
    }

    if (btnSave) {
        btnSave.addEventListener("click", function (e) {
            e.stopPropagation();
            if (selectedHistoryOrderIds.size === 0) {
                if (window.toastWarning) window.toastWarning("一覧でチェックした伝票がありません");
                else alert("一覧でチェックした伝票がありません");
                return;
            }
            setHistoryMoreMenuOpen(false);
            setHistorySaveModalOpen(true);
        });
    }

    if (printBackdrop) {
        printBackdrop.addEventListener("click", function () {
            setHistoryPrintModalOpen(false);
        });
    }
    if (printCancel) {
        printCancel.addEventListener("click", function () {
            setHistoryPrintModalOpen(false);
        });
    }
    if (printSubmit && printModal) {
        printSubmit.addEventListener("click", function (e) {
            e.stopPropagation();
            const modeInput = printModal.querySelector('input[name="history-print-slip-mode"]:checked');
            const preview = !modeInput || modeInput.value === "preview";
            const selected = collectSelectedHistoryOrders();
            if (selected.length === 0) {
                if (window.toastWarning) window.toastWarning("一覧でチェックした伝票がありません");
                return;
            }
            setHistoryPrintModalOpen(false);
            openHistoryOrderSlipsPrintWindow(selected, preview);
        });
    }
    if (printModal) {
        printModal.querySelector(".history-print-modal__dialog")?.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    if (saveBackdrop) {
        saveBackdrop.addEventListener("click", function () {
            setHistorySaveModalOpen(false);
        });
    }
    if (saveCancel) {
        saveCancel.addEventListener("click", function () {
            setHistorySaveModalOpen(false);
        });
    }
    if (saveSubmit) {
        saveSubmit.addEventListener("click", function (e) {
            e.stopPropagation();
            const selected = collectSelectedHistoryOrders();
            if (selected.length === 0) {
                if (window.toastWarning) window.toastWarning("一覧でチェックした伝票がありません");
                return;
            }
            const formatInput = saveModal.querySelector('input[name="history-save-slip-format"]:checked');
            const previewInput = saveModal.querySelector('input[name="history-save-slip-preview"]:checked');
            const format = formatInput && formatInput.value === "png" ? "png" : "pdf";
            const preview = !previewInput || previewInput.value === "preview";
            setHistorySaveModalOpen(false);
            openHistoryOrderSlipsSaveWindow(selected, { format: format, preview: preview });
        });
    }
    if (saveModal) {
        saveModal.querySelector(".history-print-modal__dialog")?.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener("click", async function (e) {
            e.stopPropagation();
            if (selectedHistoryOrderIds.size === 0) {
                if (window.toastWarning) window.toastWarning("チェックした注文がありません");
                return;
            }
            const selected = collectSelectedHistoryOrders();
            if (selected.length === 0) {
                if (window.toastWarning) window.toastWarning("選択した注文が見つかりません。一覧を再読み込みしてください。");
                return;
            }
            const lines = selected.slice(0, 8).map(function (o) {
                const id = o.orderId != null ? String(o.orderId) : "";
                const nm = o.customerName ? String(o.customerName) : "";
                return nm ? id + "（" + nm + "）" : id;
            });
            const extra = selected.length > 8 ? "\n… ほか " + (selected.length - 8) + " 件" : "";
            const confirmMsg =
                "【重要】チェックした " + selected.length +
                " 件の注文をデータから完全に削除します。\n取り消せません。よろしいですか？\n\n" +
                lines.join("\n") + extra;
            if (!confirm(confirmMsg)) return;
            setHistoryMoreMenuOpen(false);
            let ok = 0;
            let fail = 0;
            const failedIds = [];
            for (let i = 0; i < selected.length; i++) {
                const o = selected[i];
                const oid = o.orderId;
                try {
                    const { ok: success, message } = await postCustomerDeleteOrderRequest(oid);
                    if (success) {
                        ok++;
                        selectedHistoryOrderIds.delete(String(oid != null ? oid : ""));
                    } else {
                        fail++;
                        failedIds.push(String(oid) + (message ? ": " + message : ""));
                    }
                } catch (err) {
                    console.error(err);
                    fail++;
                    failedIds.push(String(oid));
                }
            }
            if (ok > 0) {
                if (window.toastSuccess) {
                    window.toastSuccess(ok + " 件の注文を削除しました" + (fail > 0 ? "（" + fail + " 件は失敗）" : ""));
                }
                fetchHistory({ keepPage: true });
            }
            if (fail > 0 && ok === 0) {
                if (window.toastError) window.toastError("削除に失敗しました。\n" + failedIds.slice(0, 5).join("\n"));
                else alert("削除に失敗しました");
            } else if (fail > 0 && ok > 0 && window.toastWarning) {
                window.toastWarning(fail + " 件の削除に失敗しました");
            }
        });
    }

    if (btnCloseAll) {
        btnCloseAll.addEventListener("click", function (e) {
            e.stopPropagation();
            setHistoryMoreMenuOpen(false);
            closeAllHistoryOrderDetails();
        });
    }
}

function syncHistoryGlobalNavOffset() {
    const nav = document.querySelector(".global-nav");
    if (!nav) return;
    document.body.style.setProperty("--history-global-nav-offset", nav.offsetHeight + "px");
}

document.addEventListener("DOMContentLoaded", function () {
    syncHistoryGlobalNavOffset();
    window.addEventListener("resize", syncHistoryGlobalNavOffset);

    setupHistoryMoreMenu();
    fetchHistory();

    const dateStartInput = document.querySelector("#history-filter-date-start");
    const dateEndInput = document.querySelector("#history-filter-date-end");
    const statusSelect = document.querySelector("#history-order-status-filter");
    const searchTextInput = document.querySelector("#history-order-search-text");
    const searchBtn = document.querySelector("#history-order-search-btn");
    const clearSearchBtn = document.querySelector("#history-clear-order-search-btn");

    setupHistoryClearButton(clearSearchBtn, searchTextInput);

    const debouncedHistorySearch = debounce(execHistoryClientSearch, 300);

    if (searchTextInput) {
        searchTextInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                if (searchBtn) searchBtn.click();
            }
        });
        searchTextInput.addEventListener("input", debouncedHistorySearch);
    }

    if (dateStartInput) dateStartInput.addEventListener("change", execHistoryClientSearch);
    if (dateEndInput) dateEndInput.addEventListener("change", execHistoryClientSearch);
    if (statusSelect) statusSelect.addEventListener("change", execHistoryClientSearch);
    if (searchBtn) searchBtn.addEventListener("click", execHistoryClientSearch);

    // タブに戻った際に最新データを再取得（詳細の開閉・ページは維持）
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            fetchHistory({ keepPage: true });
        }
    });
});

// サーバーから履歴データをとってくる
async function fetchHistory(options) {
    const container = document.querySelector("#history-list-container");
    if (!container) return;

    try {
        // ★修正: /api を削除 (/order-history)
        const response = await fetch("/order-history");

        // ログインしていない場合
        if (response.status === 401) {
            clearHistoryPagination();
            alert("セッションが切れました。ログインし直してください。");
            window.location.href = "/";
            return;
        }

        const data = await response.json();

        if (!data.success) {
            const esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
            clearHistoryPagination();
            container.innerHTML = "<p class=\"history-error\">エラー: " + (typeof escapeHtml !== "undefined" ? escapeHtml(data.message) : esc(data.message)) + "</p>";
            return;
        } 

        // データを保存し、ツールバー条件で一覧を再描画
        allOrders = data.history;
        execHistoryClientSearch(options);
    } catch (error) {
        console.error("履歴取得エラー", error);
        clearHistoryPagination();
        container.innerHTML = "<p class=\"history-error\">通信エラーが発生しました。</p>";
    }
}

// データをHTMLに変換して表示する（25件／ページ、商品一覧と同型のページ送り）
function renderHistoryList(orders, container) {
    historyListContainerEl = container;
    historyViewOrders = Array.isArray(orders) ? orders : [];
    historyCurrentPage = 1;
    renderHistoryPage();
}

function renderHistoryPage() {
    const container = historyListContainerEl || document.querySelector("#history-list-container");
    if (!container) return;

    container.innerHTML = "";

    if (historyViewOrders.length === 0) {
        clearHistoryPagination();
        container.innerHTML = "<p class=\"history-empty\">表示できる履歴がありません</p>";
        return;
    }

    const totalPages = Math.max(1, Math.ceil(historyViewOrders.length / HISTORY_PER_PAGE));
    if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
    if (historyCurrentPage < 1) historyCurrentPage = 1;

    const start = (historyCurrentPage - 1) * HISTORY_PER_PAGE;
    const pageOrders = historyViewOrders.slice(start, start + HISTORY_PER_PAGE);
    const fromN = start + 1;
    const toN = start + pageOrders.length;
    const totalCount = historyViewOrders.length;

    const resultInfo = document.createElement("div");
    resultInfo.className = "history-result-info";
    if (totalPages > 1) {
        resultInfo.innerHTML =
            `該当：<strong>${totalCount}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示`;
    } else {
        resultInfo.innerHTML = `該当：<strong>${totalCount}</strong> 件`;
    }
    container.appendChild(resultInfo);

    const tableWrap = document.createElement("div");
    tableWrap.className = "orders-list-wrap";

    const table = document.createElement("table");
    table.className = "orders-list-table";
    table.setAttribute("role", "grid");
    table.innerHTML =
        "<thead><tr>" +
        '<th scope="col" class="col-select">' +
        '<input type="checkbox" class="order-select-all" title="このページを全選択" aria-label="このページの注文をすべて選択">' +
        "</th>" +
        '<th scope="col">注文ID</th>' +
        '<th scope="col">注文日</th>' +
        '<th scope="col">ステータス</th>' +
        '<th scope="col">得意先</th>' +
        '<th scope="col">納品先</th>' +
        '<th scope="col" class="col-numeric">合計金額</th>' +
        '<th scope="col" class="col-action">操作</th>' +
        "</tr></thead>";

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    pageOrders.forEach(order => {
        const sumTr = document.createElement("tr");
        sumTr.className = "order-summary-row";
        sumTr.innerHTML = generateHistorySummaryCellsHtml(order);

        const detTr = document.createElement("tr");
        detTr.className = "order-detail-row";
        detTr.style.display = "none";

        const detTd = document.createElement("td");
        detTd.colSpan = 8;
        detTd.className = "order-detail-cell";

        const detailInner = document.createElement("div");
        detailInner.className = "order-detail-inner";
        detailInner.innerHTML = generateHistoryDetailContent(order);

        detTd.appendChild(detailInner);
        detTr.appendChild(detTd);

        const toggleBtn = sumTr.querySelector(".btn-toggle-detail");
        if (toggleBtn) {
            toggleBtn.setAttribute("aria-expanded", "false");
            toggleBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                toggleHistoryDetailRow(sumTr, detTr, toggleBtn);
            });
        }

        sumTr.addEventListener("click", function (e) {
            if (e.target.closest(".col-select") || e.target.closest(".order-row-select")) {
                return;
            }
            if (e.target.closest(".btn-toggle-detail")) {
                return;
            }
            if (e.target.closest("a.order-id-link")) {
                return;
            }
            toggleHistoryDetailRow(sumTr, detTr, toggleBtn);
        });

        const reorderBtn = detailInner.querySelector(".btn-reorder");
        if (reorderBtn) {
            reorderBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                if (typeof window.customerOrderQuickReorder === "function") {
                    window.customerOrderQuickReorder(order);
                }
            });
            reorderBtn.addEventListener("mouseenter", function () {
                this.style.transform = "scale(1.02)";
            });
            reorderBtn.addEventListener("mouseleave", function () {
                this.style.transform = "scale(1)";
            });
        }

        const inquiryLink = detailInner.querySelector(".btn-order-inquiry");
        if (inquiryLink) {
            inquiryLink.addEventListener("click", function (e) {
                e.stopPropagation();
            });
        }

        tbody.appendChild(sumTr);
        tbody.appendChild(detTr);
    });

    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    attachHistoryRowSelectionHandlers(table);

    restoreHistoryOpenDetails(tbody);

    setupHistoryPagination(totalPages, historyCurrentPage);
}

/** 一覧行セル（受注管理と同型：選択列あり） */
function generateHistorySummaryCellsHtml(order) {
    const orderDateStr = formatHistoryOrderDateYmdSlash(order.orderDate);
    const totalAmount = order.totalAmount || 0;
    const info = order.deliveryInfo || {};

    let statusColor;
    let statusFg;
    let statusBorder;
    const statusText = order.status || "未発送";
    const statusFontWeight = (statusText === "未発送" || statusText === "一部発送") ? "600" : "400";
    if (statusText === "発送済") {
        statusColor = "#f3f4f6";
        statusFg = "#6b7280";
        statusBorder = "#e5e7eb";
    } else if (order.status === "一部発送" || !order.status || order.status === "未発送") {
        statusColor = "#d6e7f1";
        statusFg = "#111827";
        statusBorder = "#b0cde5";
    } else {
        statusColor = "#e5e7eb";
        statusFg = "#374151";
        statusBorder = "#d1d5db";
    }

    const deliveryName = info.name || "（宛名なし）";
    const cName = order.customerName || "名称不明";

    const oid = order.orderId != null ? String(order.orderId) : "";
    const orderIdEsc = escapeHistoryHtml(oid);
    const oidQ = encodeURIComponent(oid);
    const statusEsc = escapeHistoryHtml(statusText);
    const partyEsc = escapeHistoryHtml(cName);
    const productEsc = escapeHistoryHtml(deliveryName);

    return `
            <td class="col-select">
                <input type="checkbox" class="order-row-select" data-order-id="${orderIdEsc}" title="選択" aria-label="この注文を選択">
            </td>
            <td class="col-id"><a class="order-id-link" href="order-detail.html?orderId=${oidQ}">${orderIdEsc}</a></td>
            <td class="col-date">${orderDateStr}</td>
            <td class="col-status">
                <span style="background-color: ${statusColor}; color: ${statusFg}; border: 1px solid ${statusBorder}; padding: 5px 10px; border-radius: 3px; font-size: 0.8125rem; font-weight: ${statusFontWeight}; white-space: nowrap; line-height: 1.25;">
                    ${statusEsc}
                </span>
            </td>
            <td class="col-party"><span>${partyEsc}</span></td>
            <td class="col-product"><span>${productEsc} 様</span></td>
            <td class="col-numeric"><strong>¥${totalAmount.toLocaleString()}</strong></td>
            <td class="col-action">
                <button type="button" class="btn-toggle-detail" style="box-sizing: border-box; padding: 4px 10px; background: #dfe3e6; color: #111827; border: 1px solid #c5cdd5; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 400; font-family: inherit; line-height: 1.25; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); display: inline-flex; align-items: center; justify-content: center;">
                    詳細 ▼
                </button>
            </td>`;
}

/** 詳細パネル内HTML（配送・追跡・明細・アクション） */
function generateHistoryDetailContent(order) {
    if (typeof window.buildCustomerOrderDetailHtml !== "function") {
        return "<p class=\"history-error\">詳細表示モジュールの読み込みに失敗しました。</p>";
    }
    return window.buildCustomerOrderDetailHtml(order);
}