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
        if (status === "resolved") return "対応完了";
        if (status === "verifying") return "検証中";
        return "未対応";
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

    /** 問い合わせ区分（API値 → 表示文言。旧 support/bug も履歴表示用に解釈） */
    function categoryLabelJa(cat) {
        if (cat === "product") return "商品について";
        if (cat === "system") return "システムについて";
        if (cat === "other") return "その他";
        if (cat === "bug") return "システムについて";
        if (cat === "support") return "通常のお問い合わせ";
        return cat ? String(cat) : "未設定";
    }

    function renderMyTickets(tickets) {
        if (!myTicketsContainer) return;
        myTicketsContainer.innerHTML = "";

        if (!Array.isArray(tickets) || tickets.length === 0) {
            myTicketsContainer.innerHTML = "<p class=\"support-history-empty\">まだ問い合わせ履歴はありません。</p>";
            return;
        }

        tickets.forEach((ticket) => {
            const card = document.createElement("div");
            const statusClass = ticket.status ? `status-${ticket.status}` : "status-open";
            card.className = `support-ticket-card ${statusClass}`;

            let historyHtml = "<div class=\"history-row-empty\">対応履歴はまだありません。</div>";
            if (Array.isArray(ticket.history) && ticket.history.length > 0) {
                historyHtml = ticket.history
                    .map((h) => {
                        const byText = h.by ? `（${safeText(h.by)}）` : "";
                        return `<div class="history-row">
                            <div class="history-row-date">${safeText(formatDate(h.date))}</div>
                            <div>${safeText(h.action)} ${byText}</div>
                        </div>`;
                    })
                    .join("");
            }

            let attachHtml = "";
            if (Array.isArray(ticket.attachments) && ticket.attachments.length > 0) {
                const tid = encodeURIComponent(ticket.ticketId || "");
                attachHtml = `<div class="support-ticket-attach">
                    <strong>添付:</strong>
                    <ul style="margin:6px 0 0 18px; padding:0;">
                        ${ticket.attachments.map((a) => {
                            const sn = encodeURIComponent(a.storedName || "");
                            const href = `/support/attachment/${tid}/${sn}`;
                            return `<li><a href="${href}" target="_blank" rel="noopener">${safeText(a.originalName || a.storedName || "ファイル")}</a></li>`;
                        }).join("")}
                    </ul>
                </div>`;
            }

            card.innerHTML = `
                <div class="support-ticket-meta">
                    <span><strong>${safeText(ticket.ticketId || "-")}</strong></span>
                    <span>${safeText(statusLabel(ticket.status))}</span>
                    <span>受付: ${safeText(formatDate(ticket.timestamp))}</span>
                </div>
                <div class="support-ticket-line">
                    種別: <strong>${safeText(ticket.type || "未設定")}</strong> / 区分: ${safeText(categoryLabelJa(ticket.category))}
                </div>
                <div class="support-ticket-line support-ticket-line--muted">
                    注文ID: ${safeText(ticket.orderId || "-")} / 貴社発注NO: ${safeText(ticket.customerPoNumber || "-")}
                </div>
                <div class="support-ticket-detail">${safeText(ticket.detail || "")}</div>
                ${attachHtml}
                <div class="support-ticket-line support-ticket-line--muted">
                    希望対応: ${safeText(ticket.desiredAction || "-")} / 回収指定日: ${safeText(ticket.collectionDate || "-")}
                </div>
                <div class="support-ticket-section-title">対応履歴</div>
                <div class="history-list">${historyHtml}</div>
            `;
            myTicketsContainer.appendChild(card);
        });
    }

    async function loadMyTickets() {
        if (!myTicketsContainer) return;
        myTicketsContainer.innerHTML = "<p class=\"support-history-loading\">問い合わせ履歴を読み込み中...</p>";
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

    // 商品一覧「要問合」から: ?type=見積依頼&productCode=...&productName=...
    const typeParam = params.get("type");
    const productCodeParam = params.get("productCode");
    const productNameParam = params.get("productName");
    const supportTypeSelect = document.getElementById("support-type");
    if (typeParam && supportTypeSelect) {
        for (let i = 0; i < supportTypeSelect.options.length; i++) {
            if (supportTypeSelect.options[i].value === typeParam) {
                supportTypeSelect.selectedIndex = i;
                break;
            }
        }
    }
    const detailForProduct = document.getElementById("support-detail");
    if (detailForProduct && (productCodeParam || productNameParam)) {
        const lines = [];
        if (productCodeParam) lines.push("商品コード: " + productCodeParam);
        if (productNameParam) lines.push("商品名: " + productNameParam);
        lines.push("");
        lines.push("上記商品について見積をお願いします。");
        const block = lines.join("\n");
        if (!detailForProduct.value.trim()) {
            detailForProduct.value = block;
        }
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

    // 3.6 添付: ファイル選択ボタン + ドラッグ＆ドロップ
    (function initSupportAttachments() {
        const fileInput = document.getElementById("support-attachments");
        const dropzone = document.getElementById("support-dropzone");
        const browseBtn = document.getElementById("support-attachments-browse");
        const namesEl = document.getElementById("support-attachment-names");
        if (!fileInput || !dropzone || !browseBtn) return;

        const MAX_ATTACH_FILES = 5;

        function updateAttachmentNamesDisplay() {
            if (!namesEl) return;
            const files = fileInput.files ? Array.from(fileInput.files) : [];
            if (files.length === 0) {
                namesEl.textContent = "";
                namesEl.style.display = "none";
                return;
            }
            namesEl.style.display = "block";
            namesEl.textContent = "選択中（" + files.length + "件）: " + files.map(function (f) {
                return f.name;
            }).join("、");
        }

        function applyFilesToInput(fileArray) {
            const dt = new DataTransfer();
            (fileArray || []).slice(0, MAX_ATTACH_FILES).forEach(function (f) {
                dt.items.add(f);
            });
            fileInput.files = dt.files;
            updateAttachmentNamesDisplay();
        }

        function mergeDroppedFiles(fileList) {
            const existing = Array.from(fileInput.files || []);
            const incoming = Array.from(fileList || []);
            applyFilesToInput(existing.concat(incoming));
        }

        browseBtn.addEventListener("click", function () {
            fileInput.click();
        });

        fileInput.addEventListener("change", function () {
            applyFilesToInput(Array.from(fileInput.files || []));
        });

        dropzone.addEventListener("dragenter", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add("support-dropzone--over");
        });
        dropzone.addEventListener("dragleave", function (e) {
            e.preventDefault();
            e.stopPropagation();
            const rt = e.relatedTarget;
            if (rt && dropzone.contains(rt)) return;
            dropzone.classList.remove("support-dropzone--over");
        });
        dropzone.addEventListener("dragover", function (e) {
            e.preventDefault();
            e.stopPropagation();
        });
        dropzone.addEventListener("drop", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("support-dropzone--over");
            const fl = e.dataTransfer && e.dataTransfer.files;
            if (fl && fl.length) {
                mergeDroppedFiles(fl);
            }
        });
    })();

    // 4. 送信ボタンが押された時の処理
    if (form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault(); // 画面リロードを阻止

            // 入力値を取得
            const categoryVal = "product";
            const typeVal = document.getElementById("support-type").value;
            const detailVal = document.getElementById("support-detail").value;
            const orderIdVal = orderInput ? orderInput.value : "";

            // 送信ボタンを無効化（連打防止）
            const btn = form.querySelector(".btn-submit");
            if (btn) {
                btn.disabled = true;
                btn.textContent = "送信中...";
            }

            const fileInput = document.getElementById("support-attachments");
            const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
            if (files.length > 5) {
                msgDiv.style.color = "red";
                msgDiv.textContent = "添付は最大5ファイルまでです。";
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "送信する";
                }
                return;
            }

            try {
                let response;
                if (files.length > 0) {
                    const formData = new FormData();
                    formData.append("category", categoryVal);
                    formData.append("orderId", orderIdVal);
                    formData.append("type", typeVal);
                    formData.append("detail", detailVal);
                    files.forEach(function (f) {
                        formData.append("attachments", f);
                    });
                    response = await fetch("/request-support", {
                        method: "POST",
                        body: formData
                    });
                } else {
                    const requestData = {
                        category: categoryVal,
                        orderId: orderIdVal,
                        type: typeVal,
                        detail: detailVal,
                        timestamp: new Date().toISOString()
                    };
                    response = await fetch("/request-support", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(requestData)
                    });
                }
                const result = await response.json();

                if (result.success) {
                    msgDiv.style.color = "green";
                    msgDiv.textContent = "申請を受け付けました。管理者が確認次第ご連絡します。";
                    form.reset();
                    if (fileInput) fileInput.value = "";
                    const namesEp = document.getElementById("support-attachment-names");
                    if (namesEp) {
                        namesEp.textContent = "";
                        namesEp.style.display = "none";
                    }
                    const dzClear = document.getElementById("support-dropzone");
                    if (dzClear) dzClear.classList.remove("support-dropzone--over");

                    await loadMyTickets();
                    activateTab("support-history-panel");
                } else {
                    throw new Error(result.message || "送信失敗");
                }
            } catch (error) {
                console.error(error);
                msgDiv.style.color = "red";
                msgDiv.textContent = "エラーが発生しました: " + error.message;
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "送信する";
                }
            }
        });
    }

    if (refreshMyTicketsBtn) {
        refreshMyTicketsBtn.addEventListener("click", loadMyTickets);
    }

    activateTab("support-form-panel");
});