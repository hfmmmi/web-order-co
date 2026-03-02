document.addEventListener("DOMContentLoaded", function () {
    console.log("Support page loaded.");

    // 1. URLパラメータから注文IDを取得する (?orderId=12345...)
    const params = new URLSearchParams(window.location.search);
    const targetOrderId = params.get("orderId");

    // 2. HTML側の入力欄を捕まえる
    const orderInput = document.getElementById("order-id");
    const form = document.getElementById("support-form");
    const msgDiv = document.getElementById("status-message");
    const myTicketsContainer = document.getElementById("my-support-tickets");
    const refreshMyTicketsBtn = document.getElementById("refresh-my-tickets");
    const tabButtons = document.querySelectorAll(".support-tab-btn");
    const tabPanels = document.querySelectorAll(".support-tab-panel");
    let myTicketsLoaded = false;

    function activateTab(tabId) {
        tabButtons.forEach((btn) => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle("active", isActive);
        });
        tabPanels.forEach((panel) => {
            panel.classList.toggle("active", panel.id === tabId);
        });
    }

    function statusLabel(status) {
        if (status === "resolved") return "✅ 対応完了";
        if (status === "verifying") return "🟡 検証中";
        return "🔴 未対応";
    }

    function safeText(value) {
        return escapeHtml(String(value == null ? "" : value));
    }

    function formatDate(value) {
        if (!value) return "-";
        const d = new Date(value);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleString("ja-JP");
    }

    function renderMyTickets(tickets) {
        if (!myTicketsContainer) return;
        myTicketsContainer.innerHTML = "";

        if (!Array.isArray(tickets) || tickets.length === 0) {
            myTicketsContainer.innerHTML = "<p style=\"color:#666;\">まだ問い合わせ履歴はありません。</p>";
            return;
        }

        tickets.forEach((ticket) => {
            const card = document.createElement("div");
            const statusClass = ticket.status ? `status-${ticket.status}` : "status-open";
            card.className = `support-ticket-card ${statusClass}`;

            let historyHtml = "<div style=\"padding:8px; color:#777; font-size:0.88rem;\">対応履歴はまだありません。</div>";
            if (Array.isArray(ticket.history) && ticket.history.length > 0) {
                historyHtml = ticket.history
                    .map((h) => {
                        const byText = h.by ? `（${safeText(h.by)}）` : "";
                        return `<div class="history-row">
                            <div style="color:#666; font-size:0.8rem;">${safeText(formatDate(h.date))}</div>
                            <div>${safeText(h.action)} ${byText}</div>
                        </div>`;
                    })
                    .join("");
            }

            card.innerHTML = `
                <div class="support-ticket-meta">
                    <span><strong>${safeText(ticket.ticketId || "-")}</strong></span>
                    <span>${safeText(statusLabel(ticket.status))}</span>
                    <span>受付: ${safeText(formatDate(ticket.timestamp))}</span>
                </div>
                <div style="font-size:0.9rem; margin-bottom:6px;">
                    種別: <strong>${safeText(ticket.type || "未設定")}</strong> / 区分: ${safeText(ticket.category === "bug" ? "システム不具合" : "通常問い合わせ")}
                </div>
                <div style="font-size:0.88rem; color:#555; margin-bottom:6px;">
                    注文ID: ${safeText(ticket.orderId || "-")} / 貴社発注NO: ${safeText(ticket.customerPoNumber || "-")}
                </div>
                <div class="support-ticket-detail">${safeText(ticket.detail || "")}</div>
                <div style="margin-top:8px; font-size:0.88rem; color:#555;">
                    希望対応: ${safeText(ticket.desiredAction || "-")} / 回収指定日: ${safeText(ticket.collectionDate || "-")}
                </div>
                <div style="margin-top:8px; font-size:0.9rem; font-weight:bold;">対応履歴</div>
                <div class="history-list">${historyHtml}</div>
            `;
            myTicketsContainer.appendChild(card);
        });
    }

    async function loadMyTickets() {
        if (!myTicketsContainer) return;
        myTicketsContainer.innerHTML = "<p style=\"color:#666;\">問い合わせ履歴を読み込み中...</p>";
        try {
            const response = await fetch("/support/my-tickets");
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "履歴の取得に失敗しました");
            }
            renderMyTickets(result.tickets || []);
            myTicketsLoaded = true;
        } catch (error) {
            console.error(error);
            myTicketsContainer.innerHTML = `<p style="color:#c00;">履歴の取得に失敗しました: ${safeText(error.message)}</p>`;
        }
    }

    // 3. 注文IDがあれば自動入力する
    if (targetOrderId && orderInput) {
        orderInput.value = targetOrderId;
    }

    // 3.5 タブ切り替え
    tabButtons.forEach((btn) => {
        btn.addEventListener("click", async function () {
            const nextTab = btn.dataset.tab;
            activateTab(nextTab);
            if (nextTab === "support-history-panel" && !myTicketsLoaded) {
                await loadMyTickets();
            }
        });
    });

    // 4. 送信ボタンが押された時の処理
    if (form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault(); // 画面リロードを阻止

            // 入力値を取得
            const categoryEl = document.querySelector('input[name="category"]:checked');
            const categoryVal = categoryEl ? categoryEl.value : "support"; // デフォルトはsupport
            const typeVal = document.getElementById("support-type").value;
            const detailVal = document.getElementById("support-detail").value;
            const orderIdVal = orderInput ? orderInput.value : "";

            // 送信ボタンを無効化（連打防止）
            const btn = form.querySelector(".btn-submit");
            if (btn) {
                btn.disabled = true;
                btn.textContent = "送信中...";
            }

            // サーバーに送るデータ
            const requestData = {
                category: categoryVal,
                orderId: orderIdVal,
                type: typeVal,
                detail: detailVal,
                timestamp: new Date().toISOString()
            };

            try {
                // APIへPOST送信
                const response = await fetch("/request-support", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestData)
                });
                const result = await response.json();

                if (result.success) {
                    msgDiv.style.color = "green";
                    msgDiv.textContent = "✅ 申請を受け付けました。管理者が確認次第ご連絡します。";
                    form.reset();

                    const defaultRadio = document.querySelector('input[name="category"][value="support"]');
                    if (defaultRadio) defaultRadio.checked = true;

                    await loadMyTickets();
                    activateTab("support-history-panel");
                } else {
                    throw new Error(result.message || "送信失敗");
                }
            } catch (error) {
                console.error(error);
                msgDiv.style.color = "red";
                msgDiv.textContent = "❌ エラーが発生しました: " + error.message;
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "申請を送信する";
                }
            }
        });
    }

    if (refreshMyTicketsBtn) {
        refreshMyTicketsBtn.addEventListener("click", loadMyTickets);
    }

    activateTab("support-form-panel");
});