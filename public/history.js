let allOrders = []; // 検索用に全データをここに保持しておく

/** 1ページあたりの表示件数（商品一覧のページ送りと同型UI） */
const HISTORY_PER_PAGE = 15;
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

// =========================================================
// 🔄 クイック再注文機能 (Quick Reorder)
// =========================================================
function quickReorder(order) {
    if (!order.items || order.items.length === 0) {
        toastWarning("再注文できる商品がありません");
        return;
    }

    // 確認ダイアログ
    const itemNames = order.items.slice(0, 3).map(i => i.name || i.code).join("、");
    const moreText = order.items.length > 3 ? `...他${order.items.length - 3}点` : "";
    
    if (!confirm(`以下の商品をカートに追加します：\n\n${itemNames}${moreText}\n\nよろしいですか？`)) {
        return;
    }

    // 既存のカートを取得
    let cart = [];
    const savedCart = sessionStorage.getItem("cart");
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }

    // 注文商品をカートに追加（既存アイテムがあれば数量を加算）
    order.items.forEach(item => {
        const code = item.code || item.productCode;
        if (!code) return; // コードがない場合はスキップ

        const existingItem = cart.find(c => (c.productCode === code || c.code === code));
        
        if (existingItem) {
            // 既存アイテムに数量を加算
            existingItem.quantity += item.quantity;
        } else {
            // 新規追加
            cart.push({
                productCode: code,
                code: code,
                name: item.name || "名称不明",
                price: item.price || 0,
                quantity: item.quantity
            });
        }
    });

    // sessionStorageに保存
    sessionStorage.setItem("cart", JSON.stringify(cart));

    // 成功メッセージとカートへ遷移
    toastSuccess(`${order.items.length}点の商品をカートに追加しました！`, 1500);
    
    // 少し待ってからカートページへ遷移
    setTimeout(() => {
        window.location.href = "cart.html";
    }, 1000);
}

document.addEventListener("DOMContentLoaded", function () {
    fetchHistory();

    // タブに戻った際に最新データを再取得（管理画面で納期目安更新後など）
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            fetchHistory().then(() => {
                const inp = document.querySelector("#history-search-input");
                if (inp && inp.value.trim()) filterOrders(inp.value);
            });
        }
    });

    // 検索ボタンと入力欄の取得
    const searchBtn = document.querySelector("#history-search-btn");
    const searchInput = document.querySelector("#history-search-input");

    if (searchBtn && searchInput) {
        // 1. クリックで検索
        searchBtn.addEventListener("click", function() {
            filterOrders(searchInput.value);
        });

        // ★2. Enterキーで検索 (機能追加)
        searchInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault(); // フォーム送信などを防ぐ
                searchBtn.click();  // ボタンクリックと同じ処理を実行
            }
        });
    }
});

// サーバーから履歴データをとってくる
async function fetchHistory() {
    const container = document.querySelector("#history-list-container");

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

        // データを保存して、画面に表示
        allOrders = data.history;
        renderHistoryList(allOrders, container);

        } catch (error) {
        console.error("履歴取得エラー", error);
        clearHistoryPagination();
        container.innerHTML = "<p class=\"history-error\">通信エラーが発生しました。</p>";
    }
}

// 検索フィルター機能 (クライアントサイドで絞り込み)
function filterOrders(keyword) {
    const container = document.querySelector("#history-list-container");
    
    if (!keyword) {
        // キーワードが空なら全件表示
        renderHistoryList(allOrders, container);
        return;
    }

    // ★重要: 検索語句を正規化（全角英数→半角、半角カナ→全角、小文字化）
    const normalizedKey = keyword.normalize('NFKC').toLowerCase();

    // 注文ID、商品名、荷主名などで検索
    const filtered = allOrders.filter(order => {
        // 比較対象もすべて正規化してからチェックする
        
        // 1. 注文ID
        const idMatch = String(order.orderId).normalize('NFKC').toLowerCase().includes(normalizedKey);
        
        // 2. 商品名・コード
        const itemMatch = order.items.some(item => {
            const name = item.name ? item.name.normalize('NFKC').toLowerCase() : "";
            const code = item.code ? item.code.normalize('NFKC').toLowerCase() : "";
            return name.includes(normalizedKey) || code.includes(normalizedKey);
        });
        
        // 3. 配送情報・荷主情報
        const info = order.deliveryInfo || {};
        const shipperName = (info.shipper && info.shipper.name) ? info.shipper.name.normalize('NFKC').toLowerCase() : "";
        const shipperMatch = shipperName.includes(normalizedKey);

        const deliveryName = info.name ? info.name.normalize('NFKC').toLowerCase() : "";
        const deliveryNameMatch = deliveryName.includes(normalizedKey);

        return idMatch || itemMatch || shipperMatch || deliveryNameMatch;
    });

    renderHistoryList(filtered, container);
}

