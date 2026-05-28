// public/js/admin-orders-new.js — 受注 新規追加専用ページ
document.addEventListener("DOMContentLoaded", function () {
    const orderCreateForm = document.getElementById("order-create-form");
    const orderCreateLinesBody = document.getElementById("order-create-lines-body");
    const loadStatusEl = document.getElementById("order-new-load-status");
    const btnOrderCreateAddLine = document.getElementById("order-create-add-line");
    const btnOrderCreateSubmit = document.getElementById("order-create-submit");
    const customerSearchInput = document.getElementById("order-create-customer-search");
    const customerSuggestionsUl = document.getElementById("order-create-customer-suggestions");
    const customerWrap = document.querySelector(".order-create-customer-wrap");
    const zipInput = document.getElementById("order-create-deliv-zip");
    const addressInput = document.getElementById("order-create-deliv-address");
    const delivNameInput = document.getElementById("order-create-deliv-name");
    const btnCustomerLookup = document.getElementById("btn-order-create-customer-lookup");
    const btnDelivLookup = document.getElementById("btn-order-create-deliv-lookup");
    const customerPickerModal = document.getElementById("order-create-customer-picker-modal");
    const customerPickerKeyword = document.getElementById("order-create-customer-picker-keyword");
    const customerPickerResults = document.getElementById("order-create-customer-picker-results");
    const delivPickerModal = document.getElementById("order-create-deliv-picker-modal");
    const delivPickerKeyword = document.getElementById("order-create-deliv-picker-keyword");
    const delivPickerResults = document.getElementById("order-create-deliv-picker-results");

    let cachedProductsForOrderCreate = null;
    let zipLookupSeq = 0;
    let allCustomersForOrder = [];
    let selectedCustomerId = null;
    let selectedDisplayText = "";

    const SUGGEST_LIMIT = 20;
    const PRODUCT_SUGGEST_LIMIT = 20;

    function localTodayYmd() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }

    function setLoadStatus(text, isError) {
        if (!loadStatusEl) return;
        loadStatusEl.textContent = text;
        loadStatusEl.style.color = isError ? "#b91c1c" : "#6b7280";
        loadStatusEl.style.display = text ? "block" : "none";
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
        selectedDisplayText = "";
    }

    function selectCustomer(c) {
        if (!c || !c.customerId) return;
        selectedCustomerId = String(c.customerId).trim();
        selectedDisplayText = "(" + selectedCustomerId + ") " + (c.customerName || "");
        if (customerSearchInput) customerSearchInput.value = selectedDisplayText;
        closeCustomerSuggestions();
    }

    function filterCustomersByKeyword(keyword) {
        const q = norm(keyword);
        if (!q) return [];
        return allCustomersForOrder
            .filter(function (c) {
                return norm(c.customerId).includes(q) || norm(c.customerName).includes(q);
            })
            .sort(function (a, b) {
                return String(a.customerId).localeCompare(String(b.customerId), "ja");
            })
            .slice(0, 50);
    }

    function filterCustomersForDeliveryPicker(keyword) {
        const q = norm(keyword);
        if (!q) return [];
        return allCustomersForOrder
            .filter(function (c) {
                const blob = [
                    c.deliveryName,
                    c.customerName,
                    c.customerId,
                    c.deliveryAddress,
                    c.deliveryZip,
                    c.deliveryTel
                ]
                    .map(function (v) {
                        return norm(v);
                    })
                    .join(" ");
                return blob.includes(q);
            })
            .sort(function (a, b) {
                const na = norm(a.deliveryName || a.customerName);
                const nb = norm(b.deliveryName || b.customerName);
                if (na !== nb) return na.localeCompare(nb, "ja");
                return String(a.customerId).localeCompare(String(b.customerId), "ja");
            })
            .slice(0, 50);
    }

    function setPickerModalOpen(modal, open) {
        if (!modal) return;
        modal.classList.toggle("is-open", open);
        modal.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function closeCustomerPickerModal() {
        setPickerModalOpen(customerPickerModal, false);
    }

    function openCustomerPickerModal() {
        if (!customerPickerModal) return;
        if (customerPickerKeyword) {
            customerPickerKeyword.value = customerSearchInput ? customerSearchInput.value.trim() : "";
        }
        setPickerModalOpen(customerPickerModal, true);
        renderCustomerPickerResults();
        if (customerPickerKeyword) customerPickerKeyword.focus();
    }

    function closeDelivPickerModal() {
        setPickerModalOpen(delivPickerModal, false);
    }

    function openDelivPickerModal() {
        if (!delivPickerModal) return;
        if (delivPickerKeyword) {
            delivPickerKeyword.value = delivNameInput ? delivNameInput.value.trim() : "";
        }
        setPickerModalOpen(delivPickerModal, true);
        renderDelivPickerResults();
        if (delivPickerKeyword) delivPickerKeyword.focus();
    }

    function renderCustomerPickerResults() {
        if (!customerPickerResults) return;
        customerPickerResults.innerHTML = "";
        const raw = customerPickerKeyword ? customerPickerKeyword.value.trim() : "";
        if (!raw) {
            const li = document.createElement("li");
            li.className = "order-create-picker-empty";
            li.textContent = "顧客IDまたは顧客名を入力してください";
            customerPickerResults.appendChild(li);
            return;
        }
        const hits = filterCustomersByKeyword(raw);
        if (hits.length === 0) {
            const li = document.createElement("li");
            li.className = "order-create-picker-empty";
            li.textContent = "一致する顧客がありません";
            customerPickerResults.appendChild(li);
            return;
        }
        hits.forEach(function (c) {
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.textContent = "(" + c.customerId + ") " + (c.customerName || "");
            li.addEventListener("click", function () {
                selectCustomer(c);
                closeCustomerPickerModal();
            });
            customerPickerResults.appendChild(li);
        });
    }

    function selectDeliveryFromCustomerMaster(c) {
        if (!c) return;
        selectCustomer(c);
        applyDeliveryFromMaster(c);
        closeDelivPickerModal();
    }

    function renderDelivPickerResults() {
        if (!delivPickerResults) return;
        delivPickerResults.innerHTML = "";
        const raw = delivPickerKeyword ? delivPickerKeyword.value.trim() : "";
        if (!raw) {
            const li = document.createElement("li");
            li.className = "order-create-picker-empty";
            li.textContent = "納品先名・顧客名・顧客IDで検索してください";
            delivPickerResults.appendChild(li);
            return;
        }
        const hits = filterCustomersForDeliveryPicker(raw);
        if (hits.length === 0) {
            const li = document.createElement("li");
            li.className = "order-create-picker-empty";
            li.textContent = "一致する納品先がありません";
            delivPickerResults.appendChild(li);
            return;
        }
        hits.forEach(function (c) {
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            const delivLabel = String(c.deliveryName || "").trim() || String(c.customerName || "").trim();
            const main = document.createElement("span");
            main.textContent = "(" + c.customerId + ") " + (c.customerName || "");
            li.appendChild(main);
            const subParts = [];
            if (delivLabel) subParts.push("納品先: " + delivLabel);
            const addr = String(c.deliveryAddress || "").trim();
            if (addr) subParts.push(addr);
            if (subParts.length) {
                const sub = document.createElement("span");
                sub.className = "order-create-picker-sub";
                sub.textContent = subParts.join(" · ");
                li.appendChild(sub);
            }
            li.addEventListener("click", function () {
                selectDeliveryFromCustomerMaster(c);
            });
            delivPickerResults.appendChild(li);
        });
    }

    const debouncedCustomerPickerRender = debounce(renderCustomerPickerResults, 200);
    const debouncedDelivPickerRender = debounce(renderDelivPickerResults, 200);

    function renderCustomerSuggestions() {
        if (!customerSuggestionsUl || !customerSearchInput) return;
        const raw = customerSearchInput.value.trim();
        customerSuggestionsUl.innerHTML = "";

        if (raw.length === 0) {
            const li = document.createElement("li");
            li.className = "order-create-customer-suggest-empty";
            li.textContent = "顧客IDまたは社名を入力してください";
            customerSuggestionsUl.appendChild(li);
            openCustomerSuggestions();
            return;
        }

        const q = norm(raw);
        const hits = allCustomersForOrder.filter((c) => {
            const id = norm(c.customerId);
            const name = norm(c.customerName);
            return id.includes(q) || name.includes(q);
        });
        hits.sort((a, b) => String(a.customerId).localeCompare(String(b.customerId), "ja"));
        const slice = hits.slice(0, SUGGEST_LIMIT);

        if (slice.length === 0) {
            const li = document.createElement("li");
            li.className = "order-create-customer-suggest-empty";
            li.textContent = "一致する顧客がありません";
            customerSuggestionsUl.appendChild(li);
        } else {
            slice.forEach((c) => {
                const li = document.createElement("li");
                li.setAttribute("role", "option");
                li.textContent = "(" + c.customerId + ") " + (c.customerName || "");
                li.addEventListener("mousedown", function (e) {
                    e.preventDefault();
                    selectCustomer(c);
                });
                customerSuggestionsUl.appendChild(li);
            });
        }
        openCustomerSuggestions();
    }

    const debouncedRenderSuggestions = debounce(renderCustomerSuggestions, 200);

    function digitsOnlyZipString(s) {
        return String(s || "").replace(/\D/g, "").slice(0, 7);
    }

    async function lookupAddressFromZip() {
        if (!zipInput || !addressInput) return;
        const zip = digitsOnlyZipString(zipInput.value);
        zipInput.value = zip;
        if (zip.length !== 7) return;
        const seq = ++zipLookupSeq;
        try {
            const res = await fetch("/zip-lookup?zipcode=" + encodeURIComponent(zip), { credentials: "same-origin" });
            const data = await res.json();
            if (seq !== zipLookupSeq) return;
            if (data.status === 200 && data.results && data.results.length > 0) {
                const r = data.results[0];
                addressInput.value = (r.address1 || "") + (r.address2 || "") + (r.address3 || "");
            }
        } catch (e) {
            console.error(e);
        }
    }

    function applyDeliveryFromMaster(c) {
        if (!c) return;
        const nameEl = document.getElementById("order-create-deliv-name");
        const zipEl = document.getElementById("order-create-deliv-zip");
        const addrEl = document.getElementById("order-create-deliv-address");
        const telEl = document.getElementById("order-create-deliv-tel");
        const dn = String(c.deliveryName || "").trim();
        const nm = dn || String(c.customerName || "").trim();
        if (nameEl) nameEl.value = nm;
        if (zipEl) zipEl.value = digitsOnlyZipString(c.deliveryZip || "");
        if (addrEl) addrEl.value = String(c.deliveryAddress || "").trim();
        if (telEl) telEl.value = String(c.deliveryTel || "").trim();
        if (zipEl && addrEl && digitsOnlyZipString(zipEl.value).length === 7 && !String(addrEl.value || "").trim()) {
            lookupAddressFromZip();
        }
    }

    const debouncedZipLookup = debounce(lookupAddressFromZip, 350);

    if (zipInput) {
        zipInput.addEventListener("input", function () {
            zipInput.value = digitsOnlyZipString(zipInput.value);
            debouncedZipLookup();
        });
        zipInput.addEventListener("blur", function () {
            zipInput.value = digitsOnlyZipString(zipInput.value);
            if (digitsOnlyZipString(zipInput.value).length === 7) {
                lookupAddressFromZip();
            }
        });
    }

    async function fetchAllAdminCustomersForOrderCreate() {
        const all = [];
        let page = 1;
        let totalPages = 1;
        do {
            const res = await fetch(`/api/admin/customers?keyword=&page=${page}`, { credentials: "include" });
            if (res.status === 401) throw new Error("セッション切れです。再ログインしてください。");
            const data = await res.json();
            if (Array.isArray(data.customers)) all.push(...data.customers);
            totalPages = Math.max(1, parseInt(data.totalPages, 10) || 1);
            page++;
        } while (page <= totalPages);
        return all;
    }

    async function ensureProductsForOrderCreate() {
        if (cachedProductsForOrderCreate) return cachedProductsForOrderCreate;
        const res = await fetch("/api/admin/products", { credentials: "include" });
        if (res.status === 401) throw new Error("セッション切れです。再ログインしてください。");
        if (!res.ok) throw new Error("商品一覧の取得に失敗しました");
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("商品データの形式が不正です");
        cachedProductsForOrderCreate = data.filter((p) => p && p.productCode && p.active !== false);
        return cachedProductsForOrderCreate;
    }

    function closeAllProductSuggestionsExcept(currentWrap) {
        document.querySelectorAll(".order-create-product-wrap").forEach(function (w) {
            if (w === currentWrap) return;
            const u = w.querySelector(".order-create-product-suggestions");
            const inp = w.querySelector(".order-create-product-search");
            if (u) {
                u.classList.remove("is-open");
                u.innerHTML = "";
            }
            if (inp) inp.setAttribute("aria-expanded", "false");
        });
    }

    function createProductPicker(products) {
        const wrap = document.createElement("div");
        wrap.className = "order-create-product-wrap";

        const hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.className = "order-create-product-code";
        hidden.value = "";

        const input = document.createElement("input");
        input.type = "search";
        input.className = "order-create-product-search";
        input.setAttribute("autocomplete", "off");
        input.setAttribute("required", "required");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-expanded", "false");

        const ul = document.createElement("ul");
        ul.className = "order-create-product-suggestions";
        ul.setAttribute("role", "listbox");
        ul.setAttribute("aria-label", "商品候補");

        let selectedDisplay = "";

        function closeProductSuggestionsLocal() {
            ul.classList.remove("is-open");
            ul.innerHTML = "";
            input.setAttribute("aria-expanded", "false");
        }

        function openProductSuggestionsLocal() {
            ul.classList.add("is-open");
            input.setAttribute("aria-expanded", "true");
        }

        function clearProductSelection() {
            selectedDisplay = "";
            hidden.value = "";
        }

        function selectProduct(p) {
            if (!p || !p.productCode) return;
            const code = String(p.productCode).trim();
            selectedDisplay = "(" + code + ") " + (p.name || "");
            hidden.value = code;
            input.value = selectedDisplay;
            closeProductSuggestionsLocal();
        }

        function renderProductSuggestions() {
            ul.innerHTML = "";
            const raw = input.value.trim();
            if (raw.length === 0) {
                clearProductSelection();
                const li = document.createElement("li");
                li.className = "order-create-product-suggest-empty";
                li.textContent = "商品コードまたは商品名を入力してください";
                ul.appendChild(li);
                openProductSuggestionsLocal();
                return;
            }
            if (selectedDisplay && input.value !== selectedDisplay) {
                clearProductSelection();
            }
            const q = norm(raw);
            const hits = products.filter(function (p) {
                const id = norm(p.productCode);
                const nm = norm(p.name);
                return id.includes(q) || nm.includes(q);
            });
            hits.sort(function (a, b) {
                return String(a.productCode).localeCompare(String(b.productCode), "ja");
            });
            const slice = hits.slice(0, PRODUCT_SUGGEST_LIMIT);
            if (slice.length === 0) {
                const li = document.createElement("li");
                li.className = "order-create-product-suggest-empty";
                li.textContent = "一致する商品がありません";
                ul.appendChild(li);
            } else {
                slice.forEach(function (p) {
                    const li = document.createElement("li");
                    li.setAttribute("role", "option");
                    li.textContent = "(" + p.productCode + ") " + (p.name || "");
                    li.addEventListener("mousedown", function (e) {
                        e.preventDefault();
                        selectProduct(p);
                    });
                    ul.appendChild(li);
                });
            }
            openProductSuggestionsLocal();
        }

        const debouncedProductSuggest = debounce(renderProductSuggestions, 200);

        input.addEventListener("input", function () {
            if (selectedDisplay && input.value !== selectedDisplay) {
                clearProductSelection();
            }
            closeAllProductSuggestionsExcept(wrap);
            debouncedProductSuggest();
        });
        input.addEventListener("focus", function () {
            closeAllProductSuggestionsExcept(wrap);
            renderProductSuggestions();
        });

        wrap.appendChild(hidden);
        wrap.appendChild(input);
        wrap.appendChild(ul);
        return wrap;
    }

    function addOrderCreateLineRow(products) {
        if (!orderCreateLinesBody) return;
        const tr = document.createElement("tr");
        const tdP = document.createElement("td");
        const tdQ = document.createElement("td");
        const tdR = document.createElement("td");
        tdP.appendChild(createProductPicker(products));
        const inp = document.createElement("input");
        inp.type = "number";
        inp.min = "1";
        inp.max = "9999";
        inp.value = "1";
        inp.className = "order-create-qty";
        inp.required = true;
        inp.style.width = "4.5rem";
        inp.style.padding = "6px";
        inp.style.boxSizing = "border-box";
        tdQ.appendChild(inp);
        const btnRm = document.createElement("button");
        btnRm.type = "button";
        btnRm.className = "page-header-toolbar-btn";
        btnRm.textContent = "削除";
        btnRm.style.fontSize = "0.8rem";
        btnRm.style.padding = "4px 8px";
        btnRm.addEventListener("click", function () {
            if (orderCreateLinesBody.querySelectorAll("tr").length <= 1) {
                toastWarning("商品行は1行以上必要です");
                return;
            }
            tr.remove();
        });
        tdR.appendChild(btnRm);
        tr.appendChild(tdP);
        tr.appendChild(tdQ);
        tr.appendChild(tdR);
        orderCreateLinesBody.appendChild(tr);
    }

    function resetOrderCreateFormFields() {
        const ids = [
            "order-create-deliv-name",
            "order-create-deliv-zip",
            "order-create-deliv-address",
            "order-create-deliv-tel",
            "order-create-deliv-date",
            "order-create-note"
        ];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        const orderDateEl = document.getElementById("order-create-order-date");
        if (orderDateEl) orderDateEl.value = localTodayYmd();
        if (orderCreateLinesBody) orderCreateLinesBody.innerHTML = "";
        if (customerSearchInput) customerSearchInput.value = "";
        clearCustomerSelection();
        closeCustomerSuggestions();
    }

    async function initOrderCreatePage() {
        if (!orderCreateForm || !orderCreateLinesBody) return;
        setLoadStatus("データを読み込み中…", false);
        orderCreateForm.style.display = "none";
        allCustomersForOrder = [];
        if (customerSearchInput) {
            customerSearchInput.value = "";
            customerSearchInput.disabled = true;
        }
        clearCustomerSelection();
        closeCustomerSuggestions();
        resetOrderCreateFormFields();
        try {
            const [customers, products] = await Promise.all([
                fetchAllAdminCustomersForOrderCreate(),
                ensureProductsForOrderCreate()
            ]);
            if (products.length === 0) {
                setLoadStatus("有効な商品がありません。商品マスタを確認してください。", true);
                return;
            }
            allCustomersForOrder = customers;
            if (customerSearchInput) customerSearchInput.disabled = false;
            addOrderCreateLineRow(products);
            setLoadStatus("", false);
            orderCreateForm.style.display = "block";
        } catch (e) {
            console.error(e);
            setLoadStatus(e.message || "データの読込に失敗しました", true);
            if (customerSearchInput) {
                customerSearchInput.disabled = true;
                customerSearchInput.placeholder = "";
            }
        }
    }

    document.addEventListener("admin-ready", function () {
        initOrderCreatePage();
    });

    if (customerSearchInput) {
        customerSearchInput.addEventListener("input", function () {
            if (selectedDisplayText && customerSearchInput.value !== selectedDisplayText) {
                clearCustomerSelection();
            }
            debouncedRenderSuggestions();
        });
        customerSearchInput.addEventListener("focus", function () {
            renderCustomerSuggestions();
        });
    }

    if (btnCustomerLookup) {
        btnCustomerLookup.addEventListener("click", function () {
            openCustomerPickerModal();
        });
    }
    if (btnDelivLookup) {
        btnDelivLookup.addEventListener("click", function () {
            openDelivPickerModal();
        });
    }
    if (customerPickerKeyword) {
        customerPickerKeyword.addEventListener("input", debouncedCustomerPickerRender);
    }
    if (delivPickerKeyword) {
        delivPickerKeyword.addEventListener("input", debouncedDelivPickerRender);
    }
    document.querySelectorAll(".order-create-picker-close").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const kind = btn.getAttribute("data-picker-close");
            if (kind === "customer") closeCustomerPickerModal();
            else if (kind === "deliv") closeDelivPickerModal();
        });
    });
    if (customerPickerModal) {
        customerPickerModal.addEventListener("click", function (e) {
            if (e.target === customerPickerModal) closeCustomerPickerModal();
        });
    }
    if (delivPickerModal) {
        delivPickerModal.addEventListener("click", function (e) {
            if (e.target === delivPickerModal) closeDelivPickerModal();
        });
    }
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        closeCustomerPickerModal();
        closeDelivPickerModal();
    });

    document.addEventListener("click", function (e) {
        if (customerWrap && !customerWrap.contains(e.target) && !e.target.closest("#order-create-customer-picker-modal")) {
            closeCustomerSuggestions();
        }
        if (!e.target.closest(".order-create-product-wrap")) {
            document.querySelectorAll(".order-create-product-suggestions").forEach(function (u) {
                u.classList.remove("is-open");
                u.innerHTML = "";
            });
            document.querySelectorAll(".order-create-product-search").forEach(function (inp) {
                inp.setAttribute("aria-expanded", "false");
            });
        }
    });

    if (btnOrderCreateAddLine) {
        btnOrderCreateAddLine.addEventListener("click", function () {
            const products = cachedProductsForOrderCreate;
            if (!products || products.length === 0) {
                toastWarning("商品一覧がありません。ページを再読み込みしてください。");
                return;
            }
            addOrderCreateLineRow(products);
        });
    }

    if (orderCreateForm) {
        orderCreateForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const customerId = selectedCustomerId;
            if (!customerId) {
                toastWarning("顧客名を検索し、候補から顧客を選択してください");
                return;
            }
            const rows = orderCreateLinesBody ? orderCreateLinesBody.querySelectorAll("tr") : [];
            const cart = [];
            for (let i = 0; i < rows.length; i++) {
                const codeHidden = rows[i].querySelector(".order-create-product-code");
                const qIn = rows[i].querySelector(".order-create-qty");
                const code = codeHidden ? codeHidden.value.trim() : "";
                const qty = qIn ? parseInt(qIn.value, 10) : 0;
                if (!code) {
                    toastWarning("すべての行で商品名を検索し、候補から選択してください");
                    return;
                }
                if (!Number.isFinite(qty) || qty < 1) {
                    toastWarning("数量は1以上の整数で入力してください");
                    return;
                }
                cart.push({ code: code, quantity: qty, price: 0 });
            }
            if (cart.length === 0) {
                toastWarning("商品行を1行以上追加してください");
                return;
            }

            const dDate = document.getElementById("order-create-deliv-date");
            let dateStr = "";
            if (dDate && dDate.value) dateStr = dDate.value.replace(/-/g, "/");

            const orderDateEl = document.getElementById("order-create-order-date");
            const orderDateYmd = orderDateEl && orderDateEl.value ? orderDateEl.value.trim() : "";
            if (!orderDateYmd) {
                toastWarning("受注日を入力してください");
                return;
            }

            const deliveryInfo = {
                name: (document.getElementById("order-create-deliv-name") || {}).value || "",
                zip: (document.getElementById("order-create-deliv-zip") || {}).value || "",
                address: (document.getElementById("order-create-deliv-address") || {}).value || "",
                tel: (document.getElementById("order-create-deliv-tel") || {}).value || "",
                date: dateStr,
                note: (document.getElementById("order-create-note") || {}).value || ""
            };

            if (btnOrderCreateSubmit) btnOrderCreateSubmit.disabled = true;
            try {
                const res = await fetch("/api/admin/orders-create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ customerId, cart, deliveryInfo, orderDate: orderDateYmd })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    toastSuccess("受注を登録しました（注文ID: " + data.orderId + "）", 4000);
                    setTimeout(function () {
                        window.location.href = "admin-orders.html";
                    }, 600);
                } else {
                    let msg = data.message || "登録に失敗しました";
                    if (Array.isArray(data.errors) && data.errors.length > 0) {
                        msg += " — " + data.errors.map((x) => x.message || x.path).join(", ");
                    }
                    toastError(msg);
                }
            } catch (err) {
                console.error(err);
                toastError("通信エラーが発生しました");
            } finally {
                if (btnOrderCreateSubmit) btnOrderCreateSubmit.disabled = false;
            }
        });
    }
});
