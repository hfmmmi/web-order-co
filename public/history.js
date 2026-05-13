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

function execHistoryClientSearch() {
    const container = document.querySelector("#history-list-container");
    if (!container) return;
    const filtered = computeFilteredHistoryOrders();
    renderHistoryList(filtered, container);
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

function toggleHistoryDetailRow(sumTr, detTr, toggleBtn) {
    if (!detTr) return;
    const isHidden = detTr.style.display === "none";
    detTr.style.display = isHidden ? "table-row" : "none";
    if (toggleBtn) {
        toggleBtn.textContent = isHidden ? "閉じる ▲" : "詳細 ▼";
        toggleBtn.style.backgroundColor = "#dfe3e6";
        toggleBtn.style.borderColor = "#c5cdd5";
        toggleBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    }
    const tbody = sumTr && sumTr.closest("tbody");
    if (tbody) syncHistorySummaryRowDimming(tbody);
}

/** 一覧で選択中の注文ID（ページをまたいで保持） */
const selectedHistoryOrderIds = new Set();

function orderHistorySelectionKeyFromCheckbox(ch) {
    const id = ch.getAttribute("data-order-id");
    return id != null ? String(id) : "";
}

function updateHistorySelectionCountLabel(resultInfoEl) {
    const span = resultInfoEl && resultInfoEl.querySelector(".orders-selection-count");
    if (!span) return;
    const n = selectedHistoryOrderIds.size;
    if (n === 0) {
        span.textContent = "";
    } else {
        span.textContent = `· 選択中 ${n}件`;
    }
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

function attachHistoryRowSelectionHandlers(table, resultInfoEl) {
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
            updateHistorySelectionCountLabel(resultInfoEl);
        });
    }

    table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
        ch.addEventListener("change", function () {
            const key = orderHistorySelectionKeyFromCheckbox(ch);
            if (!key) return;
            if (ch.checked) selectedHistoryOrderIds.add(key);
            else selectedHistoryOrderIds.delete(key);
            syncHistorySelectAllCheckbox(table);
            updateHistorySelectionCountLabel(resultInfoEl);
        });
    });
}

document.addEventListener("DOMContentLoaded", function () {
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

    // タブに戻った際に最新データを再取得（管理画面で納期目安更新後など）
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            fetchHistory();
        }
    });
});

// サーバーから履歴データをとってくる
async function fetchHistory() {
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
        execHistoryClientSearch();
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
            `該当: <strong>${totalCount}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示` +
            ' <span class="orders-selection-count" style="margin-left:12px;color:#2563eb;font-weight:600;"></span>';
    } else {
        resultInfo.innerHTML =
            `該当: <strong>${totalCount}</strong> 件` +
            ' <span class="orders-selection-count" style="margin-left:12px;color:#2563eb;font-weight:600;"></span>';
    }
    container.appendChild(resultInfo);
    updateHistorySelectionCountLabel(resultInfo);

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

        tbody.appendChild(sumTr);
        tbody.appendChild(detTr);
    });

    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    attachHistoryRowSelectionHandlers(table, resultInfo);

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
                <span style="background-color: ${statusColor}; color: ${statusFg}; border: 1px solid ${statusBorder}; padding: 5px 10px; border-radius: 3px; font-size: 0.8125rem; font-weight: 600; white-space: nowrap; line-height: 1.25;">
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