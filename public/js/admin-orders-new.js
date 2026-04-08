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

    let cachedProductsForOrderCreate = null;
    let zipLookupSeq = 0;
    let allCustomersForOrder = [];
    let selectedCustomerId = null;
    let selectedDisplayText = "";

    const SUGGEST_LIMIT = 20;

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

    function buildProductSelectForOrderCreate(products) {
        const sel = document.createElement("select");
        sel.className = "order-create-product";
        sel.required = true;
        const o0 = document.createElement("option");
        o0.value = "";
        o0.textContent = "商品を選択";
        sel.appendChild(o0);
        const sorted = products.slice().sort((a, b) => String(a.productCode).localeCompare(String(b.productCode), "ja"));
        sorted.forEach((p) => {
            const o = document.createElement("option");
            o.value = p.productCode;
            o.textContent = "(" + p.productCode + ") " + (p.name || "");
            sel.appendChild(o);
        });
        return sel;
    }

    function addOrderCreateLineRow(products) {
        if (!orderCreateLinesBody) return;
        const tr = document.createElement("tr");
        const tdP = document.createElement("td");
        const tdQ = document.createElement("td");
        const tdR = document.createElement("td");
        tdP.appendChild(buildProductSelectForOrderCreate(products));
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
                toastWarning("明細は1行以上必要です");
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
            "order-create-client-order-no",
            "order-create-note"
        ];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
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
                customerSearchInput.placeholder = "顧客一覧を取得できませんでした";
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

    document.addEventListener("click", function (e) {
        if (customerWrap && !customerWrap.contains(e.target)) {
            closeCustomerSuggestions();
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
                const sel = rows[i].querySelector(".order-create-product");
                const qIn = rows[i].querySelector(".order-create-qty");
                const code = sel ? sel.value.trim() : "";
                const qty = qIn ? parseInt(qIn.value, 10) : 0;
                if (!code) {
                    toastWarning("すべての行で商品を選択してください");
                    return;
                }
                if (!Number.isFinite(qty) || qty < 1) {
                    toastWarning("数量は1以上の整数で入力してください");
                    return;
                }
                cart.push({ code: code, quantity: qty, price: 0 });
            }
            if (cart.length === 0) {
                toastWarning("明細を1行以上追加してください");
                return;
            }

            const dDate = document.getElementById("order-create-deliv-date");
            let dateStr = "";
            if (dDate && dDate.value) dateStr = dDate.value.replace(/-/g, "/");

            const deliveryInfo = {
                name: (document.getElementById("order-create-deliv-name") || {}).value || "",
                zip: (document.getElementById("order-create-deliv-zip") || {}).value || "",
                address: (document.getElementById("order-create-deliv-address") || {}).value || "",
                tel: (document.getElementById("order-create-deliv-tel") || {}).value || "",
                date: dateStr,
                note: (document.getElementById("order-create-note") || {}).value || "",
                clientOrderNumber: (document.getElementById("order-create-client-order-no") || {}).value || ""
            };

            if (btnOrderCreateSubmit) btnOrderCreateSubmit.disabled = true;
            try {
                const res = await fetch("/api/admin/orders-create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ customerId, cart, deliveryInfo })
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
