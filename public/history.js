let allOrders = []; // 検索用に全データをここに保持しておく

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
            alert("セッションが切れました。ログインし直してください。");
            window.location.href = "/";
            return;
        }

        const data = await response.json();

        if (!data.success) {
            const esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
            container.innerHTML = "<p class=\"error\">エラー: " + (typeof escapeHtml !== "undefined" ? escapeHtml(data.message) : esc(data.message)) + "</p>";
            return;
        } 

        // データを保存して、画面に表示
        allOrders = data.history;
        renderHistoryList(allOrders, container);

        } catch (error) {
        console.error("履歴取得エラー", error);
        container.innerHTML = "<p>通信エラーが発生しました。</p>";
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

    // 注文ID、商品名、備考、荷主名などで検索
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
        const noteMatch = info.note && info.note.normalize('NFKC').toLowerCase().includes(normalizedKey);
        
        const shipperName = (info.shipper && info.shipper.name) ? info.shipper.name.normalize('NFKC').toLowerCase() : "";
        const shipperMatch = shipperName.includes(normalizedKey);

        const clientOrderNum = info.clientOrderNumber ? String(info.clientOrderNumber).normalize('NFKC').toLowerCase() : "";
        const clientOrderMatch = clientOrderNum.includes(normalizedKey);

        const deliveryName = info.name ? info.name.normalize('NFKC').toLowerCase() : "";
        const deliveryNameMatch = deliveryName.includes(normalizedKey);

        return idMatch || itemMatch || noteMatch || shipperMatch || clientOrderMatch || deliveryNameMatch;
    });

    renderHistoryList(filtered, container);
}

