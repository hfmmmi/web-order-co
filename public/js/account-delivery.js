// 顧客: 既定納品先の編集（GET/PUT /api/account/delivery）と配送履歴の参照
(function () {
    function esc(s) {
        if (typeof escapeHtml !== "undefined") return escapeHtml(String(s == null ? "" : s));
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function toast(msg, type) {
        if (type === "success" && window.toastSuccess) window.toastSuccess(msg);
        else if (type === "error" && window.toastError) window.toastError(msg);
        else if (window.toastWarning) window.toastWarning(msg);
        else alert(msg);
    }

    document.addEventListener("DOMContentLoaded", function () {
        const loadStatus = document.getElementById("delivery-load-status");
        const mainEl = document.getElementById("delivery-main");
        const form = document.getElementById("delivery-form");
        const nameInput = document.getElementById("delivery-name");
        const zipInput = document.getElementById("delivery-zip");
        const addressInput = document.getElementById("delivery-address");
        const telInput = document.getElementById("delivery-tel");
        const saveBtn = document.getElementById("delivery-save-btn");
        const zipSearchBtn = document.getElementById("delivery-zip-search-btn");
        const historyList = document.getElementById("delivery-history-list");
        const historyResultInfo = document.getElementById("delivery-history-result-info");
        const historyPagination = document.getElementById("delivery-history-pagination");
        const historyPanel = document.querySelector(".delivery-history-panel");
        const historySearchBox = document.getElementById("delivery-history-search-box");
        const historySearchInput = document.getElementById("delivery-history-search-input");
        const historySearchBtn = document.getElementById("delivery-history-search-btn");

        const DELIVERY_HISTORY_PER_PAGE = 25;
        let deliveryHistoryAll = [];
        let deliveryHistoryView = [];
        let deliveryHistoryCurrentPage = 1;

        if (!loadStatus || !mainEl || !form) return;

        function fillForm(d) {
            if (nameInput) nameInput.value = d.deliveryName || d.name || "";
            if (zipInput) zipInput.value = (d.deliveryZip || d.zip || "").replace(/\D/g, "").slice(0, 7);
            if (addressInput) addressInput.value = d.deliveryAddress || d.address || "";
            if (telInput) telInput.value = d.deliveryTel || d.tel || "";
        }

        function collectPayload() {
            return {
                deliveryName: nameInput ? nameInput.value.trim() : "",
                deliveryZip: zipInput ? zipInput.value.replace(/\D/g, "").trim() : "",
                deliveryAddress: addressInput ? addressInput.value.trim() : "",
                deliveryTel: telInput ? telInput.value.trim() : ""
            };
        }

        if (zipSearchBtn && zipInput && addressInput) {
            zipSearchBtn.addEventListener("click", async function () {
                const zip = zipInput.value.replace(/\D/g, "");
                if (zip.length < 7) {
                    toast("郵便番号は7桁で入力してください", "warn");
                    return;
                }
                try {
                    const res = await fetch("/zip-lookup?zipcode=" + encodeURIComponent(zip), {
                        credentials: "same-origin"
                    });
                    const data = await res.json();
                    if (data.success && data.address) {
                        addressInput.value = data.address;
                    } else {
                        toast(data.message || "住所が見つかりませんでした", "warn");
                    }
                } catch (e) {
                    console.error(e);
                    toast("住所検索に失敗しました", "error");
                }
            });
        }

        const formPanel = document.querySelector(".delivery-form-panel");

        function openHistoryForEdit(item) {
            fillForm({
                name: item.name,
                zip: item.zip,
                address: item.address,
                tel: item.tel
            });
            if (formPanel) {
                formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            if (nameInput) {
                nameInput.focus();
                if (typeof nameInput.select === "function") nameInput.select();
            }
        }

        function clearDeliveryHistoryPagination() {
            if (historyPagination) historyPagination.innerHTML = "";
        }

        function getDeliveryHistoryVisiblePageNumbers(current, total, maxSlots) {
            maxSlots = maxSlots || 5;
            if (total <= maxSlots) {
                return Array.from({ length: total }, function (_, i) {
                    return i + 1;
                });
            }
            const half = Math.floor(maxSlots / 2);
            let start = Math.max(1, current - half);
            let end = Math.min(total, start + maxSlots - 1);
            if (end - start + 1 < maxSlots) {
                start = Math.max(1, end - maxSlots + 1);
            }
            return Array.from({ length: end - start + 1 }, function (_, i) {
                return start + i;
            });
        }

        function createDeliveryHistoryPaginationNavButton(label, pageNum) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "product-pagination__nav";
            btn.textContent = label;
            btn.addEventListener("click", function () {
                deliveryHistoryCurrentPage = pageNum;
                renderDeliveryHistoryPage();
                if (historyPanel) {
                    historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
            return btn;
        }

        function setupDeliveryHistoryPagination(totalPages, currentPage) {
            if (!historyPagination) return;
            historyPagination.innerHTML = "";
            if (!totalPages || totalPages <= 1) return;

            const current = Math.min(Math.max(1, currentPage), totalPages);
            const total = totalPages;

            if (current > 1) {
                historyPagination.appendChild(
                    createDeliveryHistoryPaginationNavButton("前へ", current - 1)
                );
            }

            getDeliveryHistoryVisiblePageNumbers(current, total, 5).forEach(function (p) {
                if (p === current) {
                    const cur = document.createElement("span");
                    cur.className = "product-pagination__page is-current";
                    cur.textContent = String(p);
                    cur.setAttribute("aria-current", "page");
                    historyPagination.appendChild(cur);
                    return;
                }
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "product-pagination__page";
                btn.textContent = String(p);
                btn.addEventListener("click", function () {
                    deliveryHistoryCurrentPage = p;
                    renderDeliveryHistoryPage();
                    if (historyPanel) {
                        historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                });
                historyPagination.appendChild(btn);
            });

            if (current < total) {
                historyPagination.appendChild(
                    createDeliveryHistoryPaginationNavButton("次へ", current + 1)
                );
            }
        }

        function updateDeliveryHistorySearchBoxVisibility() {
            if (!historySearchBox) return;
            if (deliveryHistoryAll.length > 0) {
                historySearchBox.hidden = false;
            } else {
                historySearchBox.hidden = true;
                if (historySearchInput) historySearchInput.value = "";
            }
        }

        function filterDeliveryHistoryList(list, keyword) {
            const kw = (keyword || "").trim().toLowerCase();
            if (!kw) return list.slice();
            return list.filter(function (item) {
                const targetStr = [
                    item.address || "",
                    item.name || "",
                    item.tel || "",
                    item.zip || "",
                    item.contactName || ""
                ]
                    .join(" ")
                    .toLowerCase();
                return targetStr.includes(kw);
            });
        }

        function applyDeliveryHistorySearch() {
            const keyword = historySearchInput ? historySearchInput.value : "";
            deliveryHistoryView = filterDeliveryHistoryList(deliveryHistoryAll, keyword);
            deliveryHistoryCurrentPage = 1;
            renderDeliveryHistoryPage();
        }

        function updateDeliveryHistoryResultInfo(totalCount, fromN, toN, totalPages) {
            if (!historyResultInfo) return;
            if (!deliveryHistoryAll.length) {
                historyResultInfo.innerHTML = "";
                return;
            }
            if (!totalCount) {
                historyResultInfo.innerHTML = "該当：<strong>0</strong> 件";
                return;
            }
            if (totalPages > 1) {
                historyResultInfo.innerHTML =
                    "該当：<strong>" +
                    totalCount +
                    "</strong> 件 · <strong>" +
                    fromN +
                    "</strong>〜<strong>" +
                    toN +
                    "</strong> 件を表示";
            } else {
                historyResultInfo.innerHTML =
                    "該当：<strong>" + totalCount + "</strong> 件";
            }
        }

        function bindDeliveryHistoryEditButtons() {
            if (!historyList) return;
            historyList.querySelectorAll(".btn-edit-history").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    const row = btn.closest(".delivery-history-item");
                    const idx = row ? parseInt(row.getAttribute("data-idx"), 10) : -1;
                    const item = deliveryHistoryView[idx];
                    if (!item) return;
                    openHistoryForEdit(item);
                });
            });
        }

        function renderDeliveryHistoryPage() {
            if (!historyList) return;

            if (!deliveryHistoryAll.length) {
                clearDeliveryHistoryPagination();
                updateDeliveryHistoryResultInfo(0, 0, 0, 1);
                historyList.innerHTML =
                    '<p class="delivery-history-empty">過去の納品先はまだありません。</p>';
                return;
            }

            if (!deliveryHistoryView.length) {
                clearDeliveryHistoryPagination();
                updateDeliveryHistoryResultInfo(0, 0, 0, 1);
                historyList.innerHTML =
                    '<p class="delivery-history-empty">一致する納品先はありません。</p>';
                return;
            }

            const totalPages = Math.max(
                1,
                Math.ceil(deliveryHistoryView.length / DELIVERY_HISTORY_PER_PAGE)
            );
            if (deliveryHistoryCurrentPage > totalPages) {
                deliveryHistoryCurrentPage = totalPages;
            }
            if (deliveryHistoryCurrentPage < 1) deliveryHistoryCurrentPage = 1;

            const start = (deliveryHistoryCurrentPage - 1) * DELIVERY_HISTORY_PER_PAGE;
            const pageItems = deliveryHistoryView.slice(
                start,
                start + DELIVERY_HISTORY_PER_PAGE
            );
            const fromN = start + 1;
            const toN = start + pageItems.length;
            const totalCount = deliveryHistoryView.length;

            updateDeliveryHistoryResultInfo(totalCount, fromN, toN, totalPages);

            historyList.innerHTML = pageItems
                .map(function (item, pageIdx) {
                    const globalIdx = start + pageIdx;
                    const label = item.name
                        ? esc(item.name) + " 様"
                        : "（宛名なし）";
                    return (
                        '<div class="delivery-history-item" data-idx="' +
                        globalIdx +
                        '">' +
                        '<div class="delivery-history-item__name">' +
                        label +
                        "</div>" +
                        '<button type="button" class="btn-edit-history">編集</button>' +
                        "</div>"
                    );
                })
                .join("");

            bindDeliveryHistoryEditButtons();
            setupDeliveryHistoryPagination(totalPages, deliveryHistoryCurrentPage);
        }

        function setDeliveryHistoryList(list) {
            deliveryHistoryAll = Array.isArray(list) ? list : [];
            if (historySearchInput) historySearchInput.value = "";
            deliveryHistoryView = deliveryHistoryAll.slice();
            deliveryHistoryCurrentPage = 1;
            updateDeliveryHistorySearchBoxVisibility();
            renderDeliveryHistoryPage();
        }

        if (historySearchBtn) {
            historySearchBtn.addEventListener("click", applyDeliveryHistorySearch);
        }
        if (historySearchInput) {
            historySearchInput.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    applyDeliveryHistorySearch();
                }
            });
        }

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            if (saveBtn) saveBtn.disabled = true;
            try {
                const res = await fetch("/api/account/delivery", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(collectPayload())
                });
                if (res.status === 401) {
                    window.location.href = "/login.html";
                    return;
                }
                const data = await res.json().catch(function () {
                    return {};
                });
                if (!res.ok || !data.success) {
                    toast(data.message || "保存に失敗しました", "error");
                    return;
                }
                toast(data.message || "納品先を保存しました", "success");
            } catch (err) {
                console.error(err);
                toast("保存に失敗しました", "error");
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        });

        Promise.all([
            fetch("/api/account/delivery", { credentials: "same-origin" }),
            fetch("/delivery-history", { credentials: "same-origin" })
        ])
            .then(async function (results) {
                const deliveryRes = results[0];
                const historyRes = results[1];

                if (deliveryRes.status === 401) {
                    window.location.href = "/login.html";
                    return;
                }
                if (!deliveryRes.ok) {
                    loadStatus.textContent = "納品先の読み込みに失敗しました。";
                    return;
                }

                const deliveryJson = await deliveryRes.json();
                if (deliveryJson.delivery) fillForm(deliveryJson.delivery);

                let historyListData = [];
                if (historyRes.ok) {
                    const historyJson = await historyRes.json();
                    if (historyJson.success && Array.isArray(historyJson.list)) {
                        historyListData = historyJson.list;
                    }
                }
                setDeliveryHistoryList(historyListData);

                loadStatus.style.display = "none";
                mainEl.style.display = "block";
            })
            .catch(function (err) {
                console.error(err);
                loadStatus.textContent = "読み込みに失敗しました。しばらくしてから再度お試しください。";
            });
    });
})();
