document.addEventListener("DOMContentLoaded", function () {
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
    const btnRefreshHistory = document.getElementById("btn-refresh-history");

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
                <div>
                    <div style="font-weight:700; color:#111827;">${item.maker} / ${item.name} ${badgeHtml}</div>
                    <div class="price-text">空カートリッジ単価: ¥${item.price.toLocaleString()}</div>
                </div>
                <div><input type="number" min="0" class="qty-input" data-id="${item.id}" value="${cart[item.id]||0}" style="width:60px; text-align:right; padding:8px; border:1px solid #d1d5db; border-radius:6px;"> 個</div>`;

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
    function updateCart() {
        let total = 0;
        const groups = { "兵庫": [], "大阪": [] };
        Object.keys(cart).forEach(id => {
            const item = fullMasterData.find(d => d.id === id);
            if(item){
                const sub = item.price * cart[id];
                total += sub;
                const dest = groups[item.destination] ? item.destination : "大阪";
                groups[dest].push({ name: item.name, qty: cart[id], sub: sub });
            }
        });

        let html = "";
        if (groups["兵庫"].length > 0) {
            html += `<div style="margin-bottom:15px; border-left:3px solid #D6E7F1; padding-left:10px;">
                        <div style="font-weight:700; color:#374151; font-size:0.9rem;">兵庫センター行</div>
                        <ul style="padding-left:0; margin:6px 0; list-style:none;">`;
            groups["兵庫"].forEach(g => html += `<li style="font-size:0.85rem; color:#374151;">${g.name} x ${g.qty}</li>`);
            html += `</ul></div>`;
        }
        if (groups["大阪"].length > 0) {
            html += `<div style="margin-bottom:15px; border-left:3px solid #9ca3af; padding-left:10px;">
                        <div style="font-weight:700; color:#374151; font-size:0.9rem;">大阪センター行</div>
                        <ul style="padding-left:0; margin:6px 0; list-style:none;">`;
            groups["大阪"].forEach(g => html += `<li style="font-size:0.85rem; color:#374151;">${g.name} x ${g.qty}</li>`);
            html += `</ul></div>`;
        }

        if (total === 0) html = "<p class=\"kaitori-intro-muted\">商品を選択してください</p>";
        cartContainer.innerHTML = html;
        totalPriceDisplay.textContent = `合計: ¥${total.toLocaleString()}`;
        
        if(btnPreSubmit) {
            btnPreSubmit.disabled = (total === 0);
        }
        return groups;
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

            if (list.length === 0) {
                historyContainer.innerHTML = "<p class=\"kaitori-intro-muted\">履歴はありません。</p>";
                return;
            }

            // テーブルヘッダー
            let html = `<table class="history-table">
                <thead>
                    <tr>
                        <th style="width:140px;">申請日時</th>
                        <th>申請内容</th>
                        <th style="width:100px;">ステータス</th>
                        <th style="width:60px;">点数</th>
                        <th style="width:40px;"></th>
                    </tr>
                </thead>
                <tbody>`;
            
            list.forEach((item) => {
                const dateStr = new Date(item.requestDate).toLocaleString("ja-JP");
                let badgeClass = "st-blue";
                if (item.status.includes("完了") || item.status.includes("済") || item.status.includes("成立")) badgeClass = "st-green";
                if (item.status.includes("却下") || item.status.includes("不備") || item.status.includes("キャンセル")) badgeClass = "st-red";
                const totalQty = item.items ? item.items.reduce((sum, i) => sum + (i.qty || 0), 0) : 0;

                // 頭出しの作成
                let summary = "-";
                if (item.items && item.items.length > 0) {
                    const first = item.items[0];
                    summary = `<span style="font-weight:700; color:#111827;">${first.name}</span>`;
                    if (item.items.length > 1) {
                        summary += ` <span style="font-size:0.8rem; color:#6b7280;">...他 ${item.items.length - 1}種</span>`;
                    }
                }

                // === 詳細コンテンツのHTML構築 ===
                // 1. 物流情報
                let logisticsHtml = "";
                if (item.logistics) {
                    if (item.logistics.hyogo) {
                        logisticsHtml += `<div><strong>兵庫(回収):</strong> 梱包 ${item.logistics.hyogo.boxCount}個</div>`;
                    }
                    if (item.logistics.osaka) {
                        const os = item.logistics.osaka;
                        logisticsHtml += `<div style="margin-top:6px;"><strong>大阪(発送):</strong> 梱包 ${os.boxCount}個 / ${os.carrier || "-"} / No.${os.tracking || "-"}</div>`;
                    }
                }
                
                const noteHtml = item.customerNote 
                    ? `<div style="color:#374151; margin-top:8px; background:#f9fafb; padding:10px 12px; border-radius:8px; border:1px solid #e5e7eb; border-left:3px solid #D6E7F1;">
                         <strong>事務局メッセージ:</strong> ${item.customerNote}
                       </div>` 
                    : "";

                const metaHtml = `
                    <div style="margin-bottom:10px; font-size:0.9rem;">
                        <div style="margin-bottom:5px;"><b>受付番号:</b> ${item.requestId}</div>
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
                        const destTag = itm.destination === "兵庫" ? '<span style="color:#6b7280; font-size:0.8rem; font-weight:600;">[兵庫]</span>' : '<span style="color:#6b7280; font-size:0.8rem; font-weight:600;">[大阪]</span>';
                        tableHtml += `<tr>
                            <td>${destTag} ${itm.name}</td>
                            <td>¥${itm.price.toLocaleString()}</td>
                            <td>${itm.qty}</td>
                            <td style="text-align:right;">¥${sub.toLocaleString()}</td>
                        </tr>`;
                    });
                }
                tableHtml += `</tbody></table>
                    <div class="detail-total">合計査定額: ¥${grandTotal.toLocaleString()}</div>`;


                // === 行セットの追加 (親行 + 子行) ===
                html += `<tr class="history-main-row" data-id="${item.requestId}">
                    <td>${dateStr}</td>
                    <td>${summary}</td>
                    <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
                    <td>${totalQty}点</td>
                    <td style="text-align:center;"><span class="toggle-icon">▼</span></td>
                </tr>`;
                
                html += `<tr class="history-detail-row" id="detail-${item.requestId}">
                    <td colspan="5" style="padding:0; border:none;">
                        <div class="detail-content-wrapper">
                            ${metaHtml}
                            ${tableHtml}
                        </div>
                    </td>
                </tr>`;
            });

            html += `</tbody></table>`;
            historyContainer.innerHTML = html;

            // === クリックイベントの付与 ===
            document.querySelectorAll(".history-main-row").forEach(row => {
                row.addEventListener("click", function() {
                    const reqId = this.dataset.id;
                    const detailRow = document.getElementById(`detail-${reqId}`);
                    this.classList.toggle("active");
                    detailRow.classList.toggle("open");
                });
            });

        } catch (error) {
            console.error("History error", error);
            historyContainer.innerHTML = "<p class=\"kaitori-intro-muted\">読み込みエラー</p>";
        }
    }
    if(btnRefreshHistory) btnRefreshHistory.addEventListener("click", fetchHistory);


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
            if(groups["大阪"].length > 0) {
                if(!inputOsakaBox.value) { toastWarning("大阪行きの梱包個数を入力してください"); return; }
                if(!inputOsakaCarrier.value) { toastWarning("大阪行き：運送業者を選択してください"); return; }
                if(inputOsakaCarrier.value === "その他" && !inputOsakaCarrierOther.value.trim()) {
                    toastWarning("大阪行き：運送業者名を入力してください"); return;
                }
                if(!inputOsakaTracking.value.trim()) { toastWarning("大阪行き：送り状番号を入力してください"); return; }
                if(!inputOsakaDate.value) { toastWarning("大阪行き：出荷日を入力してください"); return; }
            }

            if(!confirm("この内容で確定しますか？")) return;

            let carrierName = inputOsakaCarrier.value;
            if(carrierName === "その他") carrierName = inputOsakaCarrierOther.value.trim();

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

    // 初期化
    fetchMaster();
});