// データをHTMLに変換して表示する（15件／ページ、商品一覧と同型のページ送り）
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

    pageOrders.forEach(order => {
        // HTML生成職人を呼び出す
        const htmlData = generateHistoryCardHTML(order);

        // カードの外枠
        const card = document.createElement("div");
        card.className = "history-card";
        
        // 概要(ヘッダー)
        card.innerHTML = htmlData.summary;

        // 詳細エリア(初期は非表示)
        const detailDiv = document.createElement("div");
        detailDiv.className = "history-detail-panel";
        detailDiv.style.display = "none";
        
        detailDiv.innerHTML = htmlData.detailContent;

        // 合体
        card.appendChild(detailDiv);

        // 開閉ボタンの動作
        const toggleBtn = card.querySelector(".btn-toggle-detail");
        toggleBtn.addEventListener("click", function () {
            if (detailDiv.style.display === "none") {
                detailDiv.style.display = "block";
                toggleBtn.textContent = "閉じる ▲";
                toggleBtn.classList.add("is-open");
            } else {
                detailDiv.style.display = "none";
                toggleBtn.textContent = "詳細を見る ▼";
                toggleBtn.classList.remove("is-open");
            }
        });

        // ★クイック再注文ボタンの動作
        const reorderBtn = card.querySelector(".btn-reorder");
        if (reorderBtn) {
            reorderBtn.addEventListener("click", function () {
                quickReorder(order);
            });
            // ホバーエフェクト
            reorderBtn.addEventListener("mouseenter", function() {
                this.style.transform = "scale(1.02)";
            });
            reorderBtn.addEventListener("mouseleave", function() {
                this.style.transform = "scale(1)";
            });
        }

        container.appendChild(card);
    });

    setupHistoryPagination(totalPages, historyCurrentPage);
}

