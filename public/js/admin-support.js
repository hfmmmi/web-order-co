document.addEventListener("DOMContentLoaded", function () {
    console.log("☎️ CRM Manager Loaded");

    const supportListContainer = document.querySelector("#support-ticket-list");
    const refreshSupportBtn = document.querySelector("#refresh-support-btn");
    const kaitoriContainer = document.querySelector("#kaitori-list-container");
    // ★重要: 全チケットデータを保持するメモリキャッシュ
    let allSupportTickets = [];
    let currentFilter = 'open'; // デフォルトは「未対応」のみ表示

    // =========================================================
    // イベント駆動: 号砲(admin-ready)を待つ
    // =========================================================
    document.addEventListener("admin-ready", function() {
        console.log("🚀 CRM Manager: Auth Signal Received.");
        fetchSupportTickets();
        if(kaitoriContainer) fetchKaitoriList();
    });

    // ---------------------------------------------------------
    // サポート・不具合管理 (CRM機能)
    // ---------------------------------------------------------
    async function fetchSupportTickets() {
        if (!supportListContainer) return;
        supportListContainer.innerHTML = "<p>データを問い合わせ中...</p>";
        try {
            // ★修正: /api を削除 (/admin/support-tickets)
            const response = await fetch("/admin/support-tickets");
            
            if (response.status === 401) {
                supportListContainer.innerHTML = "<p>認証待ち...</p>";
                return;
            }

            if (!response.ok) throw new Error("取得に失敗しました");
            
            // ★データを保存し、フィルタリングを実行
            allSupportTickets = await response.json();
            applyFilterAndRender();

        } catch (error) {
            supportListContainer.innerHTML = "<p style=\"color:red;\">読み込みエラー: " + (typeof escapeHtml !== "undefined" ? escapeHtml(error.message) : String(error.message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")) + "</p>";
        }
    }

    // ★フィルタリングと描画の分離
    function applyFilterAndRender() {
        let filtered = [];
        
        if (currentFilter === 'all') {
            filtered = allSupportTickets;
        } else {
            filtered = allSupportTickets.filter(t => t.status === currentFilter);
        }

        renderSupportTickets(filtered);
    }

    // ★グローバル関数: HTML側のタブボタンから呼ばれる
    window.filterSupport = function(status, btnElement) {
        currentFilter = status;

        // タブのアクティブ表示切り替え
        document.querySelectorAll('.support-tab').forEach(btn => btn.classList.remove('active'));
        if(btnElement) btnElement.classList.add('active');

        // 再描画 (通信なしで高速)
        applyFilterAndRender();
    };

    function renderSupportTickets(tickets) {
        supportListContainer.innerHTML = "";
        
        if (tickets.length === 0) {
            // ステータスに応じたメッセージ
            let msg = "データはありません";
            if(currentFilter === 'open') msg = "現在、未対応の申請はありません ✅";
            else if(currentFilter === 'verifying') msg = "検証中の案件はありません";
            else if(currentFilter === 'resolved') msg = "完了済みの案件はありません";
            
            supportListContainer.innerHTML = "<p style=\"color:#666; padding:10px;\">" + (typeof escapeHtml !== "undefined" ? escapeHtml(msg) : String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")) + "</p>";
            return;
        }

        tickets.forEach(ticket => {
            const isBug = ticket.category === "bug";
            const ticketId = ticket.ticketId;
            
            // 色分け設定
            let borderColor = "#ccc";
            let bgColor = "#fff";
            let icon = "✉️";

            if (isBug) {
                borderColor = "#dc3545";
                bgColor = "#fff5f5";
                icon = "🐛";
            }
            // 完了済みは少し薄くする
            if (ticket.status === "resolved") {
                borderColor = "#adb5bd";
                bgColor = "#f8f9fa"; 
            } else if (ticket.status === "verifying") {
                borderColor = "#ffc107"; 
                bgColor = "#fff3cd";
            }

            // 日付整形
            const dateStr = new Date(ticket.timestamp).toLocaleString("ja-JP");
            
            // 履歴HTML
            let historyHtml = "";
            if (ticket.history && ticket.history.length > 0) {
                historyHtml = `<div style="background:#f8f9fa; padding:5px; margin-top:5px; border:1px solid #ddd; max-height:100px; overflow-y:auto; font-size:0.85rem;">`;
                ticket.history.forEach(h => {
                    const hDate = new Date(h.date).toLocaleString("ja-JP", { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    historyHtml += `<div style="border-bottom:1px solid #eee; margin-bottom:3px;">
                        <span style="color:#666; font-size:0.8em;">${hDate}</span> ${h.action}
                    </div>`;
                });
                historyHtml += `</div>`;
            } else {
                historyHtml = `<div style="color:#999; font-size:0.85rem; padding:5px;">履歴なし</div>`;
            }

            // カード生成
            const card = document.createElement("div");
            card.style.border = `2px solid ${borderColor}`;
            card.style.backgroundColor = bgColor;
            card.style.padding = "15px";
            card.style.marginBottom = "15px";
            card.style.borderRadius = "8px";

            const statusOptions = `
                <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>🔴 未対応</option>
                <option value="verifying" ${ticket.status === 'verifying' ? 'selected' : ''}>🟡 検証中</option>
                <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>✅ 対応完了</option>
            `;

            // ★UI変更: 2列グリッドで「WEB(左) vs 社内(右)」を対比
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid ${borderColor}; padding-bottom:5px;">
                    <span style="font-weight:bold; font-size:1.1rem;">${icon} ${ticketId}</span>
                    <span style="font-size:0.85rem; color:#555;">${dateStr}</span>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label style="font-size:0.7rem; font-weight:bold; color:#666;">WEB注文ID (自動)</label>
                            <input type="text" value="${ticket.orderId || ''}" readonly 
                                style="width:100%; box-sizing:border-box; background:#e9ecef; border:1px solid #ced4da; color:#555; font-size:0.9rem;">
                        </div>
                        <div>
                            <label style="font-size:0.7rem; font-weight:bold; color:#666;">WEB発注NO. (顧客入力)</label>
                            <input type="text" value="${ticket.customerPoNumber || ''}" readonly
                                style="width:100%; box-sizing:border-box; background:#e9ecef; border:1px solid #ced4da; color:#555; font-size:0.9rem;">
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label style="font-size:0.7rem; font-weight:bold; color:#0d6efd;">社内受注NO. (基幹)</label>
                            <input type="text" id="internalOrderNo-${ticketId}" value="${ticket.internalOrderNo || ''}" placeholder="未入力"
                                style="width:100%; box-sizing:border-box; border:2px solid #9ec5fe; background:#fff; font-weight:bold;">
                        </div>
                        <div>
                            <label style="font-size:0.7rem; font-weight:bold; color:#0d6efd;">社内発注NO. (基幹)</label>
                            <input type="text" id="internalCustomerPo-${ticketId}" value="${ticket.internalCustomerPoNumber || ''}" placeholder="未入力"
                                style="width:100%; box-sizing:border-box; border:2px solid #9ec5fe; background:#fff; font-weight:bold;">
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <label style="font-size:0.8rem; font-weight:bold;">顧客: ${ticket.customerName} (${ticket.customerId}) の申告</label>
                    <div style="background: #fff; padding: 8px; border:1px solid #ccc; border-radius: 4px; font-size: 0.95rem; white-space: pre-wrap;">${ticket.detail}</div>
                </div>

                ${(() => {
                    const list = ticket.attachments;
                    if (!list || !list.length) return "";
                    const tid = encodeURIComponent(ticket.ticketId || "");
                    const items = list.map((a) => {
                        const sn = encodeURIComponent(a.storedName || "");
                        const lab = typeof escapeHtml !== "undefined"
                            ? escapeHtml(a.originalName || a.storedName || "file")
                            : String(a.originalName || a.storedName || "file").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
                        return `<li><a href="/support/attachment/${tid}/${sn}" target="_blank" rel="noopener">${lab}</a></li>`;
                    }).join("");
                    return `<div style="margin-bottom:10px;"><label style="font-size:0.8rem; font-weight:bold;">📎 添付ファイル</label><ul style="margin:6px 0 0 18px; font-size:0.9rem;">${items}</ul></div>`;
                })()}

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:bold;">希望対応</label>
                        <input type="text" id="desiredAction-${ticketId}" value="${ticket.desiredAction || ''}" list="action-list" style="width:100%; box-sizing:border-box;">
                        <datalist id="action-list">
                            <option value="代替品発送">
                            <option value="赤伝処理">
                            <option value="部品送付">
                        </datalist>
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:bold;">回収指定日</label>
                        <input type="date" id="collectionDate-${ticketId}" value="${ticket.collectionDate || ''}" style="width:100%; box-sizing:border-box;">
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <label style="font-size:0.8rem; font-weight:bold;">📝 対応履歴 (Log)</label>
                    ${historyHtml}
                </div>

                <div style="background:rgba(0,0,0,0.05); padding:10px; border-radius:4px; margin-top:10px;">
                    <label style="font-size:0.8rem; font-weight:bold;">ステータス更新 & メモ</label>
                    <div style="display:flex; gap:10px; margin-bottom:5px;">
                        <select id="status-${ticketId}" style="padding:5px;">
                            ${statusOptions}
                        </select>
                        <input type="text" id="historyLog-${ticketId}" placeholder="例: 電話で謝罪、代替品手配済み..." style="flex:1; padding:5px;">
                    </div>
                    <button onclick="updateTicket('${ticketId}')" style="width:100%; background:#0d6efd; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;">
                        💾 更新・履歴追加
                    </button>
                </div>
            `;
            supportListContainer.appendChild(card);
        });
    }

    // グローバル関数: 更新処理
    window.updateTicket = async function(ticketId) {
        const status = document.getElementById(`status-${ticketId}`).value;
        const log = document.getElementById(`historyLog-${ticketId}`).value;
        const internalNo = document.getElementById(`internalOrderNo-${ticketId}`).value;
        const internalPo = document.getElementById(`internalCustomerPo-${ticketId}`).value; // ★追加
        const action = document.getElementById(`desiredAction-${ticketId}`).value;
        const colDate = document.getElementById(`collectionDate-${ticketId}`).value;

        if (!confirm("内容を更新しますか？")) return;

        const data = {
            ticketId: ticketId,
            status: status,
            internalOrderNo: internalNo,
            internalCustomerPoNumber: internalPo, // ★追加
            desiredAction: action,
            collectionDate: colDate,
            newHistoryLog: log 
        };

        try {
            // ★修正: /api を削除 (/admin/update-ticket)
            const response = await fetch("/admin/update-ticket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            if (result.success) {
                toastSuccess("更新しました");
                fetchSupportTickets();
            } else {
                toastError("エラー: " + result.message);
            }
        } catch (e) {
            console.error(e);
            toastError("通信エラー");
        }
    };

    if (refreshSupportBtn) refreshSupportBtn.addEventListener("click", fetchSupportTickets);

    // ---------------------------------------------------------
    // 買取依頼リスト (変更なし)
    // ---------------------------------------------------------
    async function fetchKaitoriList() {
        if (!kaitoriContainer) return;
        kaitoriContainer.innerHTML = "<p>問い合わせ中...</p>";
        try {
            // ★修正: /api を削除 (/admin/kaitori-list)
            const res = await fetch("/admin/kaitori-list");
            if (res.status === 401) return;

            const list = await res.json();
            if (list.length === 0) {
                kaitoriContainer.innerHTML = "<p>現在、未処理の査定依頼はありません。</p>";
                return;
            }
            kaitoriContainer.innerHTML = "";
            list.forEach(req => {
                 const div = document.createElement("div");
                div.style.background = "white";
                div.style.padding = "10px";
                div.style.marginBottom = "10px";
                div.style.borderRadius = "4px";
                div.style.borderLeft = "5px solid #28a745";
                const dateStr = new Date(req.requestDate).toLocaleString("ja-JP");
                let itemsHtml = "<ul style='margin:5px 0; padding-left:20px; font-size:0.9rem;'>";
                let totalEst = 0;
                req.items.forEach(item => {
                    const sub = item.price * item.quantity;
                    totalEst += sub;
                    itemsHtml += `<li>${item.name} (${item.maker}) x ${item.quantity} = ¥${sub.toLocaleString()}</li>`;
                });
                itemsHtml += "</ul>";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-weight:bold;">
                        <span>ID: ${req.requestId} (${req.customerName})</span>
                        <span style="color:#28a745;">見積合計: ¥${totalEst.toLocaleString()}</span>
                    </div>
                    <div style="font-size:0.8rem; color:#666;">${dateStr} / ステータス: ${req.status}</div>
                    ${itemsHtml}
                    <div style="font-size:0.9rem; color:#d63384;">備考: ${req.note || "なし"}</div>
                `;
                kaitoriContainer.appendChild(div);
            });
        } catch (error) { kaitoriContainer.innerHTML = "<p style='color:red'>読み込みエラー</p>"; }
    }
});