// データをHTMLに変換して表示する
function renderHistoryList(orders, container) {
    container.innerHTML = ""; 

    if (orders.length === 0) {
        container.innerHTML = "<p style='text-align:center;'>表示できる履歴がありません</p>";
        return;
    }

    orders.forEach(order => {
        // HTML生成職人を呼び出す
        const htmlData = generateHistoryCardHTML(order);

        // カードの外枠
        const card = document.createElement("div");
        card.className = "history-card";
        
        // 概要(ヘッダー)
        card.innerHTML = htmlData.summary;

        // 詳細エリア(初期は非表示)
        const detailDiv = document.createElement("div");
        detailDiv.style.display = "none";
        detailDiv.style.marginTop = "15px";
        detailDiv.style.borderTop = "1px dashed #ddd";
        detailDiv.style.paddingTop = "15px";
        
        detailDiv.innerHTML = htmlData.detailContent;

        // 合体
        card.appendChild(detailDiv);

        // 開閉ボタンの動作
        const toggleBtn = card.querySelector(".btn-toggle-detail");
        toggleBtn.addEventListener("click", function () {
            if (detailDiv.style.display === "none") {
                detailDiv.style.display = "block";
                toggleBtn.textContent = "閉じる ▲";
                toggleBtn.style.backgroundColor = "#6c757d";
                toggleBtn.style.borderColor = "#5c636a";
                toggleBtn.style.color = "#fff";
            } else {
                detailDiv.style.display = "none";
                toggleBtn.textContent = "詳細を見る ▼";
                toggleBtn.style.backgroundColor = "#dfe3e6";
                toggleBtn.style.borderColor = "#c5cdd5";
                toggleBtn.style.color = "#111827";
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
}

// ★HTML生成職人 (顧客閲覧用バージョン・完全版)
function generateHistoryCardHTML(order) {
    const dateStr = new Date(order.orderDate).toLocaleString("ja-JP");
    const totalAmount = order.totalAmount || 0;
    
    // ステータスの色分け
    let statusColor = "#6c757d"; // デフォルト:グレー
    let statusText = order.status || "受付済";

    if (statusText === "発送済") {
        statusColor = "#28a745"; // 緑
    } else if (statusText === "一部発送" || statusText === "未発送") {
        statusColor = "#d6e7f1"; // 受注管理の未発送・一部発送ラベルと同系色
    }

    const info = order.deliveryInfo || {};

    // 1. 商品サマリ
    let itemSummary = "商品なし";
    if (order.items && order.items.length > 0) {
        const firstItem = order.items[0];
        const firstName = firstItem.name || firstItem.code;
        const extraCount = order.items.length - 1;
        itemSummary = extraCount > 0 ? `${firstName} <span style="color:#666; font-size:0.9em;">(+他${extraCount}点)</span>` : firstName;
    }

    // 2. 名義サマリ
    let headerInfoParts = [];
    if (info.clientOrderNumber) headerInfoParts.push(`<span style="color: #007bff; font-weight:bold;">[No:${info.clientOrderNumber}]</span>`);
    const deliveryName = info.name || "（宛名なし）";
    headerInfoParts.push(`<span style="font-weight:bold; color:#333;">➡ ${deliveryName} 様</span>`);
    if (info.shipper && info.shipper.name) headerInfoParts.push(`<span style="color: #28a745; font-size:0.9em;">(荷主: ${info.shipper.name})</span>`);
    const headerInfoHTML = headerInfoParts.join(" ");
    const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const estimateSummaryHtml = info.estimateMessage
        ? `<div style="margin-top:4px; font-size:0.9rem; color:#856404; background:#fff3cd; padding:6px 10px; border-radius:4px; border-left:3px solid #ffc107;">📅 納期目安: ${esc(info.estimateMessage)}</div>`
        : "";

    // 概要部分
    const summaryHTML = `
        <div class="order-header">
            <div style="flex-grow: 1;">
                <div style="margin-bottom: 4px;">
                    <strong style="font-size: 1.1rem;">${dateStr}</strong>
                    <span style="background-color: ${statusColor}; color: ${statusText === "未発送" || statusText === "一部発送" ? "#111827" : "white"}; border: 1px solid ${statusText === "未発送" || statusText === "一部発送" ? "#b0cde5" : "transparent"}; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin-left: 8px; vertical-align: text-bottom;">
                        ${statusText}
                    </span>
                    <span style="font-size: 0.85rem; color: #666; margin-left: 10px;">ID: ${order.orderId}</span>
                </div>
                
                <div style="font-size: 0.95rem; margin-bottom: 6px; line-height: 1.4;">
                    ${headerInfoHTML}
                </div>
                ${estimateSummaryHtml}
                <div style="font-size: 0.9rem; color: #555; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 95%;">
                    ${itemSummary}
                </div>
            </div>

            <div style="text-align: right; min-width: 90px; padding-left: 10px;">
                <div style="font-size: 1.2rem; font-weight: bold; color: #333; margin-bottom: 5px;">¥${totalAmount.toLocaleString()}</div>
                <button class="btn-toggle-detail" style="cursor: pointer; padding: 5px 10px; background-color: #dfe3e6; color: #111827; border: 1px solid #c5cdd5; border-radius: 4px; font-size: 0.85rem;">
                    詳細 ▼
                </button>
            </div>
        </div>
    `;

    // 配送情報詳細
    const safeAddress = info.address || info.adress || "登録住所通り";
    let dateDisplay = info.date || "指定なし";
    if(info.dateUnknown) {
        dateDisplay += ` <span style="color:#dc3545; font-weight:bold; font-size:0.9em;">(※確約不可/出荷日のみ連絡)</span>`;
    }

    const clientOrderHtml = info.clientOrderNumber 
        ? `<div style="color: #007bff; font-weight: bold; margin-bottom: 5px;">[貴社発注No: ${info.clientOrderNumber}]</div>` : "";

    let shipperHtml = "";
    if (info.shipper && info.shipper.name) {
        shipperHtml = `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 0.9rem;">
                <span style="font-weight:bold; color: #555;">📦 荷主(依頼主):</span> ${info.shipper.name}<br>
                <div style="margin-left: 10px; font-size: 0.85rem; color: #666;">
                    ${info.shipper.address || ""} <span style="margin-left:5px;">(TEL: ${info.shipper.tel || "--"})</span>
                </div>
            </div>
        `;
    }

    const estimateHtml = info.estimateMessage
        ? `<div style="margin-top: 10px; padding: 10px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 0.95rem;">
            <span style="font-weight:bold;">📅 納期目安:</span> ${esc(info.estimateMessage)}
        </div>`
        : "";

    let deliveryHTML = `
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
            <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: #555;">📍 お届け先・備考</h4>
            <div style="font-size: 0.95rem; line-height: 1.6;">
                ${clientOrderHtml}
                <span style="font-weight:bold;">納品日:</span> ${dateDisplay}<br>
                <span style="font-weight:bold;">納品先:</span> ${info.name || "（名称なし）"} 様<br>
                <span style="font-weight:bold;">住所:</span> ${safeAddress}<br>
                <span style="font-weight:bold;">備考:</span> ${info.note || "なし"}
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
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #c3e6cb;">
                    <div style="font-weight:bold; color:#155724; margin-bottom:5px;">
                        🚚 第${idx + 1}回出荷 (${shipDate})
                    </div>
                    <div style="font-size:0.9rem; margin-left:10px;">
                        配送業者: <b>${ship.deliveryCompany || "指定なし"}</b> / 伝票No: <b>${ship.trackingNumber || "反映待ち"}</b><br>
                        納品予定: ${shipDeliveryDate}<br>
                        <div style="margin-top:5px; padding:5px; background:rgba(255,255,255,0.6); border-radius:4px; font-size:0.85rem; color:#333;">
                            ${shipItemsStr}
                        </div>
                    </div>
                </div>
            `;
        });
        trackingHtml = `
            <div style="background-color: #d4edda; color: #155724; padding: 15px; border-radius: 5px; border-left: 5px solid #28a745; margin-bottom: 15px;">
                <h4 style="margin:0 0 10px 0; font-size:1rem;">📤 出荷・配送状況</h4>
                ${historyItems}
            </div>
        `;
    } else if (statusText === "発送済") {
        const company = order.deliveryCompany || "指定なし";
        const number = order.trackingNumber || "反映待ち";
        trackingHtml = `
            <div style="background-color: #d4edda; color: #155724; padding: 10px; border-radius: 5px; border-left: 5px solid #28a745; margin-bottom: 15px;">
                <strong>🚚 発送完了</strong><br>
                配送業者: ${company} / 伝票番号: <strong style="font-size:1.1rem;">${number}</strong>
            </div>
        `;
    }

    // 商品テーブル
    let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 15px;">
            <thead style="background-color: #e9ecef;">
                <tr>
                    <th style="padding: 8px; text-align: left;">商品名</th>
                    <th style="padding: 8px; text-align: right; width: 60px;">単価</th>
                    <th style="padding: 8px; text-align: center; width: 80px;">出荷状況</th>
                    <th style="padding: 8px; text-align: right; width: 60px;">小計</th>
                </tr>
            </thead>
            <tbody>
    `;

    order.items.forEach(item => {
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
            statusBadge = `<div style="font-size:0.8rem; color:#28a745;">✅ 完了(${item.quantity})</div>`;
        } else if (remaining > 0 && shippedCount > 0) {
            statusBadge = `
                <div style="font-size:0.8rem;">済: ${shippedCount}</div>
                <div style="font-weight:bold; color:#d63384; font-size:0.9rem; background:#fff0f6; border:1px solid #fcc2d7; border-radius:3px; padding:2px;">
                    残: ${remaining}
                </div>`;
        } else if (shippedCount === 0) {
            statusBadge = `<div style="font-size:0.8rem; color:#666;">注文数: ${item.quantity}</div>`;
        }

        tableHTML += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">
                    <div style="font-weight: bold;">${item.name || "名称不明"}</div>
                    <div style="font-size: 0.8rem; color: #888;">${item.code}</div>
                </td>
                <td style="padding: 8px; text-align: right;">¥${price.toLocaleString()}</td>
                <td style="padding: 8px; text-align: center; vertical-align: middle;">
                    ${statusBadge}
                </td>
                <td style="padding: 8px; text-align: right;">¥${subtotal.toLocaleString()}</td>
            </tr>
        `;
    });
    tableHTML += `</tbody></table>`;

    const actionHtml = `
        <div style="margin-top: 15px; text-align: right; padding-top: 10px; border-top: 1px dashed #ddd; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <button class="btn-reorder" data-order-id="${order.orderId}" 
                style="background: linear-gradient(135deg, #28a745, #20c997); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.95rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.1s;">
                🔄 この内容で再注文
            </button>
            <a href="support.html?orderId=${order.orderId}" style="text-decoration: none; color: #007bff; font-weight: bold; font-size: 0.95rem;">
                💁‍♂️ この注文について問い合わせる
            </a>
        </div>
    `;

    return {
        summary: summaryHTML,
        detailContent: deliveryHTML + trackingHtml + tableHTML + actionHtml
    };
}