// ★HTML生成職人 (顧客閲覧用バージョン・完全版)
function generateHistoryCardHTML(order) {
    const dateStr = new Date(order.orderDate).toLocaleString("ja-JP");
    const totalAmount = order.totalAmount || 0;
    
    // ステータスバッジ（商品一覧系のニュートラル／控えめなアクセント）
    let statusText = order.status || "受付済";
    let statusBg = "#f3f4f6";
    let statusFg = "#374151";
    let statusBd = "#e5e7eb";
    if (statusText === "発送済") {
        statusBg = "transparent";
        statusFg = "#111827";
        statusBd = "#d1d5db";
    } else if (statusText === "一部発送" || statusText === "未発送") {
        statusBg = "#D6E7F1";
        statusFg = "#111827";
        statusBd = "#b8d4e8";
    }

    const info = order.deliveryInfo || {};

    // 1. 名義サマリ
    let headerInfoParts = [];
    const deliveryName = info.name || "（宛名なし）";
    headerInfoParts.push(`<span style="font-weight:700; color:#111827;">${deliveryName} 様</span>`);
    if (info.shipper && info.shipper.name) headerInfoParts.push(`<span style="color:#6b7280; font-size:0.9em;">(荷主: ${info.shipper.name})</span>`);
    const headerInfoHTML = headerInfoParts.join(" ");
    const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const estimateSummaryHtml = info.estimateMessage
        ? `<div style="margin-top:6px; font-size:0.9rem; color:#374151; background:#f9fafb; padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; border-left:3px solid #D6E7F1;">納期目安: ${esc(info.estimateMessage)}</div>`
        : "";

    // 概要部分
    const summaryHTML = `
        <div class="order-header">
            <div style="flex-grow: 1;">
                <div style="margin-bottom: 4px;">
                    <strong style="font-size: 1.1rem; color:#111827;">${dateStr}</strong>
                    <span style="background-color: ${statusBg}; color: ${statusFg}; border: 1px solid ${statusBd}; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; margin-left: 8px; vertical-align: text-bottom; font-weight:600;">
                        ${statusText}
                    </span>
                    <span style="font-size: 0.85rem; color: #6b7280; margin-left: 10px;">ID: ${order.orderId}</span>
                </div>
                
                <div style="font-size: 0.95rem; margin-bottom: 6px; line-height: 1.4;">
                    ${headerInfoHTML}
                </div>
                ${estimateSummaryHtml}
            </div>

            <div style="text-align: right; min-width: 90px; padding-left: 10px;">
                <div style="font-size: 1.2rem; font-weight: bold; color: #111827; margin-bottom: 5px;">¥${totalAmount.toLocaleString()}</div>
                <button type="button" class="btn-toggle-detail">詳細を見る ▼</button>
            </div>
        </div>
    `;

    // 配送情報詳細
    const safeAddress = info.address || info.adress || "登録住所通り";
    let dateDisplay = info.date || "指定なし";
    if(info.dateUnknown) {
        dateDisplay += ` <span style="color:#dc3545; font-weight:bold; font-size:0.9em;">(※確約不可/出荷日のみ連絡)</span>`;
    }

    let shipperHtml = "";
    if (info.shipper && info.shipper.name) {
        shipperHtml = `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e7eb; font-size: 0.9rem;">
                <span style="font-weight:700; color: #374151;">荷主(依頼主):</span> ${info.shipper.name}<br>
                <div style="margin-left: 4px; font-size: 0.85rem; color: #6b7280;">
                    ${info.shipper.address || ""} <span style="margin-left:6px;">(TEL: ${info.shipper.tel || "--"})</span>
                </div>
            </div>
        `;
    }

    const estimateHtml = info.estimateMessage
        ? `<div style="margin-top: 12px; padding: 12px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 3px solid #D6E7F1; border-radius: 8px; font-size: 0.95rem; color: #374151;">
            <span style="font-weight:700;">納期目安:</span> ${esc(info.estimateMessage)}
        </div>`
        : "";

    let deliveryHTML = `
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e5e7eb;">
            <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: #374151; font-weight: 700;">お届け先</h4>
            <div style="font-size: 0.95rem; line-height: 1.6; color: #374151;">
                <span style="font-weight:700;">納品日:</span> ${dateDisplay}<br>
                <span style="font-weight:700;">納品先:</span> ${info.name || "（名称なし）"} 様<br>
                <span style="font-weight:700;">住所:</span> ${safeAddress}
                ${shipperHtml}
                ${estimateHtml}
            </div>
        </div>
    `;

    // 追跡情報
    let trackingHtml = "";
    if (order.shipments && order.shipments.length > 0) {
        let historyItems = "";
        order.shipments.forEach((ship, idx) => {
            const shipDate = new Date(ship.shippedDate).toLocaleDateString("ja-JP");
            const shipItemsStr = ship.items.map(i => `・${i.name} (x${i.quantity})`).join("<br>");
            let shipDeliveryDate = ship.deliveryDate || "指定なし";
            if(ship.deliveryDateUnknown) shipDeliveryDate += " (※日時確約不可)";

            historyItems += `
                <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-weight:700; color:#111827; margin-bottom:6px;">
                        第${idx + 1}回出荷 (${shipDate})
                    </div>
                    <div style="font-size:0.9rem; margin-left:2px; color:#374151;">
                        配送業者: <strong>${ship.deliveryCompany || "指定なし"}</strong> / 伝票No: <strong>${ship.trackingNumber || "反映待ち"}</strong><br>
                        納品予定: ${shipDeliveryDate}<br>
                        <div style="margin-top:8px; padding:8px 10px; background:#fff; border-radius:6px; border:1px solid #e5e7eb; font-size:0.85rem; color:#374151;">
                            ${shipItemsStr}
                        </div>
                    </div>
                </div>
            `;
        });
        trackingHtml = `
            <div style="background-color: #f9fafb; color: #374151; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; border-left: 3px solid #9ca3af; margin-bottom: 15px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:#111827; font-weight:700;">出荷・配送状況</h4>
                ${historyItems}
            </div>
        `;
    } else if (statusText === "発送済") {
        const company = order.deliveryCompany || "指定なし";
        const number = order.trackingNumber || "反映待ち";
        trackingHtml = `
            <div style="background-color: #f9fafb; color: #374151; padding: 14px; border-radius: 8px; border: 1px solid #e5e7eb; border-left: 3px solid #22c55e; margin-bottom: 15px;">
                <strong style="color:#111827;">発送完了</strong><br>
                配送業者: ${company} / 伝票番号: <strong style="font-size:1.05rem;">${number}</strong>
            </div>
        `;
    }

    // 商品テーブル
    let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 15px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <thead style="background-color: #f9fafb;">
                <tr>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">商品名</th>
                    <th style="padding: 10px; text-align: right; width: 60px; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">単価</th>
                    <th style="padding: 10px; text-align: center; width: 80px; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">出荷状況</th>
                    <th style="padding: 10px; text-align: right; width: 60px; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">小計</th>
                </tr>
            </thead>
            <tbody>
    `;

    order.items.forEach((item, rowIdx) => {
        const price = item.price || 0;
        const subtotal = price * item.quantity;
        
        let shippedCount = 0;
        if(order.shipments) {
            order.shipments.forEach(s => {
                const found = s.items.find(si => si.code === item.code);
                if(found) shippedCount += found.quantity;
            });
        }
        const remaining = item.quantity - shippedCount;
        
        let statusBadge = "";
        if (remaining === 0 && shippedCount > 0) {
            statusBadge = `<div style="font-size:0.8rem; color:#047857; font-weight:600;">完了(${item.quantity})</div>`;
        } else if (remaining > 0 && shippedCount > 0) {
            statusBadge = `
                <div style="font-size:0.8rem; color:#6b7280;">済: ${shippedCount}</div>
                <div style="font-weight:600; color:#9a3412; font-size:0.8rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:3px 6px; margin-top:4px;">
                    残: ${remaining}
                </div>`;
        } else if (shippedCount === 0) {
            statusBadge = `<div style="font-size:0.8rem; color:#6b7280;">注文数: ${item.quantity}</div>`;
        }

        tableHTML += `
            <tr style="border-bottom: 1px solid #e5e7eb; background: ${rowIdx % 2 === 1 ? "#fafafa" : "#fff"};">
                <td style="padding: 10px;">
                    <div style="font-weight: 700; color:#111827;">${item.name || "名称不明"}</div>
                    <div style="font-size: 0.8rem; color: #6b7280;">${item.code}</div>
                </td>
                <td style="padding: 10px; text-align: right;">¥${price.toLocaleString()}</td>
                <td style="padding: 10px; text-align: center; vertical-align: middle;">
                    ${statusBadge}
                </td>
                <td style="padding: 10px; text-align: right;">¥${subtotal.toLocaleString()}</td>
            </tr>
        `;
    });
    tableHTML += `</tbody></table>`;

    const actionHtml = `
        <div style="margin-top: 15px; text-align: right; padding-top: 12px; border-top: 1px dashed #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <button type="button" class="btn-reorder" data-order-id="${order.orderId}">
                この内容で再注文
            </button>
            <a class="history-support-link" href="support.html?orderId=${order.orderId}">この注文について問い合わせる</a>
        </div>
    `;

    return {
        summary: summaryHTML,
        detailContent: deliveryHTML + trackingHtml + tableHTML + actionHtml
    };
}