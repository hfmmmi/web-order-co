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
    
    // 検索窓
    const custInput = document.querySelector("#order-search-cust");
    const prodInput = document.querySelector("#order-search-prod");
    
    // クリアボタン
    const clearCustBtn = document.querySelector("#clear-cust-btn");
    const clearProdBtn = document.querySelector("#clear-prod-btn");
    
    const searchBtn = document.querySelector("#order-search-btn");
    
    // CSVボタン2種
    const btnCsvUnexported = document.querySelector("#btn-csv-unexported");
    const btnCsvSearchResult = document.querySelector("#btn-csv-search-result");

    // ドラッグ＆ドロップ要素
    const dropArea = document.getElementById("drop-area");
    const fileInput = document.getElementById("file-input");
    const uploadStatus = document.getElementById("upload-status");

    // 候補リスト(datalist)
    const custCandidatesList = document.querySelector("#order-customer-list");
    const prodCandidatesList = document.querySelector("#order-product-list");

    // 全データを保持するメモリ
    let allOrderList = [];

    // 初期化
    if(dateStartInput) dateStartInput.value = "";
    if(dateEndInput) dateEndInput.value = "";
    
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
    if (dropArea && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
        });

        dropArea.addEventListener('drop', handleDrop, false);
        
        dropArea.addEventListener('click', (e) => {
            if (e.target !== fileInput) {
                e.preventDefault();
                fileInput.click();
            }
        });
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }

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
    
    [custInput, prodInput].forEach(input => {
        if(input) {
            input.addEventListener("keydown", function(e) {
                if(e.key === "Enter") {
                    e.preventDefault();
                    if(searchBtn) searchBtn.click();
                }
            });
        }
    });

    function setupClearButton(btn, input) {
        if (!btn || !input) return;
        btn.addEventListener("click", () => {
            input.value = "";
            input.focus();
            input.dispatchEvent(new Event("input"));
        });
    }
    setupClearButton(clearCustBtn, custInput);
    setupClearButton(clearProdBtn, prodInput);


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
    function execClientSearch() {
        const status = statusSelect ? statusSelect.value : "";
        const start = dateStartInput ? dateStartInput.value : "";
        const end = dateEndInput ? dateEndInput.value : "";
        
        const rawCustVal = custInput ? custInput.value : "";
        const rawProdVal = prodInput ? prodInput.value : "";
        
        const custKeyword = normalizeString(rawCustVal);
        const prodKeyword = normalizeString(rawProdVal);

        const extractCode = (str) => {
            const match = str.match(/^\((.+?)\)/);
            return match && match[1] ? match[1].trim() : null;
        };
        const custCodeRaw = extractCode(rawCustVal); 
        const prodCodeRaw = extractCode(rawProdVal);

        const filtered = allOrderList.filter(order => {
            // ステータス
            if (status && order.status !== status) return false;

            // 日付
            if (start || end) {
                const d = new Date(order.orderDate);
                const jstTime = d.getTime() + (9 * 60 * 60 * 1000); 
                const jstDateObj = new Date(jstTime);
                const orderDateJST = jstDateObj.toISOString().split("T")[0]; 

                if (start && orderDateJST < start) return false;
                if (end && orderDateJST > end) return false;
            }

            // 顧客
            if (custKeyword) {
                let isCustMatch = false;
                const safeId = String(order.customerId || "");
                const safeName = order.customerName || "";

                if (custCodeRaw) {
                    if (safeId === custCodeRaw) isCustMatch = true;
                } else {
                    const targetText = `${safeId} ${safeName}`;
                    if (normalizeString(targetText).includes(custKeyword)) isCustMatch = true;
                }
                if (!isCustMatch) return false; 
            }

            // 商品
            if (prodKeyword) {
                let isProdMatch = false;
                if (order.items) {
                    isProdMatch = order.items.some(item => {
                        if (prodCodeRaw) {
                            return item.code === prodCodeRaw;
                        } else {
                            const itemText = `${item.code} ${item.name}`;
                            return normalizeString(itemText).includes(prodKeyword);
                        }
                    });
                }
                if (!isProdMatch) return false;
            }

            return true;
        });

        // ★Viewへ委譲: 候補リスト生成
        if (window.OrderView) {
            window.OrderView.generateSplitCandidates(filtered, custCandidatesList, prodCandidatesList);
            displayOrders(filtered);
        } else {
            console.error("OrderView module not loaded!");
        }
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

        const DISPLAY_LIMIT = 100;
        const limitedOrders = orders.slice(0, DISPLAY_LIMIT);

        // 結果件数表示
        const resultInfo = document.createElement("div");
        resultInfo.style.marginBottom = "10px";
        resultInfo.style.fontSize = "0.9rem";
        resultInfo.style.color = "#6b7280";
        
        if (orders.length > DISPLAY_LIMIT) {
            resultInfo.innerHTML = `該当: <strong>${orders.length}</strong> 件中、上位 <strong>${DISPLAY_LIMIT}</strong> 件を表示しています。<br><span style="font-size:0.8rem">※過去データは「顧客名」等で検索して絞り込んでください。</span>`;
        } else {
            resultInfo.innerHTML = `該当: <strong>${orders.length}</strong> 件`;
        }
        orderListContainer.appendChild(resultInfo);

        // Viewモジュールの関数呼び出し
        if (!window.OrderView) {
            orderListContainer.innerHTML = "<p style='color:red;'>OrderView module is missing.</p>";
            return;
        }

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
            '<th scope="col">納品先・請求先</th>' +
            '<th scope="col">商品</th>' +
            '<th scope="col" class="col-numeric">合計金額</th>' +
            '<th scope="col">連携</th>' +
            '<th scope="col" class="col-action">操作</th>' +
            "</tr></thead>";

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        orderListContainer.appendChild(tableWrap);

        const actions = {
            updateDeliveryEstimate: updateDeliveryEstimate,
            registerBatch: registerShipmentBatch
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
                    toggleBtn.style.backgroundColor = isHidden ? "#64748b" : "#3b82f6";
                });
            }

            tbody.appendChild(sumTr);
            tbody.appendChild(detTr);
        });
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

    if (custInput) custInput.addEventListener("input", debouncedSearch);
    if (prodInput) prodInput.addEventListener("input", debouncedSearch);

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
                keyword: custInput.value 
            });
            window.location.href = `/api/download-csv?${params.toString()}`;
        });
    }
});