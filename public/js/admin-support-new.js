// public/js/admin-support-new.js — サポートチケット新規登録（受注システム内）
document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("support-create-form");
    const loadStatusEl = document.getElementById("support-new-load-status");
    const statusMsgEl = document.getElementById("support-new-status-message");
    const submitBtn = document.getElementById("support-create-submit");
    const customerSearchInput = document.getElementById("support-create-customer-search");
    const customerSuggestionsUl = document.getElementById("support-create-customer-suggestions");

    let allCustomers = [];
    let selectedCustomerId = null;
    const SUGGEST_LIMIT = 20;
    const MAX_ATTACH_FILES = 5;

    function setLoadStatus(text, isError) {
        if (!loadStatusEl) return;
        loadStatusEl.textContent = text;
        loadStatusEl.style.color = isError ? "#b91c1c" : "#6b7280";
        loadStatusEl.style.display = text ? "block" : "none";
    }

    function setStatusMessage(text, isError) {
        if (!statusMsgEl) return;
        statusMsgEl.textContent = text;
        statusMsgEl.style.color = isError ? "#b91c1c" : "#15803d";
    }

    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function norm(s) {
        return String(s || "")
            .normalize("NFKC")
            .toLowerCase();
    }

    function closeCustomerSuggestions() {
        if (!customerSuggestionsUl) return;
        customerSuggestionsUl.classList.remove("is-open");
        customerSuggestionsUl.innerHTML = "";
        if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "false");
    }

    function openCustomerSuggestions() {
        if (!customerSuggestionsUl) return;
        customerSuggestionsUl.classList.add("is-open");
        if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "true");
    }

    function clearCustomerSelection() {
        selectedCustomerId = null;
    }

    function selectCustomer(c) {
        if (!c || !c.customerId) return;
        selectedCustomerId = String(c.customerId).trim();
        if (customerSearchInput) {
            customerSearchInput.value = "(" + selectedCustomerId + ") " + (c.customerName || "");
        }
        closeCustomerSuggestions();
    }

    function renderCustomerSuggestions() {
        if (!customerSuggestionsUl || !customerSearchInput) return;
        const raw = customerSearchInput.value.trim();
        customerSuggestionsUl.innerHTML = "";

        if (raw.length === 0) {
            const li = document.createElement("li");
            li.textContent = "顧客IDまたは社名を入力してください";
            li.style.color = "#6b7280";
            li.style.cursor = "default";
            customerSuggestionsUl.appendChild(li);
            openCustomerSuggestions();
            return;
        }

        const q = norm(raw);
        const hits = allCustomers.filter(function (c) {
            const id = norm(c.customerId);
            const name = norm(c.customerName);
            return id.includes(q) || name.includes(q);
        });
        hits.sort(function (a, b) {
            return String(a.customerId).localeCompare(String(b.customerId), "ja");
        });
        const slice = hits.slice(0, SUGGEST_LIMIT);

        if (slice.length === 0) {
            const li = document.createElement("li");
            li.textContent = "該当する顧客がありません";
            li.style.color = "#6b7280";
            li.style.cursor = "default";
            customerSuggestionsUl.appendChild(li);
            openCustomerSuggestions();
            return;
        }

        slice.forEach(function (c) {
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.textContent = "(" + c.customerId + ") " + (c.customerName || "");
            li.addEventListener("mousedown", function (e) {
                e.preventDefault();
                selectCustomer(c);
            });
            customerSuggestionsUl.appendChild(li);
        });
        openCustomerSuggestions();
    }

    const debouncedRenderCustomerSuggestions = debounce(renderCustomerSuggestions, 200);

    async function fetchAllAdminCustomers() {
        const all = [];
        let page = 1;
        let totalPages = 1;
        do {
            const res = await fetch("/api/admin/customers?keyword=&page=" + page, { credentials: "include" });
            if (res.status === 401) throw new Error("セッション切れです。再ログインしてください。");
            const data = await res.json();
            if (Array.isArray(data.customers)) all.push.apply(all, data.customers);
            totalPages = Math.max(1, parseInt(data.totalPages, 10) || 1);
            page++;
        } while (page <= totalPages);
        return all;
    }

    function applyUrlPrefill() {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get("orderId");
        const customerId = params.get("customerId");
        if (orderId) {
            const orderInput = document.getElementById("support-create-order-id");
            if (orderInput) orderInput.value = orderId;
        }
        if (customerId && allCustomers.length) {
            const c = allCustomers.find(function (x) {
                return String(x.customerId) === String(customerId);
            });
            if (c) selectCustomer(c);
        }
    }

    document.addEventListener("admin-ready", async function () {
        try {
            allCustomers = await fetchAllAdminCustomers();
            if (customerSearchInput) {
                customerSearchInput.disabled = false;
                customerSearchInput.addEventListener("input", function () {
                    if (
                        selectedCustomerId &&
                        !customerSearchInput.value.trim().startsWith("(" + selectedCustomerId + ")")
                    ) {
                        clearCustomerSelection();
                    }
                    debouncedRenderCustomerSuggestions();
                });
                customerSearchInput.addEventListener("focus", function () {
                    renderCustomerSuggestions();
                });
            }
            document.addEventListener("click", function (e) {
                if (e.target.closest(".support-create-customer-wrap")) return;
                closeCustomerSuggestions();
            });

            applyUrlPrefill();
            setLoadStatus("", false);
            if (form) form.style.display = "";
        } catch (err) {
            setLoadStatus("読み込みに失敗しました: " + err.message, true);
        }
    });

    if (form) {
        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            setStatusMessage("", false);

            const typeVal = document.getElementById("support-create-type")?.value || "";
            const detailVal = document.getElementById("support-create-detail")?.value?.trim() || "";
            const orderIdVal = document.getElementById("support-create-order-id")?.value?.trim() || "";
            const customerPoVal = document.getElementById("support-create-customer-po")?.value?.trim() || "";
            const fileInput = document.getElementById("support-create-attachments");
            const files = fileInput?.files ? Array.from(fileInput.files) : [];
            const customerIdVal = selectedCustomerId || "";

            if (files.length > MAX_ATTACH_FILES) {
                setStatusMessage("添付は最大5ファイルまでです。", true);
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "登録中…";
            }

            try {
                let response;
                if (files.length > 0) {
                    const formData = new FormData();
                    formData.append("customerId", customerIdVal);
                    formData.append("category", "product");
                    formData.append("type", typeVal);
                    formData.append("detail", detailVal);
                    formData.append("orderId", orderIdVal);
                    formData.append("customerPoNumber", customerPoVal);
                    files.forEach(function (f) {
                        formData.append("attachments", f);
                    });
                    response = await fetch("/admin/create-ticket", {
                        method: "POST",
                        credentials: "include",
                        body: formData
                    });
                } else {
                    response = await fetch("/admin/create-ticket", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            customerId: customerIdVal,
                            category: "product",
                            type: typeVal,
                            detail: detailVal,
                            orderId: orderIdVal,
                            customerPoNumber: customerPoVal
                        })
                    });
                }

                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "登録に失敗しました");
                }

                const idShown = result.displayId || result.ticketId || "";
                window.location.href =
                    "admin-support.html" + (idShown ? "?created=" + encodeURIComponent(idShown) : "");
            } catch (err) {
                setStatusMessage(err.message || "登録に失敗しました", true);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "登録する";
                }
            }
        });
    }
});
