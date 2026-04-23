// js/admin-orders.js
// 【役割】注文管理の司令塔（通信・イベント制御・Viewへの指示出し）
// ※HTML生成は admin-orders-view.js に委託
document.addEventListener("DOMContentLoaded", function () {
    console.log("🚚 Order Manager Loaded (v9.0 MVC Edition)");

    // ---------------------------------------------------------
    // 1. 要素の取得
    // ---------------------------------------------------------
    const orderListContainer = document.querySelector("#order-list-container");
    const statusSelect = document.querySelector("#order-status-filter");
    const dateStartInput = document.querySelector("#filter-date-start");
    const dateEndInput = document.querySelector("#filter-date-end");
    
    // 検索窓（得意先・商品・注文ID）
    const searchTextInput = document.querySelector("#order-search-text");

    const clearSearchBtn = document.querySelector("#clear-order-search-btn");
    
    const searchBtn = document.querySelector("#order-search-btn");
    
    // CSVボタン2種
    const btnCsvUnexported = document.querySelector("#btn-csv-unexported");

    const fileInput = document.getElementById("file-input");
    const uploadStatus = document.getElementById("upload-status");
    const btnCsvExcelImport = document.getElementById("btn-csv-excel-import");
    const btnOrdersDownload = document.getElementById("btn-orders-download");
    const ordersDownloadModal = document.getElementById("orders-download-modal");
    const ordersDownloadModalBackdrop = document.getElementById("orders-download-modal-backdrop");
    const ordersDownloadModalCancel = document.getElementById("orders-download-modal-cancel");
    const ordersDownloadModalSubmit = document.getElementById("orders-download-modal-submit");
    const ordersDownloadModalStatus = document.getElementById("orders-download-modal-status");
    const ordersDownloadModalDateStart = document.getElementById("orders-download-modal-date-start");
    const ordersDownloadModalDateEnd = document.getElementById("orders-download-modal-date-end");
    const btnOrdersMore = document.getElementById("btn-orders-more");
    const ordersMoreMenu = document.getElementById("orders-more-menu");
    const ordersPrintSlipModal = document.getElementById("orders-print-slip-modal");
    const ordersPrintSlipModalBackdrop = document.getElementById("orders-print-slip-modal-backdrop");
    const ordersPrintSlipModalCancel = document.getElementById("orders-print-slip-modal-cancel");
    const ordersPrintSlipModalSubmit = document.getElementById("orders-print-slip-modal-submit");
    const btnPrintSelectedSlips = document.getElementById("btn-print-selected-slips");

    // 全データを保持するメモリ
    let allOrderList = [];
    let lastFilteredOrders = [];
    let ordersCurrentPage = 1;
    const ORDERS_PAGE_SIZE = 25;
    /** 一覧でチェックした注文ID（ページをまたいで保持） */
    const selectedOrderIds = new Set();

    // 初期化：開始は3年前の今日、終了は本日（ローカル日付）
    function localDateYmd(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }
    const today = new Date();
    const threeYearsAgo = new Date(today);
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    if (dateStartInput) dateStartInput.value = localDateYmd(threeYearsAgo);
    if (dateEndInput) dateEndInput.value = localDateYmd(today);
    
    // =========================================================
    // Admin Ready待機
    // =========================================================
    document.addEventListener("admin-ready", function() {
        console.log("🚀 Order Manager: Auth Signal Received. Starting fetch...");
        fetchOrders();
    });

    // =========================================================
    // ファイルアップロード処理 (Robust XHR Version)
    // =========================================================
    if (fileInput && btnCsvExcelImport) {
        btnCsvExcelImport.addEventListener("click", function () {
            fileInput.click();
        });
        fileInput.addEventListener("change", function (e) {
            handleFiles(e.target.files);
            e.target.value = "";
        });

        function handleFiles(files) {
            if (files.length > 0) {
                uploadFile(files[0]);
            }
        }

        function uploadFile(file) {
            if(uploadStatus) {
                uploadStatus.style.display = 'block';
                uploadStatus.innerHTML = "⏳ <strong>" + (typeof escapeHtml !== "undefined" ? escapeHtml(file.name) : String(file.name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")) + "</strong> を送信中...";
                uploadStatus.style.color = '#3b82f6';
            }

            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/import-orders-csv', true);

            xhr.onload = function () {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (result.success) {
                            if(uploadStatus) {
                                uploadStatus.innerHTML = "✅ 完了: " + (typeof escapeHtml !== "undefined" ? escapeHtml(result.message) : String(result.message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
                                uploadStatus.style.color = '#22c55e';
                            }
                            setTimeout(() => fetchOrders(), 1000);
                        } else {
                            throw new Error(result.message);
                        }
                    } catch (e) {
                        handleError(e.message || "レスポンス解析エラー");
                    }
                } else {
                    handleError(`Server Error (${xhr.status}): ${xhr.responseText}`);
                }
            };

            xhr.onerror = function () {
                handleError("ネットワークエラーが発生しました");
            };

            xhr.send(formData);

            function handleError(msg) {
                console.error("Upload Error:", msg);
                if(uploadStatus) {
                    uploadStatus.innerHTML = "❌ エラー: " + (typeof escapeHtml !== "undefined" ? escapeHtml(msg) : String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
                    uploadStatus.style.color = '#ef4444';
                }
            }
        }
    }

    // =========================================================
    // ヘルパー関数群
    // =========================================================

    function normalizeString(str) {
        if (!str) return '';
        return str
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
                return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
            })
            .toLowerCase();
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // ---------------------------------------------------------
    // イベント設定
    // ---------------------------------------------------------
    
    if (searchTextInput) {
        searchTextInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                if (searchBtn) searchBtn.click();
            }
        });
    }

    function setupClearButton(btn, input) {
        if (!btn || !input) return;
        btn.addEventListener("click", () => {
            input.value = "";
            input.focus();
            input.dispatchEvent(new Event("input"));
        });
    }
    setupClearButton(clearSearchBtn, searchTextInput);


    // ---------------------------------------------------------
    // API通信部 (Model & Controller)
    // ---------------------------------------------------------
    
    // データ取得
    async function fetchOrders() {
        if (!orderListContainer) return;
        orderListContainer.innerHTML = "<p>データを読み込み中...</p>";
        try {
            // ★修正: 404エラー回避のため、正しい管理者用エンドポイントへ変更
            const response = await fetch(`/api/admin/orders`);
            
            if (response.status === 401) {
                orderListContainer.innerHTML = `<p style="color:red; font-weight:bold;">⚠️ セッション切れです。再読み込みしてください。</p>`;
                return;
            }
            // 404の場合はルート定義ミスの可能性
            if (response.status === 404) {
                 throw new Error("APIが見つかりません (Endpoint Missing)");
            }

            const data = await response.json();
            if (!data.success) throw new Error(data.message);

            allOrderList = data.orders;
            console.log(`取得件数: ${allOrderList.length}件`);
            
            execClientSearch();
            
        } catch (error) {
            orderListContainer.innerHTML = "<p class=\"error\" style=\"color:red;\">エラー: " + (typeof escapeHtml !== "undefined" ? escapeHtml(error.message) : String(error.message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")) + "</p>";
        }
    }

    // 納期目安の更新
    async function updateDeliveryEstimate(orderId, estimateText) {
        try {
            const response = await fetch("/api/update-order-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: orderId,
                    deliveryEstimate: estimateText
                })
            });
            const data = await response.json();
            if (data.success) {
                toastSuccess("納期目安を更新しました");
                fetchOrders();
            } else {
                toastError("更新失敗: " + data.message);
            }
        } catch (error) { console.error(error); toastError("通信エラー"); }
    }

    async function postDeleteOrderRequest(orderId) {
        const response = await fetch("/api/admin/orders-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ orderId: orderId })
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success, message: data.message };
    }

    async function deleteOrder(orderId, order) {
        const oid = orderId != null ? String(orderId) : "";
        const cname = order && order.customerName ? String(order.customerName) : "";
        const msg =
            "【削除の確認】\n注文ID " +
            oid +
            (cname ? "（" + cname + "）" : "") +
            " をデータから完全に削除します。\nこの操作は取り消せません。よろしいですか？";
        if (!confirm(msg)) return;
        try {
            const { ok, message } = await postDeleteOrderRequest(orderId);
            if (ok) {
                toastSuccess("注文を削除しました");
                fetchOrders();
            } else {
                toastError(message || "削除に失敗しました");
            }
        } catch (error) {
            console.error(error);
            toastError("通信エラーが発生しました");
        }
    }

    // 一括出荷登録
    async function registerShipmentBatch(orderId, shipmentsPayload) {
        try {
            const response = await fetch("/api/register-shipment-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: orderId,
                    shipmentsPayload: shipmentsPayload
                })
            });
            const data = await response.json();
            if (data.success) {
                toastSuccess(`出荷確定しました（ステータス: ${data.newStatus}）`, 4000);
                fetchOrders();
            } else {
                toastError("登録失敗: " + data.message);
            }
        } catch (error) { console.error(error); toastError("通信エラー"); }
    }

    // 出荷履歴修正
    async function updateShipmentInfo(orderId, shipmentId, company, number, dateVal, dateUnknown) {
        try {
            let formattedDate = dateVal ? dateVal.replace(/-/g, "/") : "";
            const response = await fetch("/api/update-shipment-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: orderId,
                    shipmentId: shipmentId,
                    deliveryCompany: company,
                    trackingNumber: number,
                    deliveryDate: formattedDate,
                    deliveryDateUnknown: dateUnknown
                })
            });
            const data = await response.json();
            if (data.success) {
                toastSuccess("出荷情報を修正しました");
                fetchOrders(); 
            } else {
                toastError("修正失敗: " + data.message);
            }
        } catch (error) { console.error(error); toastError("通信エラー"); }
    }

    // 連携ステータスリセット
    async function resetExportStatus(orderId) {
        try {
            const response = await fetch("/api/reset-export-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: orderId })
            });
            const data = await response.json();
            if(data.success) {
                toastSuccess("連携状態をリセットしました");
                fetchOrders();
            } else {
                toastError("失敗しました: " + data.message);
            }
        } catch(e) { console.error(e); toastError("通信エラー"); }
    }

    // ---------------------------------------------------------
    // 検索・描画実行
    // ---------------------------------------------------------
    /**
     * @param {object} [filterOverrides] DLモーダル用。status / dateStart / dateEnd を指定するとツールバー値の代わりに使う（キーワードは常に検索欄）
     */
    function computeFilteredOrders(filterOverrides) {
        const status =
            filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "status")
                ? filterOverrides.status
                : statusSelect
                  ? statusSelect.value
                  : "";
        const start =
            filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "dateStart")
                ? filterOverrides.dateStart
                : dateStartInput
                  ? dateStartInput.value
                  : "";
        const end =
            filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "dateEnd")
                ? filterOverrides.dateEnd
                : dateEndInput
                  ? dateEndInput.value
                  : "";

        const rawSearchVal = searchTextInput ? searchTextInput.value : "";
        const searchKeyword = normalizeString(rawSearchVal);

        const extractCode = (str) => {
            const match = str.match(/^\((.+?)\)/);
            return match && match[1] ? match[1].trim() : null;
        };
        const leadingCodeRaw = extractCode(rawSearchVal);

        function orderMatchesUnifiedSearch(order) {
            if (!searchKeyword) return true;

            const safeId = String(order.customerId || "");
            const safeName = order.customerName || "";

            if (leadingCodeRaw) {
                if (safeId === leadingCodeRaw) return true;
                if (String(order.orderId ?? "") === leadingCodeRaw) return true;
                if (order.items) {
                    return order.items.some(item => item.code === leadingCodeRaw);
                }
                return false;
            }

            const orderIdNorm = normalizeString(String(order.orderId ?? ""));
            if (orderIdNorm.includes(searchKeyword)) return true;

            const custBlob = normalizeString(`${safeId} ${safeName}`);
            if (custBlob.includes(searchKeyword)) return true;

            if (order.items) {
                return order.items.some(item => {
                    const itemText = `${item.code} ${item.name}`;
                    return normalizeString(itemText).includes(searchKeyword);
                });
            }
            return false;
        }

        return allOrderList.filter(order => {
            if (status && order.status !== status) return false;

            if (start || end) {
                const d = new Date(order.orderDate);
                const jstTime = d.getTime() + (9 * 60 * 60 * 1000);
                const jstDateObj = new Date(jstTime);
                const orderDateJST = jstDateObj.toISOString().split("T")[0];

                if (start && orderDateJST < start) return false;
                if (end && orderDateJST > end) return false;
            }

            if (!orderMatchesUnifiedSearch(order)) return false;

            return true;
        });
    }

    function execClientSearch() {
        const filtered = computeFilteredOrders();
        lastFilteredOrders = filtered;
        ordersCurrentPage = 1;

        if (window.OrderView) {
            window.OrderView.generateSearchCandidates(filtered, null);
            displayOrders(filtered);
        } else {
            console.error("OrderView module not loaded!");
        }
    }

    function buildPageNumberItems(totalPages, current) {
        if (totalPages <= 1) return [];
        const nums = new Set([1, totalPages, current]);
        for (let d = -2; d <= 2; d++) nums.add(current + d);
        const sorted = [...nums].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
        const out = [];
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push(null);
            out.push(sorted[i]);
        }
        return out;
    }

    function buildOrdersPaginationNav(totalPages, currentPage) {
        const nav = document.createElement("nav");
        nav.className = "orders-pagination";
        nav.setAttribute("aria-label", "ページ送り");

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "orders-pagination-btn orders-pagination-prev";
        prevBtn.textContent = "前へ";
        prevBtn.disabled = currentPage <= 1;
        prevBtn.addEventListener("click", function () {
            if (ordersCurrentPage <= 1) return;
            ordersCurrentPage--;
            displayOrders(lastFilteredOrders);
        });

        const pagesWrap = document.createElement("div");
        pagesWrap.className = "orders-pagination-pages";

        buildPageNumberItems(totalPages, currentPage).forEach(function (entry) {
            if (entry === null) {
                const ell = document.createElement("span");
                ell.className = "orders-pagination-ellipsis";
                ell.textContent = "…";
                ell.setAttribute("aria-hidden", "true");
                pagesWrap.appendChild(ell);
                return;
            }
            const p = entry;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "orders-pagination-btn orders-pagination-page";
            btn.textContent = String(p);
            if (p === currentPage) {
                btn.classList.add("is-current");
                btn.setAttribute("aria-current", "page");
            }
            btn.addEventListener("click", function () {
                ordersCurrentPage = p;
                displayOrders(lastFilteredOrders);
            });
            pagesWrap.appendChild(btn);
        });

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "orders-pagination-btn orders-pagination-next";
        nextBtn.textContent = "次へ";
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.addEventListener("click", function () {
            if (ordersCurrentPage >= totalPages) return;
            ordersCurrentPage++;
            displayOrders(lastFilteredOrders);
        });

        nav.appendChild(prevBtn);
        nav.appendChild(pagesWrap);
        nav.appendChild(nextBtn);
        return nav;
    }

    function ordersDownloadModalEscHandler(e) {
        if (e.key === "Escape") {
            setOrdersDownloadModalOpen(false);
        }
    }

    function setOrdersDownloadModalOpen(open) {
        if (!ordersDownloadModal) return;
        if (open) {
            setOrdersPrintSlipModalOpen(false);
            ordersDownloadModal.classList.add("is-open");
            ordersDownloadModal.setAttribute("aria-hidden", "false");
            document.addEventListener("keydown", ordersDownloadModalEscHandler);
        } else {
            ordersDownloadModal.classList.remove("is-open");
            ordersDownloadModal.setAttribute("aria-hidden", "true");
            document.removeEventListener("keydown", ordersDownloadModalEscHandler);
        }
    }

    function syncOrdersDownloadModalFromToolbar() {
        if (ordersDownloadModalStatus && statusSelect) {
            ordersDownloadModalStatus.value = statusSelect.value;
        }
        if (ordersDownloadModalDateStart && dateStartInput) {
            ordersDownloadModalDateStart.value = dateStartInput.value;
        }
        if (ordersDownloadModalDateEnd && dateEndInput) {
            ordersDownloadModalDateEnd.value = dateEndInput.value;
        }
    }

    function setOrdersMoreMenuOpen(open) {
        if (!ordersMoreMenu) return;
        if (open) {
            ordersMoreMenu.classList.add("is-open");
            ordersMoreMenu.setAttribute("aria-hidden", "false");
        } else {
            ordersMoreMenu.classList.remove("is-open");
            ordersMoreMenu.setAttribute("aria-hidden", "true");
        }
    }

    function slipEscHtml(str) {
        if (typeof escapeHtml !== "undefined") {
            return escapeHtml(String(str == null ? "" : str));
        }
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatSlipOrderDate(orderDate) {
        if (window.OrderView && typeof window.OrderView.formatOrderDateYmdSlash === "function") {
            return window.OrderView.formatOrderDateYmdSlash(orderDate);
        }
        const d = new Date(orderDate);
        if (Number.isNaN(d.getTime())) return "—";
        const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
        const x = new Date(jstMs);
        const y = x.getUTCFullYear();
        const m = String(x.getUTCMonth() + 1).padStart(2, "0");
        const day = String(x.getUTCDate()).padStart(2, "0");
        return y + "/" + m + "/" + day;
    }

    function collectSelectedOrdersForSlip() {
        if (selectedOrderIds.size === 0) return [];
        const idSet = selectedOrderIds;
        return allOrderList.filter(function (o) {
            return idSet.has(String(o.orderId != null ? o.orderId : ""));
        });
    }

    function buildOrderSlipsPrintHtml(orders, preview) {
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
            ".print-preview-toolbar button:hover{background:#2563eb;}" +
            ".print-preview-hint{font-size:0.82rem;opacity:0.9;}" +
            ".order-slip{border:2px solid #111;padding:14px 16px;margin:0 0 20px;}" +
            ".order-slip-title{margin:0 0 12px;font-size:1.25rem;letter-spacing:0.05em;border-bottom:2px solid #111;padding-bottom:6px;}" +
            ".order-slip-meta{width:100%;border-collapse:collapse;margin-bottom:12px;}" +
            ".order-slip-meta td,.order-slip-meta th{border:1px solid #ccc;padding:6px 8px;vertical-align:top;}" +
            ".order-slip-meta th{width:7.5em;background:#f3f4f6;text-align:left;font-weight:700;}" +
            ".order-slip-items{width:100%;border-collapse:collapse;margin-top:8px;}" +
            ".order-slip-items th,.order-slip-items td{border:1px solid #ccc;padding:5px 6px;}" +
            ".order-slip-items th{background:#e5e7eb;text-align:left;}" +
            ".order-slip-total{text-align:right;font-weight:700;margin-top:8px;font-size:1.05rem;}" +
            "@media print{.no-print{display:none!important;}.order-slip{page-break-after:always;border:1px solid #000;}.order-slip:last-of-type{page-break-after:auto;}body{padding:8px;}}" +
            "</style>";

        const blocks = orders.map(function (order) {
            const info = order.deliveryInfo || {};
            const dateStr = formatSlipOrderDate(order.orderDate);
            const delivDate = info.dateUnknown ? "確約不可" : slipEscHtml(info.date || "—");
            const addr = slipEscHtml(info.address || "");
            const note = slipEscHtml(info.note || "");
            const tel = slipEscHtml(info.tel || "");
            const clientOrd = slipEscHtml(info.clientOrderNumber || "");
            let rows = "";
            let sum = 0;
            (order.items || []).forEach(function (item) {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const sub = qty * price;
                sum += sub;
                rows +=
                    "<tr><td>" +
                    slipEscHtml(item.code) +
                    "</td><td>" +
                    slipEscHtml(item.name) +
                    "</td><td style='text-align:right'>" +
                    qty +
                    "</td><td style='text-align:right'>¥" +
                    price.toLocaleString() +
                    "</td><td style='text-align:right'>¥" +
                    sub.toLocaleString() +
                    "</td></tr>";
            });
            const totalShown = order.totalAmount != null ? Number(order.totalAmount) : sum;
            return (
                '<article class="order-slip">' +
                '<h1 class="order-slip-title">注文伝票</h1>' +
                '<table class="order-slip-meta">' +
                "<tr><th>注文ID</th><td>" +
                slipEscHtml(order.orderId) +
                "</td><th>注文日</th><td>" +
                slipEscHtml(dateStr) +
                "</td></tr>" +
                "<tr><th>ステータス</th><td colspan=\"3\">" +
                slipEscHtml(order.status || "未発送") +
                "</td></tr>" +
                "<tr><th>得意先</th><td colspan=\"3\">" +
                slipEscHtml(order.customerId || "") +
                " " +
                slipEscHtml(order.customerName || "") +
                "</td></tr>" +
                "<tr><th>納品先</th><td colspan=\"3\">" +
                slipEscHtml(info.name || "") +
                " 様</td></tr>" +
                "<tr><th>住所</th><td colspan=\"3\">" +
                addr +
                "</td></tr>" +
                "<tr><th>TEL</th><td>" +
                tel +
                "</td><th>納品指定日</th><td>" +
                delivDate +
                "</td></tr>" +
                "<tr><th>得意先注文番号</th><td colspan=\"3\">" +
                clientOrd +
                "</td></tr>" +
                "<tr><th>備考</th><td colspan=\"3\">" +
                note +
                "</td></tr>" +
                "</table>" +
                '<table class="order-slip-items">' +
                "<thead><tr><th>商品コード</th><th>商品名</th><th style='text-align:right'>数量</th><th style='text-align:right'>単価</th><th style='text-align:right'>金額</th></tr></thead><tbody>" +
                rows +
                "</tbody></table>" +
                '<div class="order-slip-total">合計 ¥' +
                totalShown.toLocaleString() +
                "</div>" +
                "</article>"
            );
        });

        return (
            "<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"UTF-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<title>伝票印刷</title>" +
            style +
            "</head><body>" +
            toolbar +
            blocks.join("") +
            "</body></html>"
        );
    }

    function openOrderSlipsPrintWindow(orders, preview) {
        const html = buildOrderSlipsPrintHtml(orders, preview);
        let blobUrl = null;
        try {
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            blobUrl = URL.createObjectURL(blob);
        } catch (err) {
            console.error(err);
            toastError("印刷用ページの生成に失敗しました");
            return;
        }
        const newTab = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!newTab) {
            URL.revokeObjectURL(blobUrl);
            toastError("新しいタブで開けませんでした（ブラウザでポップアップ／新規タブを許可してください）");
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

    function ordersPrintSlipModalEscHandler(e) {
        if (e.key === "Escape") {
            setOrdersPrintSlipModalOpen(false);
        }
    }

    function setOrdersPrintSlipModalOpen(open) {
        if (!ordersPrintSlipModal) return;
        if (open) {
            setOrdersDownloadModalOpen(false);
            ordersPrintSlipModal.classList.add("is-open");
            ordersPrintSlipModal.setAttribute("aria-hidden", "false");
            document.addEventListener("keydown", ordersPrintSlipModalEscHandler);
        } else {
            ordersPrintSlipModal.classList.remove("is-open");
            ordersPrintSlipModal.setAttribute("aria-hidden", "true");
            document.removeEventListener("keydown", ordersPrintSlipModalEscHandler);
        }
    }

    async function downloadOrdersListExport(format, filterOverrides, options) {
        const fromSelection = options && options.fromSelection === true;
        let orders;
        if (fromSelection) {
            if (selectedOrderIds.size === 0) {
                toastError("出力する注文がありません（チェックしてください）");
                return;
            }
            const idSet = selectedOrderIds;
            orders = allOrderList.filter(function (o) {
                return idSet.has(String(o.orderId != null ? o.orderId : ""));
            });
            if (orders.length === 0) {
                toastError("選択した注文が見つかりません。一覧を再読み込みしてからやり直してください。");
                return;
            }
        } else {
            orders = computeFilteredOrders(filterOverrides);
            if (orders.length === 0) {
                toastError("出力する注文がありません");
                return;
            }
        }
        try {
            const response = await fetch("/api/admin/orders-list-export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ format: format, orders: orders })
            });
            if (!response.ok) {
                let msg = "ダウンロードに失敗しました (" + response.status + ")";
                try {
                    const j = await response.json();
                    if (j.message) msg = j.message;
                } catch (_) { /* binary or plain */ }
                toastError(msg);
                return;
            }
            const blob = await response.blob();
            const cd = response.headers.get("Content-Disposition") || "";
            const match = cd.match(/filename="([^"]+)"/);
            const fallback =
                format === "xlsx" ? "orders_list.xlsx" : "orders_list.csv";
            const filename = match ? match[1] : fallback;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toastSuccess("ダウンロードを開始しました");
        } catch (e) {
            console.error(e);
            toastError("ダウンロードに失敗しました");
        }
    }

    if (btnOrdersDownload && ordersDownloadModal) {
        btnOrdersDownload.addEventListener("click", function (e) {
            e.stopPropagation();
            syncOrdersDownloadModalFromToolbar();
            setOrdersMoreMenuOpen(false);
            setOrdersDownloadModalOpen(true);
        });
    }

    if (ordersDownloadModalBackdrop) {
        ordersDownloadModalBackdrop.addEventListener("click", function () {
            setOrdersDownloadModalOpen(false);
        });
    }
    if (ordersDownloadModalCancel) {
        ordersDownloadModalCancel.addEventListener("click", function () {
            setOrdersDownloadModalOpen(false);
        });
    }
    if (ordersDownloadModalSubmit && ordersDownloadModal) {
        ordersDownloadModalSubmit.addEventListener("click", function (e) {
            e.stopPropagation();
            const fmtInput = ordersDownloadModal.querySelector('input[name="orders-download-format"]:checked');
            const fmt = fmtInput ? fmtInput.value : "csv";
            const selectedOnlyEl = document.getElementById("orders-download-modal-selected-only");
            const selectedOnly = selectedOnlyEl && selectedOnlyEl.checked;
            if (selectedOnly && selectedOrderIds.size === 0) {
                toastWarning("チェックした注文がありません");
                return;
            }
            const filterOverrides = {
                status: ordersDownloadModalStatus ? ordersDownloadModalStatus.value : "",
                dateStart: ordersDownloadModalDateStart ? ordersDownloadModalDateStart.value : "",
                dateEnd: ordersDownloadModalDateEnd ? ordersDownloadModalDateEnd.value : ""
            };
            setOrdersDownloadModalOpen(false);
            if (fmt === "csv" || fmt === "xlsx") {
                if (selectedOnly) {
                    downloadOrdersListExport(fmt, null, { fromSelection: true });
                } else {
                    downloadOrdersListExport(fmt, filterOverrides);
                }
            }
        });
    }

    if (ordersDownloadModal) {
        ordersDownloadModal.querySelector(".orders-download-modal__dialog")?.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    if (ordersPrintSlipModalBackdrop) {
        ordersPrintSlipModalBackdrop.addEventListener("click", function () {
            setOrdersPrintSlipModalOpen(false);
        });
    }
    if (ordersPrintSlipModalCancel) {
        ordersPrintSlipModalCancel.addEventListener("click", function () {
            setOrdersPrintSlipModalOpen(false);
        });
    }
    if (ordersPrintSlipModalSubmit && ordersPrintSlipModal) {
        ordersPrintSlipModalSubmit.addEventListener("click", function (e) {
            e.stopPropagation();
            const modeInput = ordersPrintSlipModal.querySelector('input[name="orders-print-slip-mode"]:checked');
            const mode = modeInput ? modeInput.value : "preview";
            const preview = mode === "preview";
            const selected = collectSelectedOrdersForSlip();
            if (selected.length === 0) {
                toastWarning("一覧でチェックした伝票がありません");
                return;
            }
            setOrdersPrintSlipModalOpen(false);
            openOrderSlipsPrintWindow(selected, preview);
        });
    }
    if (ordersPrintSlipModal) {
        ordersPrintSlipModal.querySelector(".orders-download-modal__dialog")?.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    if (btnPrintSelectedSlips) {
        btnPrintSelectedSlips.addEventListener("click", function (e) {
            e.stopPropagation();
            if (selectedOrderIds.size === 0) {
                toastWarning("一覧でチェックした伝票がありません");
                return;
            }
            setOrdersMoreMenuOpen(false);
            setOrdersPrintSlipModalOpen(true);
        });
    }

    const btnDeleteSelectedOrders = document.getElementById("btn-delete-selected-orders");
    if (btnDeleteSelectedOrders) {
        btnDeleteSelectedOrders.addEventListener("click", async function (e) {
            e.stopPropagation();
            if (selectedOrderIds.size === 0) {
                toastWarning("チェックした注文がありません");
                return;
            }
            const selected = collectSelectedOrdersForSlip();
            if (selected.length === 0) {
                toastWarning("選択した注文が見つかりません。一覧を再読み込みしてください。");
                return;
            }
            const lines = selected.slice(0, 8).map(function (o) {
                const id = o.orderId != null ? String(o.orderId) : "";
                const nm = o.customerName ? String(o.customerName) : "";
                return nm ? id + "（" + nm + "）" : id;
            });
            const extra = selected.length > 8 ? "\n… ほか " + (selected.length - 8) + " 件" : "";
            const confirmMsg =
                "【重要】チェックした " +
                selected.length +
                " 件の注文をデータから完全に削除します。\n取り消せません。よろしいですか？\n\n" +
                lines.join("\n") +
                extra;
            if (!confirm(confirmMsg)) return;
            setOrdersMoreMenuOpen(false);
            let ok = 0;
            let fail = 0;
            const failedIds = [];
            for (let i = 0; i < selected.length; i++) {
                const o = selected[i];
                const oid = o.orderId;
                try {
                    const { ok: success, message } = await postDeleteOrderRequest(oid);
                    if (success) {
                        ok++;
                        selectedOrderIds.delete(String(oid != null ? oid : ""));
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
                toastSuccess(ok + " 件の注文を削除しました" + (fail > 0 ? "（" + fail + " 件は失敗）" : ""));
                fetchOrders();
            }
            if (fail > 0 && ok === 0) {
                toastError("削除に失敗しました。\n" + failedIds.slice(0, 5).join("\n"));
            } else if (fail > 0 && ok > 0) {
                toastWarning(fail + " 件の削除に失敗しました。\n" + failedIds.slice(0, 3).join("\n"));
            }
        });
    }

    if (btnOrdersMore && ordersMoreMenu) {
        btnOrdersMore.addEventListener("click", function (e) {
            e.stopPropagation();
            const opening = !ordersMoreMenu.classList.contains("is-open");
            setOrdersMoreMenuOpen(opening);
            if (opening) {
                setOrdersDownloadModalOpen(false);
                setOrdersPrintSlipModalOpen(false);
            }
        });
    }

    document.addEventListener("click", function () {
        setOrdersMoreMenuOpen(false);
    });

    /**
     * いずれかの詳細が開いているとき、詳細が閉じている注文の要約行だけ薄くする。
     */
    function syncOrderSummaryRowDimming(tbody) {
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

    /**
     * 要約行に対応する詳細行の表示を切り替える（一覧用）
     */
    function toggleOrderDetailRow(sumTr, detTr, toggleBtn) {
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
        if (tbody) syncOrderSummaryRowDimming(tbody);
    }

    const btnCloseAllOrderDetails = document.getElementById("btn-close-all-order-details");
    if (btnCloseAllOrderDetails && orderListContainer) {
        btnCloseAllOrderDetails.addEventListener("click", function (e) {
            e.stopPropagation();
            setOrdersMoreMenuOpen(false);
            orderListContainer.querySelectorAll(".order-detail-row").forEach(function (row) {
                row.style.display = "none";
            });
            orderListContainer.querySelectorAll(".btn-toggle-detail").forEach(function (btn) {
                btn.textContent = "詳細 ▼";
                btn.style.backgroundColor = "#dfe3e6";
                btn.style.borderColor = "#c5cdd5";
                btn.setAttribute("aria-expanded", "false");
            });
            orderListContainer.querySelectorAll(".orders-list-table tbody").forEach(syncOrderSummaryRowDimming);
        });
    }

    // ---------------------------------------------------------
    // 一覧チェック（複数選択）
    // ---------------------------------------------------------
    function orderSelectionKeyFromCheckbox(ch) {
        const id = ch.getAttribute("data-order-id");
        return id != null ? String(id) : "";
    }

    function updateOrdersSelectionCountLabel(resultInfoEl) {
        const span = resultInfoEl && resultInfoEl.querySelector(".orders-selection-count");
        if (!span) return;
        const n = selectedOrderIds.size;
        if (n === 0) {
            span.textContent = "";
        } else {
            span.textContent = `· 選択中 ${n}件`;
        }
    }

    function syncOrderSelectAllCheckbox(table) {
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

    function attachOrderRowSelectionHandlers(table, resultInfoEl) {
        const selectAll = table.querySelector(".order-select-all");
        table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
            const key = orderSelectionKeyFromCheckbox(ch);
            ch.checked = key !== "" && selectedOrderIds.has(key);
        });
        syncOrderSelectAllCheckbox(table);

        if (selectAll) {
            selectAll.addEventListener("change", function () {
                const on = selectAll.checked;
                table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
                    const key = orderSelectionKeyFromCheckbox(ch);
                    if (!key) return;
                    ch.checked = on;
                    if (on) selectedOrderIds.add(key);
                    else selectedOrderIds.delete(key);
                });
                selectAll.indeterminate = false;
                updateOrdersSelectionCountLabel(resultInfoEl);
            });
        }

        table.querySelectorAll("tbody .order-row-select").forEach(function (ch) {
            ch.addEventListener("change", function () {
                const key = orderSelectionKeyFromCheckbox(ch);
                if (!key) return;
                if (ch.checked) selectedOrderIds.add(key);
                else selectedOrderIds.delete(key);
                syncOrderSelectAllCheckbox(table);
                updateOrdersSelectionCountLabel(resultInfoEl);
            });
        });
    }

    // ---------------------------------------------------------
    // 描画ロジック (Viewの呼び出し)
    // ---------------------------------------------------------
    function displayOrders(orders) {
        orderListContainer.innerHTML = "";

        if (orders.length === 0) {
            orderListContainer.innerHTML = "<p>該当する注文はありません</p>";
            return;
        }

        if (!window.OrderView) {
            orderListContainer.innerHTML = "<p style='color:red;'>OrderView module is missing.</p>";
            return;
        }

        const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE));
        if (ordersCurrentPage > totalPages) ordersCurrentPage = totalPages;
        const page = ordersCurrentPage;
        const startIdx = (page - 1) * ORDERS_PAGE_SIZE;
        const limitedOrders = orders.slice(startIdx, startIdx + ORDERS_PAGE_SIZE);
        const fromN = startIdx + 1;
        const toN = startIdx + limitedOrders.length;

        const resultInfo = document.createElement("div");
        resultInfo.style.marginBottom = "10px";
        resultInfo.style.fontSize = "0.9rem";
        resultInfo.style.color = "#6b7280";

        if (totalPages > 1) {
            resultInfo.innerHTML =
                `該当: <strong>${orders.length}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示` +
                ' <span class="orders-selection-count" style="margin-left:12px;color:#2563eb;font-weight:600;"></span>';
        } else {
            resultInfo.innerHTML =
                `該当: <strong>${orders.length}</strong> 件` +
                ' <span class="orders-selection-count" style="margin-left:12px;color:#2563eb;font-weight:600;"></span>';
        }
        orderListContainer.appendChild(resultInfo);
        updateOrdersSelectionCountLabel(resultInfo);

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
            '<th scope="col">注文日</th>' +
            '<th scope="col">注文ID</th>' +
            '<th scope="col">ステータス</th>' +
            '<th scope="col">得意先</th>' +
            '<th scope="col">納品先</th>' +
            '<th scope="col" class="col-numeric">合計金額</th>' +
            '<th scope="col" class="col-export">連携</th>' +
            '<th scope="col" class="col-action">操作</th>' +
            "</tr></thead>";

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        orderListContainer.appendChild(tableWrap);

        const actions = {
            updateDeliveryEstimate: updateDeliveryEstimate,
            registerBatch: registerShipmentBatch,
            deleteOrder: deleteOrder
        };

        limitedOrders.forEach(order => {
            const htmlData = window.OrderView.generateOrderCardHTML(order);

            const sumTr = document.createElement("tr");
            sumTr.className = "order-summary-row";
            sumTr.innerHTML = htmlData.summaryCellsHtml;

            const detTr = document.createElement("tr");
            detTr.className = "order-detail-row";
            detTr.style.display = "none";

            const detTd = document.createElement("td");
            detTd.colSpan = 9;
            detTd.className = "order-detail-cell";

            const detailInner = document.createElement("div");
            detailInner.className = "order-detail-inner";
            detailInner.innerHTML = htmlData.detailContent;

            const operationArea = window.OrderView.createOperationArea(order, actions);
            detailInner.appendChild(operationArea);

            detTd.appendChild(detailInner);
            detTr.appendChild(detTd);

            setupDetailEvents(detailInner, order);

            const toggleBtn = sumTr.querySelector(".btn-toggle-detail");
            if (toggleBtn) {
                toggleBtn.setAttribute("aria-expanded", "false");
                toggleBtn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    toggleOrderDetailRow(sumTr, detTr, toggleBtn);
                });
            }

            sumTr.addEventListener("click", function (e) {
                if (e.target.closest(".col-select") || e.target.closest(".order-row-select")) {
                    return;
                }
                if (e.target.closest(".btn-toggle-detail")) {
                    return;
                }
                toggleOrderDetailRow(sumTr, detTr, toggleBtn);
            });

            tbody.appendChild(sumTr);
            tbody.appendChild(detTr);
        });

        attachOrderRowSelectionHandlers(table, resultInfo);

        if (totalPages > 1) {
            orderListContainer.appendChild(buildOrdersPaginationNav(totalPages, page));
        }
    }

    function setupDetailEvents(detailDiv, order) {
        // 出荷履歴修正イベント
        detailDiv.querySelectorAll(".btn-edit-shipment").forEach(btn => {
            btn.addEventListener("click", function() {
                toggleShipmentEditMode(detailDiv, this.dataset.shipmentId, true);
            });
        });
        detailDiv.querySelectorAll(".btn-cancel-edit").forEach(btn => {
            btn.addEventListener("click", function() {
                toggleShipmentEditMode(detailDiv, this.dataset.shipmentId, false);
            });
        });
        detailDiv.querySelectorAll(".btn-save-shipment").forEach(btn => {
            btn.addEventListener("click", function() {
                const sId = this.dataset.shipmentId;
                const row = detailDiv.querySelector(`.shipment-row[data-shipment-id="${sId}"]`);
                const company = row.querySelector(".edit-company").value;
                const number = row.querySelector(".edit-number").value;
                const date = row.querySelector(".edit-date").value;
                const unknown = row.querySelector(".edit-date-unknown").checked;

                if(confirm("この出荷情報を更新しますか？")) {
                    updateShipmentInfo(order.orderId, sId, company, number, date, unknown);
                }
            });
        });

        // 連携ステータスリセットボタン
        const btnResetExport = detailDiv.querySelector(".btn-reset-export");
        if(btnResetExport) {
            btnResetExport.addEventListener("click", function() {
                if(confirm("【警告】\nCSV連携状態を「未連携」に戻します。\n次回の「未連携出力」対象に含まれるようになります。\n実行しますか？")) {
                    resetExportStatus(order.orderId);
                }
            });
        }
    }

    function toggleShipmentEditMode(container, shipmentId, isEdit) {
        const row = container.querySelector(`.shipment-row[data-shipment-id="${shipmentId}"]`);
        if(!row) return;
        const viewMode = row.querySelector(".view-mode");
        const editMode = row.querySelector(".edit-mode");
        if(isEdit) {
            viewMode.style.display = "none";
            editMode.style.display = "block";
        } else {
            viewMode.style.display = "block";
            editMode.style.display = "none";
        }
    }

    // ---------------------------------------------------------
    // イベント監視 (Debounce適用)
    // ---------------------------------------------------------
    
    const debouncedSearch = debounce(execClientSearch, 300);

    if (dateStartInput) dateStartInput.addEventListener("change", execClientSearch);
    if (dateEndInput) dateEndInput.addEventListener("change", execClientSearch);
    if (statusSelect) statusSelect.addEventListener("change", execClientSearch);

    if (searchTextInput) searchTextInput.addEventListener("input", debouncedSearch);

    if (searchBtn) searchBtn.addEventListener("click", execClientSearch);

    // 未連携CSV出力（その他メニュー内）
    if (btnCsvUnexported) {
        btnCsvUnexported.addEventListener("click", function (e) {
            e.stopPropagation();
            if(!confirm("【重要】\n「未連携の注文データ」をCSV出力し、システム上で「連携済」としてマークします。\nよろしいですか？")) return;
            
            const params = new URLSearchParams({ mode: "unexported" });
            window.location.href = `/api/download-csv?${params.toString()}`;
            
            setTimeout(() => {
                toastInfo("CSV出力を開始しました。連携済ステータスを反映します。", 4000);
                fetchOrders();
            }, 3000);
        });
    }
});