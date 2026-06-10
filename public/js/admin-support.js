document.addEventListener("DOMContentLoaded", function () {
    console.log("☎️ CRM Manager Loaded");

    const supportListBody = document.getElementById("support-ticket-list-body");
    const supportFilterArea = document.getElementById("support-filter-area");
    const supportModal = document.getElementById("support-ticket-modal");
    const supportModalClose = document.getElementById("support-ticket-modal-close");
    const btnSupportUpdate = document.getElementById("btn-support-update");
    const kaitoriContainer = document.querySelector("#kaitori-list-container");

    let allSupportTickets = [];
    let currentFilter = "active";
    let currentTicket = null;
    /** 申請日時降順が従来の既定表示 */
    let supportSortKey = "timestamp";
    let supportSortDirection = "desc";

    const SUPPORT_STATUS_SORT_RANK = {
        open: 0,
        verifying: 1,
        resolved: 2
    };

    function esc(text) {
        if (typeof escapeHtml !== "undefined") return escapeHtml(text);
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escAttr(text) {
        return esc(text);
    }

    function formatSupportDateTime(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return y + "/" + mo + "/" + da + " " + h + ":" + mi;
    }

    function supportStatusLabel(status) {
        if (status === "open") return "未対応";
        if (status === "verifying") return "検証中";
        if (status === "resolved") return "対応完了";
        return status || "未対応";
    }

    function supportDisplayId(ticket) {
        if (ticket.displayId != null && String(ticket.displayId).trim() !== "") {
            return String(ticket.displayId);
        }
        return ticket.ticketId != null ? String(ticket.ticketId) : "";
    }

    function supportStatusBadgeClass(status) {
        if (status === "open") return "support-status-badge--open";
        if (status === "verifying") return "support-status-badge--verifying";
        if (status === "resolved") return "support-status-badge--resolved";
        return "support-status-badge--open";
    }

    document.addEventListener("admin-ready", function () {
        console.log("🚀 CRM Manager: Auth Signal Received.");
        setupSupportFilterTabs();
        renderSupportTableHead();
        fetchSupportTickets();
        if (kaitoriContainer) fetchKaitoriList();
    });

    function setupSupportFilterTabs() {
        if (!supportFilterArea || document.getElementById("support-status-tab-container")) return;

        const container = document.createElement("div");
        container.id = "support-status-tab-container";

        const btnActive = createFilterTabBtn("未対応", "btn-warning");
        const btnClosed = createFilterTabBtn("履歴", "btn-secondary");

        btnActive.onclick = function () {
            currentFilter = "active";
            updateFilterTabStyle(btnActive, btnClosed);
            applyFilterAndRender();
        };
        btnClosed.onclick = function () {
            currentFilter = "closed";
            updateFilterTabStyle(btnClosed, btnActive);
            applyFilterAndRender();
        };

        container.appendChild(btnActive);
        container.appendChild(btnClosed);
        supportFilterArea.appendChild(container);
        updateFilterTabStyle(btnActive, btnClosed);
    }

    function createFilterTabBtn(text, cls) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = text;
        btn.className = "btn " + cls;
        return btn;
    }

    function updateFilterTabStyle(active, inactive) {
        active.style.opacity = "1";
        active.style.fontWeight = "bold";
        active.style.border = "2px solid #333";
        inactive.style.opacity = "0.6";
        inactive.style.fontWeight = "normal";
        inactive.style.border = "1px solid #ccc";
    }

    async function fetchSupportTickets() {
        if (!supportListBody) return;
        supportListBody.innerHTML =
            '<tr><td colspan="4" class="support-table-empty">データを問い合わせ中...</td></tr>';
        try {
            const response = await fetch("/admin/support-tickets");

            if (response.status === 401) {
                supportListBody.innerHTML =
                    '<tr><td colspan="4" class="support-table-empty">認証待ち...</td></tr>';
                return;
            }

            if (!response.ok) throw new Error("取得に失敗しました");

            allSupportTickets = await response.json();
            applyFilterAndRender();
        } catch (error) {
            supportListBody.innerHTML =
                '<tr><td colspan="4" class="support-table-empty support-table-empty--error">読み込みエラー: ' +
                esc(error.message) +
                "</td></tr>";
        }
    }

    function getSupportSortRawValue(ticket, key) {
        if (!ticket) return null;
        switch (key) {
            case "id":
                return supportDisplayId(ticket);
            case "timestamp":
                return ticket.timestamp || "";
            case "customerName":
                return ticket.customerName || "";
            case "status":
                return ticket.status || "open";
            default:
                return null;
        }
    }

    function compareSupportSortValues(aVal, bVal, key) {
        if (aVal == null && bVal == null) return 0;
        if (aVal == null || aVal === "") return 1;
        if (bVal == null || bVal === "") return -1;

        if (key === "timestamp") {
            const ta = new Date(aVal).getTime();
            const tb = new Date(bVal).getTime();
            const na = Number.isNaN(ta) ? 0 : ta;
            const nb = Number.isNaN(tb) ? 0 : tb;
            return na - nb;
        }

        if (key === "id") {
            const na = Number(aVal);
            const nb = Number(bVal);
            if (!Number.isNaN(na) && !Number.isNaN(nb) && String(aVal).trim() !== "" && String(bVal).trim() !== "") {
                return na - nb;
            }
            return String(aVal).localeCompare(String(bVal), "ja", { numeric: true });
        }

        if (key === "status") {
            const ra = Object.prototype.hasOwnProperty.call(SUPPORT_STATUS_SORT_RANK, aVal)
                ? SUPPORT_STATUS_SORT_RANK[aVal]
                : 99;
            const rb = Object.prototype.hasOwnProperty.call(SUPPORT_STATUS_SORT_RANK, bVal)
                ? SUPPORT_STATUS_SORT_RANK[bVal]
                : 99;
            if (ra !== rb) return ra - rb;
            return String(aVal).localeCompare(String(bVal), "ja");
        }

        return String(aVal).localeCompare(String(bVal), "ja", { sensitivity: "base" });
    }

    function sortSupportTickets(tickets) {
        if (!supportSortKey || !Array.isArray(tickets)) return tickets;
        const dir = supportSortDirection === "desc" ? -1 : 1;
        const key = supportSortKey;
        return [...tickets].sort(function (a, b) {
            const cmp = compareSupportSortValues(
                getSupportSortRawValue(a, key),
                getSupportSortRawValue(b, key),
                key
            );
            if (cmp !== 0) return cmp * dir;
            const idA = getSupportSortRawValue(a, "id");
            const idB = getSupportSortRawValue(b, "id");
            return compareSupportSortValues(idA, idB, "id") * dir;
        });
    }

    function handleSupportSortHeaderClick(key) {
        if (supportSortKey === key) {
            supportSortDirection = supportSortDirection === "asc" ? "desc" : "asc";
        } else {
            supportSortKey = key;
            supportSortDirection = "asc";
        }
        renderSupportTableHead();
        applyFilterAndRender();
    }

    function createSupportSortHeaderCell(key, label, className) {
        const th = document.createElement("th");
        th.scope = "col";
        if (className) th.className = className;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "orders-sort-link";
        btn.textContent = label;

        if (supportSortKey === key) {
            btn.classList.add("is-active");
            btn.setAttribute(
                "aria-sort",
                supportSortDirection === "asc" ? "ascending" : "descending"
            );
            const indicator = document.createElement("span");
            indicator.className = "orders-sort-indicator";
            indicator.setAttribute("aria-hidden", "true");
            indicator.textContent = supportSortDirection === "asc" ? " ▲" : " ▼";
            btn.appendChild(indicator);
        } else {
            btn.setAttribute("aria-sort", "none");
        }

        btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleSupportSortHeaderClick(key);
        });

        th.appendChild(btn);
        return th;
    }

    function renderSupportTableHead() {
        const headRow = document.getElementById("support-table-head-row");
        if (!headRow) return;
        headRow.innerHTML = "";
        headRow.appendChild(createSupportSortHeaderCell("id", "ID", "support-col-id"));
        headRow.appendChild(createSupportSortHeaderCell("timestamp", "申請日時"));
        headRow.appendChild(createSupportSortHeaderCell("customerName", "顧客名"));
        headRow.appendChild(createSupportSortHeaderCell("status", "状態"));
    }

    function applyFilterAndRender() {
        let filtered = [];

        if (currentFilter === "active") {
            filtered = allSupportTickets.filter(function (t) {
                return t.status === "open" || t.status === "verifying";
            });
        } else {
            filtered = allSupportTickets.filter(function (t) {
                return t.status === "resolved";
            });
        }

        renderSupportTicketTable(sortSupportTickets(filtered));
    }

    function renderSupportTicketTable(tickets) {
        if (!supportListBody) return;
        supportListBody.innerHTML = "";

        if (!tickets.length) {
            let msg = "該当するデータはありません";
            if (currentFilter === "active") msg = "現在、未対応の申請はありません";
            else msg = "完了済みの案件はありません";

            supportListBody.innerHTML =
                '<tr><td colspan="4" class="support-table-empty">' + esc(msg) + "</td></tr>";
            return;
        }

        tickets.forEach(function (ticket) {
            const ticketId = ticket.ticketId != null ? String(ticket.ticketId) : "";
            const idShown = supportDisplayId(ticket);
            const dateStr = formatSupportDateTime(ticket.timestamp);
            const status = ticket.status || "open";
            const statusLabel = supportStatusLabel(status);
            const badgeClass = supportStatusBadgeClass(status);

            const tr = document.createElement("tr");
            tr.className = "support-row";
            tr.dataset.id = ticketId;

            tr.innerHTML =
                '<td class="support-col-id"><a href="#" class="support-id-link" data-id="' +
                escAttr(ticketId) +
                '">' +
                esc(idShown) +
                "</a></td>" +
                "<td>" +
                esc(dateStr) +
                "</td>" +
                "<td>" +
                esc(ticket.customerName || "不明") +
                "</td>" +
                '<td><span class="support-status-badge ' +
                badgeClass +
                '">' +
                esc(statusLabel) +
                "</span></td>";

            tr.addEventListener("click", function (e) {
                if (e.target.closest(".support-id-link")) return;
                const req = allSupportTickets.find(function (t) {
                    return String(t.ticketId) === ticketId;
                });
                if (req) openSupportTicketModal(req);
            });

            const link = tr.querySelector(".support-id-link");
            if (link) {
                link.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const req = allSupportTickets.find(function (t) {
                        return String(t.ticketId) === ticketId;
                    });
                    if (req) openSupportTicketModal(req);
                });
            }

            supportListBody.appendChild(tr);
        });
    }

    function openSupportTicketModal(ticket) {
        currentTicket = ticket;
        if (!supportModal) return;

        const ticketId = ticket.ticketId != null ? String(ticket.ticketId) : "";
        const idShown = supportDisplayId(ticket);
        const setText = function (id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val != null ? String(val) : "";
        };
        const setInput = function (id, val) {
            const el = document.getElementById(id);
            if (el) el.value = val != null ? String(val) : "";
        };

        setText("support-m-ticket-id", idShown);
        setText(
            "support-m-customer",
            (ticket.customerName || "不明") + " (" + (ticket.customerId || "") + ")"
        );
        setText("support-m-date", formatSupportDateTime(ticket.timestamp));
        setInput("support-m-order-id", ticket.orderId || "");
        setInput("support-m-customer-po", ticket.customerPoNumber || "");
        setInput("support-m-internal-order", ticket.internalOrderNo || "");
        setInput("support-m-internal-po", ticket.internalCustomerPoNumber || "");
        setInput("support-m-desired-action", ticket.desiredAction || "");
        setInput("support-m-collection-date", ticket.collectionDate || "");

        const detailEl = document.getElementById("support-m-detail");
        if (detailEl) detailEl.textContent = ticket.detail || "";

        const statusEl = document.getElementById("support-m-status");
        if (statusEl) statusEl.value = ticket.status || "open";

        const logInput = document.getElementById("support-m-history-log");
        if (logInput) logInput.value = "";

        const historyEl = document.getElementById("support-m-history");
        if (historyEl) {
            if (ticket.history && ticket.history.length > 0) {
                historyEl.innerHTML = ticket.history
                    .map(function (h) {
                        const hDate = new Date(h.date).toLocaleString("ja-JP", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                        });
                        return (
                            '<div style="border-bottom:1px solid #eee; margin-bottom:4px; padding-bottom:4px;">' +
                            '<span style="color:#666; font-size:0.8em;">' +
                            esc(hDate) +
                            "</span> " +
                            esc(h.action) +
                            "</div>"
                        );
                    })
                    .join("");
            } else {
                historyEl.innerHTML = '<span style="color:#999;">履歴なし</span>';
            }
        }

        const attachWrap = document.getElementById("support-m-attachments-wrap");
        const attachList = document.getElementById("support-m-attachments");
        const attachments = ticket.attachments;
        if (attachWrap && attachList) {
            if (attachments && attachments.length > 0) {
                attachWrap.style.display = "";
                attachList.innerHTML = attachments
                    .map(function (a) {
                        const tid = encodeURIComponent(ticketId);
                        const sn = encodeURIComponent(a.storedName || "");
                        const lab = esc(a.originalName || a.storedName || "file");
                        return (
                            '<li><a href="/support/attachment/' +
                            tid +
                            "/" +
                            sn +
                            '" target="_blank" rel="noopener">' +
                            lab +
                            "</a></li>"
                        );
                    })
                    .join("");
            } else {
                attachWrap.style.display = "none";
                attachList.innerHTML = "";
            }
        }

        supportModal.style.display = "flex";

        const auditFooter = document.getElementById("support-m-audit-footer");
        if (auditFooter && window.AuditRecordFooter) {
            AuditRecordFooter.setAuditRecordFooterElement(auditFooter, ticket, {
                fallbackDateFields: ["timestamp"],
                fallbackBy: ticket.customerName || "—"
            });
        }
    }

    function closeSupportTicketModal() {
        if (supportModal) supportModal.style.display = "none";
        currentTicket = null;
    }

    if (supportModalClose) {
        supportModalClose.addEventListener("click", closeSupportTicketModal);
    }
    if (supportModal) {
        supportModal.addEventListener("click", function (e) {
            if (e.target === supportModal) closeSupportTicketModal();
        });
    }

    async function updateCurrentTicket() {
        if (!currentTicket || !currentTicket.ticketId) return;

        const ticketId = currentTicket.ticketId;
        const statusEl = document.getElementById("support-m-status");
        const logEl = document.getElementById("support-m-history-log");
        const data = {
            ticketId: ticketId,
            status: statusEl ? statusEl.value : "open",
            internalOrderNo: document.getElementById("support-m-internal-order")?.value || "",
            internalCustomerPoNumber: document.getElementById("support-m-internal-po")?.value || "",
            desiredAction: document.getElementById("support-m-desired-action")?.value || "",
            collectionDate: document.getElementById("support-m-collection-date")?.value || "",
            newHistoryLog: logEl ? logEl.value : ""
        };

        if (!confirm("内容を更新しますか？")) return;

        try {
            const response = await fetch("/admin/update-ticket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (result.success) {
                toastSuccess("更新しました");
                closeSupportTicketModal();
                fetchSupportTickets();
            } else {
                toastError("エラー: " + (result.message || "更新に失敗しました"));
            }
        } catch (e) {
            console.error(e);
            toastError("通信エラー");
        }
    }

    if (btnSupportUpdate) {
        btnSupportUpdate.addEventListener("click", updateCurrentTicket);
    }

    window.updateTicket = updateCurrentTicket;

    async function fetchKaitoriList() {
        if (!kaitoriContainer) return;
        kaitoriContainer.innerHTML = "<p>問い合わせ中...</p>";
        try {
            const res = await fetch("/admin/kaitori-list");
            if (res.status === 401) return;

            const list = await res.json();
            if (list.length === 0) {
                kaitoriContainer.innerHTML = "<p>現在、未処理の査定依頼はありません。</p>";
                return;
            }
            kaitoriContainer.innerHTML = "";
            list.forEach(function (req) {
                const div = document.createElement("div");
                div.style.background = "white";
                div.style.padding = "10px";
                div.style.marginBottom = "10px";
                div.style.borderRadius = "4px";
                div.style.borderLeft = "5px solid #28a745";
                const dateStr = new Date(req.requestDate).toLocaleString("ja-JP");
                let itemsHtml = "<ul style='margin:5px 0; padding-left:20px; font-size:0.9rem;'>";
                let totalEst = 0;
                req.items.forEach(function (item) {
                    const sub = item.price * item.quantity;
                    totalEst += sub;
                    itemsHtml +=
                        "<li>" +
                        esc(item.name) +
                        " (" +
                        esc(item.maker) +
                        ") x " +
                        item.quantity +
                        " = ¥" +
                        sub.toLocaleString() +
                        "</li>";
                });
                itemsHtml += "</ul>";
                div.innerHTML =
                    '<div style="display:flex; justify-content:space-between; font-weight:bold;">' +
                    "<span>ID: " +
                    esc(req.displayId || req.requestId) +
                    " (" +
                    esc(req.customerName) +
                    ")</span>" +
                    '<span style="color:#28a745;">見積合計: ¥' +
                    totalEst.toLocaleString() +
                    "</span>" +
                    "</div>" +
                    '<div style="font-size:0.8rem; color:#666;">' +
                    esc(dateStr) +
                    " / ステータス: " +
                    esc(req.status) +
                    "</div>" +
                    itemsHtml +
                    '<div style="font-size:0.9rem; color:#d63384;">備考: ' +
                    esc(req.note || "なし") +
                    "</div>";
                kaitoriContainer.appendChild(div);
            });
        } catch (error) {
            kaitoriContainer.innerHTML = "<p style='color:red'>読み込みエラー</p>";
        }
    }
});
