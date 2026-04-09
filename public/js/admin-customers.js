document.addEventListener("DOMContentLoaded", function () {
    console.log("👥 Customer & Price Manager Loaded");

    const custListArea = document.querySelector("#cust-list-area");
    const custTableBody = document.querySelector("#cust-table-body");
    const searchInput = document.querySelector("#cust-search-keyword");
    const searchBtn = document.querySelector("#cust-search-btn");
    const custPaginationMount = document.querySelector("#cust-pagination-mount");
    const addCustBtn = document.querySelector("#btn-add-customer"); 

    const priceCsvInput = document.querySelector("#price-csv-input");
    const priceCsvBtn = document.querySelector("#price-csv-btn");
    const customerCsvFileInput = document.querySelector("#customer-csv-file-input");
    const customerCsvExcelBtn = document.querySelector("#btn-customer-csv-excel");

    // Modal Elements (New)
    const custModal = document.getElementById("customer-modal");
    const cmForm = document.getElementById("cm-form");
    const cmMode = document.getElementById("cm-mode");
    const cmTitle = document.getElementById("cm-modal-title");
    const cmId = document.getElementById("cm-id");
    const cmName = document.getElementById("cm-name");
    const cmPass = document.getElementById("cm-password");
    const cmEmail = document.getElementById("cm-email");
    const cmRank = document.getElementById("cm-rank");
    const cmPassNote = document.getElementById("cm-pass-note");
    const cmDeliveryName = document.getElementById("cm-delivery-name");
    const cmDeliveryZip = document.getElementById("cm-delivery-zip");
    const cmDeliveryAddress = document.getElementById("cm-delivery-address");
    const cmDeliveryTel = document.getElementById("cm-delivery-tel");

    function attrEscape(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");
    }

    // ★招待モーダル用要素（URL表示・メール送信）
    const inviteModal = document.getElementById("invite-modal");
    const inviteUrlInput = document.getElementById("invite-url-input");
    const btnCopyInvite = document.getElementById("btn-copy-invite");

    // 代理ログイン申請モーダル（顧客の許可待ち）
    const proxyRequestModal = document.getElementById("proxy-request-modal");
    const proxyRequestMsg = document.getElementById("proxy-request-msg");
    const proxyRequestWait = document.getElementById("proxy-request-wait");
    const proxyExecuteBtn = document.getElementById("proxy-execute-btn");
    const proxyRequestCancelBtn = document.getElementById("proxy-request-cancel-btn");
    const proxyRequestModalClose = document.getElementById("proxy-request-modal-close");
    let proxyRequestPollTimer = null;
    let proxyRequestCustomerId = null;

    function closeProxyRequestModal() {
        if (proxyRequestPollTimer) {
            clearInterval(proxyRequestPollTimer);
            proxyRequestPollTimer = null;
        }
        proxyRequestCustomerId = null;
        if (proxyRequestModal) proxyRequestModal.style.display = "none";
        if (proxyExecuteBtn) proxyExecuteBtn.disabled = true;
        if (proxyRequestWait) proxyRequestWait.style.display = "none";
    }

    function openProxyRequestModal(customerId, customerName) {
        proxyRequestCustomerId = customerId;
        if (proxyRequestMsg) proxyRequestMsg.textContent = "顧客「" + (customerName || customerId) + "」に依頼を送信しました。顧客が許可したら「代理ログインを実行」をクリックしてください。";
        if (proxyRequestWait) { proxyRequestWait.style.display = "block"; proxyRequestWait.textContent = "顧客の操作をお待ちください…"; }
        if (proxyExecuteBtn) proxyExecuteBtn.disabled = true;
        if (proxyRequestModal) proxyRequestModal.style.display = "flex";
        if (proxyRequestPollTimer) clearInterval(proxyRequestPollTimer);
        proxyRequestPollTimer = setInterval(async function () {
            if (!proxyRequestCustomerId) return;
            try {
                const r = await adminApiFetch("/api/admin/proxy-request-status?customerId=" + encodeURIComponent(proxyRequestCustomerId));
                const d = await r.json();
                if (d.status === "approved") {
                    if (proxyRequestPollTimer) { clearInterval(proxyRequestPollTimer); proxyRequestPollTimer = null; }
                    if (proxyRequestWait) { proxyRequestWait.style.display = "block"; proxyRequestWait.textContent = "許可されました。"; }
                    if (proxyRequestMsg) proxyRequestMsg.textContent = "顧客が許可しました。下のボタンで代理ログインを実行できます。";
                    if (proxyExecuteBtn) proxyExecuteBtn.disabled = false;
                    return;
                }
                if (d.status === "none") {
                    closeProxyRequestModal();
                    return;
                }
            } catch (e) {}
        }, 2500);
    }

    if (proxyExecuteBtn) {
        proxyExecuteBtn.addEventListener("click", async function () {
            if (!proxyRequestCustomerId) return;
            this.disabled = true;
            try {
                const res = await adminApiFetch("/api/admin/proxy-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ customerId: proxyRequestCustomerId })
                });
                const d = await res.json();
                if (d.success && d.redirectUrl) {
                    window.location.href = d.redirectUrl;
                } else {
                    toastError(d.message || "代理ログインに失敗しました");
                    this.disabled = false;
                }
            } catch (err) {
                toastError("通信エラーが発生しました");
                this.disabled = false;
            }
        });
    }
    if (proxyRequestCancelBtn) proxyRequestCancelBtn.addEventListener("click", closeProxyRequestModal);
    if (proxyRequestModalClose) proxyRequestModalClose.addEventListener("click", closeProxyRequestModal);

    // God Hand Elements
    const godCustId = document.querySelector("#price-customer-id");
    const godProdCode = document.querySelector("#price-product-code");
    const godSuggestCust = document.querySelector("#suggest-customer");
    const godSuggestProd = document.querySelector("#suggest-product");
    const priceEditArea = document.querySelector("#price-edit-area");
    const currentPriceDisplay = document.querySelector("#current-price-display");
    const newSpecialPrice = document.querySelector("#new-special-price");
    const savePriceBtn = document.querySelector("#btn-save-price");

    // Special Price List Elements
    const specialPriceTableBody = document.querySelector("#special-price-table-body");
    const btnRefreshPrices = document.querySelector("#btn-refresh-prices");

    let currentPage = 1;
    let totalPages = 1;

    function buildCustomerPageNumberItems(total, current) {
        if (total <= 1) return [];
        const nums = new Set([1, total, current]);
        for (let d = -2; d <= 2; d++) nums.add(current + d);
        const sorted = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
        const out = [];
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push(null);
            out.push(sorted[i]);
        }
        return out;
    }

    function renderCustomerPagination() {
        if (!custPaginationMount) return;
        custPaginationMount.innerHTML = "";
        const nav = document.createElement("nav");
        nav.className = "orders-pagination";
        nav.setAttribute("aria-label", "ページ送り");

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "orders-pagination-btn orders-pagination-prev";
        prevBtn.textContent = "前へ";
        prevBtn.disabled = currentPage <= 1;
        prevBtn.addEventListener("click", function () {
            if (currentPage <= 1) return;
            loadCustomers(currentPage - 1);
        });

        const pagesWrap = document.createElement("div");
        pagesWrap.className = "orders-pagination-pages";

        buildCustomerPageNumberItems(totalPages, currentPage).forEach(function (entry) {
            if (entry === null) {
                const ell = document.createElement("span");
                ell.className = "orders-pagination-ellipsis";
                ell.textContent = "…";
                ell.setAttribute("aria-hidden", "true");
                pagesWrap.appendChild(ell);
                return;
            }
            const p = entry;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "orders-pagination-btn orders-pagination-page";
            btn.textContent = String(p);
            if (p === currentPage) {
                btn.classList.add("is-current");
                btn.setAttribute("aria-current", "page");
            }
            btn.addEventListener("click", function () {
                loadCustomers(p);
            });
            pagesWrap.appendChild(btn);
        });

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "orders-pagination-btn orders-pagination-next";
        nextBtn.textContent = "次へ";
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.addEventListener("click", function () {
            if (currentPage >= totalPages) return;
            loadCustomers(currentPage + 1);
        });

        nav.appendChild(prevBtn);
        nav.appendChild(pagesWrap);
        nav.appendChild(nextBtn);
        custPaginationMount.appendChild(nav);
    }

    document.addEventListener("admin-ready", function () {
        console.log("🚀 Customer Manager: Auth Signal Received.");
        loadCustomers();
        loadSpecialPrices(); 
    });

    // -------------------------------------------------------------
    // 顧客一覧ロジック (招待機能付き)
    // -------------------------------------------------------------
    async function loadCustomers(page = 1) {
        if (!custTableBody) return;
        const keyword = searchInput ? searchInput.value : "";
        custTableBody.innerHTML = "<tr><td colspan='5'>読み込み中...</td></tr>";

        try {
            // ★修正: サーバー側の定義に合わせて URL を /customers に変更 (-list を削除)
            const res = await adminApiFetch(`/api/admin/customers?keyword=${encodeURIComponent(keyword)}&page=${page}`);

            if (res.status === 401) {
                custTableBody.innerHTML = "<tr><td colspan='4'>認証待ち...</td></tr>";
                return;
            }

            // 404等のエラーハンドリングを追加
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            const data = await res.json();

            custTableBody.innerHTML = "";
            currentPage = Number(data.currentPage) || 1;
            totalPages = Math.max(1, Number(data.totalPages) || 1);
            renderCustomerPagination();

            if (data.customers.length === 0) {
                custTableBody.innerHTML = "<tr><td colspan='5'>該当なし</td></tr>";
                return;
            }

            data.customers.forEach(c => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="padding:8px;">${c.customerId}</td>
                    <td style="padding:8px;">${c.customerName}</td>
                    <td style="padding:8px; font-size:0.85rem;">${(c.email || "").trim() || "-"}</td>
                    <td style="padding:8px; text-align:center;">${c.priceRank || "-"}</td>
                    <td style="padding:8px; text-align:center;">
                        <button class="btn-proxy-login" data-id="${c.customerId}" data-name="${c.customerName}"
                        style="padding:3px 8px; background:#6f42c1; color:white; border:none; border-radius:3px; cursor:pointer; margin-right:5px;" title="この顧客としてユーザー画面を表示">
                        代理ログイン
                        </button>
                        <button class="btn-invite" data-id="${c.customerId}" data-name="${c.customerName}" data-email="${(c.email || "").replace(/"/g, "&quot;")}"
                        style="padding:3px 8px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer; margin-right:5px;" title="招待メール送信またはURL発行">
                        招待
                        </button>
                        <button class="btn-edit-cust" data-id="${c.customerId}" data-name="${c.customerName}" data-rank="${c.priceRank || ""}" data-email="${(c.email || "").replace(/"/g, "&quot;")}"
                        data-delivery-name="${attrEscape(c.deliveryName)}" data-delivery-zip="${attrEscape(c.deliveryZip)}" data-delivery-address="${attrEscape(c.deliveryAddress)}" data-delivery-tel="${attrEscape(c.deliveryTel)}"
                        style="padding:3px 8px; background:#ffc107; color:#212529; border:none; border-radius:3px; cursor:pointer; margin-right:5px;">
                        編集
                        </button>
                        <button class="btn-god-mode" data-id="${c.customerId}" data-name="${c.customerName}" 
                        style="padding:3px 8px; background:#17a2b8; color:white; border:none; border-radius:3px; cursor:pointer;">
                        特価設定
                        </button>
                    </td>
                `;

                // ---------------------------------------------------------
                // 招待: メールアドレスあり→直接送信 / なし→URLモーダル表示
                // ---------------------------------------------------------
                tr.querySelector(".btn-invite").addEventListener("click", async function () {
                    const id = this.dataset.id;
                    const name = this.dataset.name;
                    const email = (this.dataset.email || "").trim();
                    const hasEmail = !!email;

                    const msg = hasEmail
                        ? `${name} 様 (${email}) 宛に招待メールを送信しますか？\n\n※現在のパスワードはリセットされ、設定用リンクがメールで送信されます。`
                        : `${name} 様の招待リンクを発行しますか？\n\n※メールアドレスが未登録のため、URLをコピーして手動で送信してください。\n現在のパスワードはリセットされます。`;
                    if (!confirm(msg)) return;

                    const originalText = this.textContent;
                    this.textContent = hasEmail ? "送信中..." : "発行中...";
                    this.disabled = true;

                    try {
                        if (hasEmail) {
                            const res = await adminApiFetch("/api/admin/send-invite-email", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ customerId: id })
                            });
                            const d = await res.json();
                            if (d.success) {
                                toastSuccess(d.message);
                            } else {
                                toastError(d.message || "送信に失敗しました");
                            }
                        } else {
                            const res = await adminApiFetch("/api/admin/invite-reset", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ customerId: id })
                            });
                            const d = await res.json();
                            if (d.success) {
                                const inviteUrl = `${window.location.origin}/setup.html?id=${encodeURIComponent(id)}&key=${encodeURIComponent(d.tempPassword)}`;
                                inviteUrlInput.value = inviteUrl;
                                inviteModal.style.display = "flex";
                                inviteUrlInput.select();
                            } else {
                                toastError("エラー: " + d.message);
                            }
                        }
                    } catch (err) {
                        console.error(err);
                        toastError("通信エラーが発生しました");
                    } finally {
                        this.textContent = originalText;
                        this.disabled = false;
                    }
                });

                // 代理ログイン: 申請→顧客が許可→実行の流れ（誤操作防止のため確認ポップアップあり）
                tr.querySelector(".btn-proxy-login").addEventListener("click", async function () {
                    const id = this.dataset.id;
                    const name = this.dataset.name;
                    if (!confirm("本当に代理ログイン申請を送信しますか？\n\n顧客の画面に「許可」または「却下」の依頼が表示されます。\n顧客が許可したあと、こちらで「代理ログインを実行」を押すとユーザー画面に入ります。")) return;
                    const btn = this;
                    const originalText = btn.textContent;
                    btn.textContent = "申請中...";
                    btn.disabled = true;
                    try {
                        const res = await adminApiFetch("/api/admin/proxy-request", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ customerId: id })
                        });
                        const d = await res.json();
                        if (d.success) {
                            toastSuccess(d.message);
                            openProxyRequestModal(id, name);
                        } else {
                            toastError(d.message || "申請に失敗しました");
                        }
                    } catch (err) {
                        console.error(err);
                        toastError("通信エラーが発生しました");
                    } finally {
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }
                });

                // 既存: 「編集」ボタン
                tr.querySelector(".btn-edit-cust").addEventListener("click", function () {
                    openModal("edit", {
                        id: this.dataset.id,
                        name: this.dataset.name,
                        rank: this.dataset.rank,
                        email: this.dataset.email || "",
                        deliveryName: this.dataset.deliveryName || "",
                        deliveryZip: this.dataset.deliveryZip || "",
                        deliveryAddress: this.dataset.deliveryAddress || "",
                        deliveryTel: this.dataset.deliveryTel || ""
                    });
                });

                // 既存: 「特価設定へ」ボタン
                tr.querySelector(".btn-god-mode").addEventListener("click", function () {
                    const id = this.dataset.id;
                    document.querySelector(".menu-item[onclick*='prices']").click();
                    if (godCustId) {
                        godCustId.value = id;
                        godCustId.focus();
                    }
                });
                custTableBody.appendChild(tr);
            });

        } catch (err) {
            console.error(err);
            custTableBody.innerHTML = "<tr><td colspan='5' style='color:red'>読み込みエラー</td></tr>";
        }
    }

    // -------------------------------------------------------------
    // ★New: 招待モーダル内コピーボタン
    // -------------------------------------------------------------
    if (btnCopyInvite) {
        btnCopyInvite.addEventListener("click", async () => {
            const url = inviteUrlInput.value;
            if (!url) return;

            try {
                await navigator.clipboard.writeText(url);
                toastSuccess("クリップボードにコピーしました！");
            } catch (err) {
                toastError("コピーに失敗しました。手動で選択してコピーしてください。");
            }
        });
    }

    if (searchBtn) searchBtn.addEventListener("click", () => loadCustomers(1));
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") loadCustomers(1);
        });
    }

    // -------------------------------------------------------------
    // 顧客 新規/編集モーダル操作
    // -------------------------------------------------------------
    if (addCustBtn) {
        addCustBtn.addEventListener("click", () => {
            openModal("add");
        });
    }

    function openModal(mode, data = {}) {
        cmMode.value = mode;
        if (mode === "add") {
            cmTitle.textContent = "新規顧客追加";
            cmId.readOnly = false;
            cmId.style.backgroundColor = "white";
            cmPassNote.textContent = "(必須)";

            cmId.value = "";
            cmName.value = "";
            cmPass.value = "";
            if (cmEmail) cmEmail.value = "";
            cmRank.value = "";
            if (cmDeliveryName) cmDeliveryName.value = "";
            if (cmDeliveryZip) cmDeliveryZip.value = "";
            if (cmDeliveryAddress) cmDeliveryAddress.value = "";
            if (cmDeliveryTel) cmDeliveryTel.value = "";
        } else {
            cmTitle.textContent = "顧客情報編集";
            cmId.readOnly = true;
            cmId.style.backgroundColor = "#e9ecef";
            cmPassNote.textContent = "(空欄なら変更なし)";

            cmId.value = data.id;
            cmName.value = data.name;
            cmRank.value = data.rank;
            if (cmEmail) cmEmail.value = data.email || "";
            cmPass.value = "";
            if (cmDeliveryName) cmDeliveryName.value = data.deliveryName || "";
            if (cmDeliveryZip) cmDeliveryZip.value = data.deliveryZip || "";
            if (cmDeliveryAddress) cmDeliveryAddress.value = data.deliveryAddress || "";
            if (cmDeliveryTel) cmDeliveryTel.value = data.deliveryTel || "";
        }
        custModal.style.display = "flex";
    }

    if (cmForm) {
        cmForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const mode = cmMode.value;
            const endpoint = mode === "add" ? "/api/add-customer" : "/api/update-customer";

            const payload = {
                customerId: cmId.value,
                customerName: cmName.value,
                password: cmPass.value,
                priceRank: cmRank.value,
                email: cmEmail ? cmEmail.value.trim() : "",
                deliveryName: cmDeliveryName ? cmDeliveryName.value.trim() : "",
                deliveryZip: cmDeliveryZip ? cmDeliveryZip.value.trim() : "",
                deliveryAddress: cmDeliveryAddress ? cmDeliveryAddress.value.trim() : "",
                deliveryTel: cmDeliveryTel ? cmDeliveryTel.value.trim() : ""
            };

            // バリデーション
            if (mode === "add" && !payload.password) {
                toastWarning("新規登録時はパスワードが必須です");
                return;
            }

            try {
                const res = await adminApiFetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const d = await res.json();

                if (d.success) {
                    toastSuccess(d.message);
                    custModal.style.display = "none";
                    loadCustomers(currentPage); // リロード
                } else {
                    toastError("エラー: " + d.message);
                }
            } catch (err) {
                toastError("通信エラーが発生しました");
            }
        });
    }

    // -------------------------------------------------------------
    // CSV一括登録 (顧客 & 価格)
    // -------------------------------------------------------------
    async function uploadCsv(fileInput, apiEndpoint) {
        const file = fileInput.files[0];
        if (!file) { toastWarning("ファイルを選択してください"); return; }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function (e) {
            const base64 = e.target.result.split(",")[1];
            try {
                const res = await adminApiFetch(apiEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fileData: base64 })
                });
                const d = await res.json();
                if (d.success) {
                    toastSuccess(d.message, 4000);
                    fileInput.value = "";
                    if (apiEndpoint.includes("customer")) loadCustomers(1);
                    if (apiEndpoint.includes("price")) loadSpecialPrices(); // 特価も更新
                } else {
                    toastError("失敗: " + d.message);
                }
            } catch (err) { toastError("通信エラー"); }
        };
    }

    if (customerCsvExcelBtn && customerCsvFileInput) {
        customerCsvExcelBtn.addEventListener("click", function () {
            customerCsvFileInput.click();
        });
        customerCsvFileInput.addEventListener("change", function () {
            if (!this.files || !this.files[0]) return;
            uploadCsv(this, "/api/upload-customer-data");
        });
    }
    if (priceCsvBtn) {
        priceCsvBtn.addEventListener("click", () => uploadCsv(priceCsvInput, "/api/upload-price-data"));
    }

    function fillGodSuggestList(container, items, formatLabel, onSelect) {
        if (!container) return;
        container.innerHTML = "";
        if (!items || items.length === 0) {
            container.style.display = "none";
            return;
        }
        container.style.display = "block";
        items.forEach((item) => {
            const div = document.createElement("div");
            div.textContent = formatLabel(item);
            div.style.padding = "5px";
            div.style.cursor = "pointer";
            div.onmouseover = () => { div.style.background = "#eee"; };
            div.onmouseout = () => { div.style.background = "white"; };
            div.onclick = () => {
                onSelect(item);
                container.style.display = "none";
            };
            container.appendChild(div);
        });
    }

    // -------------------------------------------------------------
    // God Hand Mode (個別価格設定)
    // -------------------------------------------------------------
    if (godCustId) {
        godCustId.addEventListener("input", async function () {
            const val = this.value;
            if (val.length < 2) { godSuggestCust.style.display = "none"; return; }
            try {
                const res = await adminApiFetch(`/api/admin/customers?keyword=${encodeURIComponent(val)}&page=1`);
                if (res.status === 401) return;

                const d = await res.json();
                const list = Array.isArray(d.customers) ? d.customers : [];
                fillGodSuggestList(
                    godSuggestCust,
                    list,
                    (c) => `${c.customerId} : ${c.customerName}`,
                    (c) => {
                        godCustId.value = c.customerId;
                        checkCurrentPrice();
                    }
                );
            } catch (e) {
                godSuggestCust.style.display = "none";
            }
        });
    }

    if (godProdCode) {
        godProdCode.addEventListener("input", async function () {
            const val = this.value;
            if (val.length < 2) { godSuggestProd.style.display = "none"; return; }
            try {
                const res = await adminApiFetch("/api/admin/products");
                if (res.status === 401) return;

                const products = await res.json();
                const filtered = products.filter(p => p.productCode.includes(val) || p.name.includes(val)).slice(0, 10);

                fillGodSuggestList(
                    godSuggestProd,
                    filtered,
                    (p) => `${p.productCode} : ${p.name}`,
                    (p) => {
                        godProdCode.value = p.productCode;
                        checkCurrentPrice();
                    }
                );
            } catch (e) {
                godSuggestProd.style.display = "none";
            }
        });
    }

    async function checkCurrentPrice() {
        const cId = godCustId.value;
        const pCode = godProdCode.value;
        if (!cId || !pCode) return;

        priceEditArea.style.display = "flex";
        currentPriceDisplay.textContent = "確認中...";

        try {
            const res = await adminApiFetch(`/api/get-price?customerId=${cId}&productCode=${pCode}`);
            const d = await res.json();
            if (d.success) {
                const prefix = d.isSpecial ? "特価" : "定価";
                currentPriceDisplay.textContent = `${prefix}: ${d.currentPrice}円`;
                currentPriceDisplay.style.color = d.isSpecial ? "red" : "black";
            } else {
                currentPriceDisplay.textContent = "---";
            }
        } catch (e) { console.error(e); }
    }

    if (savePriceBtn) {
        savePriceBtn.addEventListener("click", async () => {
            const cId = godCustId.value;
            const pCode = godProdCode.value;
            const price = newSpecialPrice.value;
            if (!cId || !pCode || !price) { toastWarning("全項目を入力してください"); return; }

            try {
                const res = await adminApiFetch("/api/update-single-price", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        targetCustomerId: cId,
                        targetProductCode: pCode,
                        newPrice: price
                    })
                });
                const d = await res.json();
                if (d.success) {
                    toastSuccess("特価を保存しました");
                    checkCurrentPrice();
                    loadSpecialPrices(); // 特価リストも更新
                    newSpecialPrice.value = "";
                } else {
                    toastError("失敗: " + d.message);
                }
            } catch (e) { toastError("通信エラー"); }
        });
    }

    document.addEventListener("click", (e) => {
        if (godSuggestCust && e.target !== godCustId) godSuggestCust.style.display = "none";
        if (godSuggestProd && e.target !== godProdCode) godSuggestProd.style.display = "none";
    });

    // =============================================================
    // 14. 特価リスト表示・削除機能
    // =============================================================
    async function loadSpecialPrices() {
        if (!specialPriceTableBody) return;

        specialPriceTableBody.innerHTML = "<tr><td colspan='4' style='text-align:center'>データ読み込み中...</td></tr>";

        try {
            const res = await adminApiFetch("/api/admin/special-prices-list");
            if (res.status === 401) return;

            const list = await res.json();

            specialPriceTableBody.innerHTML = "";
            if (list.length === 0) {
                specialPriceTableBody.innerHTML = "<tr><td colspan='4' style='text-align:center'>現在、個別特価の設定はありません</td></tr>";
                return;
            }

            list.forEach(item => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="padding:8px;">${item.customerName} <br><small style="color:#666">(${item.customerId})</small></td>
                    <td style="padding:8px;">${item.productName} <br><small style="color:#666">(${item.productCode})</small></td>
                    <td style="padding:8px; font-weight:bold; color:#d9534f; text-align:right;">${parseInt(item.specialPrice).toLocaleString()} 円</td>
                    <td style="padding:8px; text-align:center;">
                        <button class="btn-delete-price" data-cust="${item.customerId}" data-prod="${item.productCode}" 
                        style="padding:5px 10px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">
                        解除
                        </button>
                    </td>
                `;

                // 解除ボタンのイベント設定
                tr.querySelector(".btn-delete-price").addEventListener("click", async function () {
                    const cId = this.dataset.cust;
                    const pCode = this.dataset.prod;
                    const cName = item.customerName;

                    if (!confirm(`${cName} 様の特価設定を解除しますか？\n（解除後はランク価格または定価が適用されます）`)) {
                        return;
                    }
                    await deleteSpecialPrice(cId, pCode);
                });

                specialPriceTableBody.appendChild(tr);
            });

        } catch (error) {
            console.error("特価リスト取得エラー", error);
            specialPriceTableBody.innerHTML = "<tr><td colspan='4' style='color:red; text-align:center'>読み込みエラーが発生しました</td></tr>";
        }
    }

    // 特価を削除する関数
    async function deleteSpecialPrice(customerId, productCode) {
        try {
            const res = await adminApiFetch("/api/delete-special-price", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customerId, productCode })
            });
            const d = await res.json();

            if (d.success) {
                toastSuccess("特価設定を解除しました");
                loadSpecialPrices(); // 再読み込み
                // もしGodHandModeの表示が出ていればクリア
                if (currentPriceDisplay) currentPriceDisplay.textContent = "---";
            } else {
                toastError("削除失敗: " + d.message);
            }
        } catch (e) {
            toastError("通信エラーが発生しました");
        }
    }

    // 更新ボタン
    if (btnRefreshPrices) {
        btnRefreshPrices.addEventListener("click", loadSpecialPrices);
    }

    // ランク一覧をAPIから取得してdatalistを更新（表示名付き）
    const rankListEl = document.getElementById("rank-list");
    if (rankListEl) {
        adminApiFetch("/api/admin/rank-list", { credentials: "include" })
            .then(r => r.ok ? r.json() : [])
            .then(list => {
                rankListEl.innerHTML = list.map(item =>
                    `<option value="${item.id || ""}">${item.name === item.id ? item.id : item.id + " - " + item.name}</option>`
                ).join("");
            })
            .catch(() => {});
    }
});