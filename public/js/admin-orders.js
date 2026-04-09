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
    const btnCsvSearchResult = document.querySelector("#btn-csv-search-result");

    const fileInput = document.getElementById("file-input");
    const uploadStatus = document.getElementById("upload-status");
    const btnCsvExcelImport = document.getElementById("btn-csv-excel-import");
    const btnOrdersDownload = document.getElementById("btn-orders-download");
    const ordersDownloadMenu = document.getElementById("orders-download-menu");

    // 全データを保持するメモリ
    let allOrderList = [];
    let lastFilteredOrders = [];
    let ordersCurrentPage = 1;
    const ORDERS_PAGE_SIZE = 25;

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
            const response = await fetch("/api/admin/orders-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ orderId: orderId })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                toastSuccess("注文を削除しました");
                fetchOrders();
            } else {
                toastError(data.message || "削除に失敗しました");
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
    function computeFilteredOrders() {
        const status = statusSelect ? statusSelect.value : "";
        const start = dateStartInput ? dateStartInput.value : "";
        const end = dateEndInput ? dateEndInput.value : "";

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

    function setOrdersDownloadMenuOpen(open) {
        if (!ordersDownloadMenu) return;
        if (open) {
            ordersDownloadMenu.classList.add("is-open");
            ordersDownloadMenu.setAttribute("aria-hidden", "false");
        } else {
            ordersDownloadMenu.classList.remove("is-open");
            ordersDownloadMenu.setAttribute("aria-hidden", "true");
        }
    }

    async function downloadOrdersListExport(format) {
        const orders = computeFilteredOrders();
        if (orders.length === 0) {
            toastError("出力する注文がありません");
            return;
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

    if (btnOrdersDownload && ordersDownloadMenu) {
        btnOrdersDownload.addEventListener("click", function (e) {
            e.stopPropagation();
            const isOpen = ordersDownloadMenu.classList.contains("is-open");
            setOrdersDownloadMenuOpen(!isOpen);
        });
        ordersDownloadMenu.querySelectorAll("[data-export-format]").forEach(function (btn) {
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                const fmt = btn.getAttribute("data-export-format");
                setOrdersDownloadMenuOpen(false);
                if (fmt === "csv" || fmt === "xlsx") {
                    downloadOrdersListExport(fmt);
                }
            });
        });
        document.addEventListener("click", function () {
            setOrdersDownloadMenuOpen(false);
        });
    }

    const btnCloseAllOrderDetails = document.getElementById("btn-close-all-order-details");
    if (btnCloseAllOrderDetails && orderListContainer) {
        btnCloseAllOrderDetails.addEventListener("click", function () {
            orderListContainer.querySelectorAll(".order-detail-row").forEach(function (row) {
                row.style.display = "none";
            });
            orderListContainer.querySelectorAll(".btn-toggle-detail").forEach(function (btn) {
                btn.textContent = "詳細 ▼";
                btn.style.backgroundColor = "#b7dbff";
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
                `該当: <strong>${orders.length}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示`;
        } else {
            resultInfo.innerHTML = `該当: <strong>${orders.length}</strong> 件`;
        }
        orderListContainer.appendChild(resultInfo);

        const tableWrap = document.createElement("div");
        tableWrap.className = "orders-list-wrap";

        const table = document.createElement("table");
        table.className = "orders-list-table";
        table.setAttribute("role", "grid");
        table.innerHTML =
            "<thead><tr>" +
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
            detTd.colSpan = 8;
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
                toggleBtn.addEventListener("click", function () {
                    const isHidden = detTr.style.display === "none";
                    detTr.style.display = isHidden ? "table-row" : "none";
                    toggleBtn.textContent = isHidden ? "閉じる ▲" : "詳細 ▼";
                    toggleBtn.style.backgroundColor = "#b7dbff";
                });
            }

            tbody.appendChild(sumTr);
            tbody.appendChild(detTr);
        });

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

    // CSVアクション
    if (btnCsvUnexported) {
        btnCsvUnexported.addEventListener("click", function () {
            if(!confirm("【重要】\n「未連携の注文データ」をCSV出力し、システム上で「連携済」としてマークします。\nよろしいですか？")) return;
            
            const params = new URLSearchParams({ mode: "unexported" });
            window.location.href = `/api/download-csv?${params.toString()}`;
            
            setTimeout(() => {
                toastInfo("CSV出力を開始しました。連携済ステータスを反映します。", 4000);
                fetchOrders();
            }, 3000);
        });
    }

    if (btnCsvSearchResult) {
        btnCsvSearchResult.addEventListener("click", function () {
            const params = new URLSearchParams({
                status: statusSelect.value,
                start: dateStartInput.value,
                end: dateEndInput.value,
                keyword: searchTextInput ? searchTextInput.value : ""
            });
            window.location.href = `/api/download-csv?${params.toString()}`;
        });
    }
});