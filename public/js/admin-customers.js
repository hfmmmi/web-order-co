document.addEventListener("DOMContentLoaded", function () {
    console.log("👥 Customer & Price Manager Loaded");

    const custListArea = document.querySelector("#cust-list-area");
    const custResultInfo = document.querySelector("#cust-result-info");
    const custTableBody = document.querySelector("#cust-table-body");
    const searchInput = document.querySelector("#cust-search-keyword");
    const custPaginationMount = document.querySelector("#cust-pagination-mount");
    const addCustBtn = document.querySelector("#btn-add-customer"); 

    const customerCsvFileInput = document.querySelector("#customer-csv-file-input");
    const customerCsvExcelBtn = document.querySelector("#btn-customer-csv-excel");
    const customerCsvDownloadBtn = document.querySelector("#btn-customer-csv-download");
    const btnCustomersMore = document.getElementById("btn-customers-more");
    const customersMoreMenu = document.getElementById("customers-more-menu");
    const custSelectAll = document.querySelector(".cust-select-all");

    function setCustomersMoreMenuOpen(open) {
        if (!customersMoreMenu) return;
        if (open) {
            customersMoreMenu.classList.add("is-open");
            customersMoreMenu.setAttribute("aria-hidden", "false");
            if (btnCustomersMore) btnCustomersMore.setAttribute("aria-expanded", "true");
        } else {
            customersMoreMenu.classList.remove("is-open");
            customersMoreMenu.setAttribute("aria-hidden", "true");
            if (btnCustomersMore) btnCustomersMore.setAttribute("aria-expanded", "false");
        }
    }

    if (btnCustomersMore && customersMoreMenu) {
        btnCustomersMore.addEventListener("click", function (e) {
            e.stopPropagation();
            setCustomersMoreMenuOpen(!customersMoreMenu.classList.contains("is-open"));
        });
    }
    document.addEventListener("click", function () {
        setCustomersMoreMenuOpen(false);
    });

    function syncCustSelectAllState() {
        if (!custSelectAll || !custTableBody) return;
        const boxes = custTableBody.querySelectorAll(".cust-row-check");
        if (!boxes.length) {
            custSelectAll.checked = false;
            custSelectAll.indeterminate = false;
            return;
        }
        const checked = custTableBody.querySelectorAll(".cust-row-check:checked").length;
        custSelectAll.checked = checked === boxes.length;
        custSelectAll.indeterminate = checked > 0 && checked < boxes.length;
    }

    if (custSelectAll) {
        custSelectAll.addEventListener("change", function () {
            if (!custTableBody) return;
            const on = custSelectAll.checked;
            custTableBody.querySelectorAll(".cust-row-check").forEach(function (cb) {
                cb.checked = on;
            });
            custSelectAll.indeterminate = false;
        });
    }

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
    const cmPassRequiredStar = document.getElementById("cm-pass-required-star");
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

    let currentPage = 1;
    let totalPages = 1;
    /** @type {Map<string, object>} 一覧表示中の顧客（選択DL用） */
    const customersByIdOnPage = new Map();

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
    });

    // -------------------------------------------------------------
    // 顧客一覧ロジック (招待機能付き)
    // -------------------------------------------------------------
    function renderCustomerResultInfo(totalCount, currentPageNum, pageSize, rowCount, totalPagesNum) {
        if (!custResultInfo) return;
        const tc = Math.max(0, parseInt(String(totalCount), 10) || 0);
        const ps = Math.max(1, parseInt(String(pageSize), 10) || 25);
        const page = Math.max(1, parseInt(String(currentPageNum), 10) || 1);
        const tp = Math.max(1, parseInt(String(totalPagesNum), 10) || 1);
        if (tc === 0) {
            custResultInfo.innerHTML = "該当：<strong>0</strong> 件";
            return;
        }
        if (tp > 1 && rowCount > 0) {
            const fromN = (page - 1) * ps + 1;
            const toN = fromN + rowCount - 1;
            custResultInfo.innerHTML =
                `該当：<strong>${tc}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示`;
        } else {
            custResultInfo.innerHTML = `該当：<strong>${tc}</strong> 件`;
        }
    }

    async function loadCustomers(page = 1) {
        if (!custTableBody) return;
        const keyword = searchInput ? searchInput.value : "";
        if (custResultInfo) custResultInfo.innerHTML = "";
        if (custSelectAll) {
            custSelectAll.checked = false;
            custSelectAll.indeterminate = false;
        }
        customersByIdOnPage.clear();
        custTableBody.innerHTML = "<tr><td colspan='6'>読み込み中...</td></tr>";

        try {
            // ★修正: サーバー側の定義に合わせて URL を /customers に変更 (-list を削除)
            const res = await adminApiFetch(`/api/admin/customers?keyword=${encodeURIComponent(keyword)}&page=${page}`);

            if (res.status === 401) {
                custTableBody.innerHTML = "<tr><td colspan='6'>認証待ち...</td></tr>";
                if (custResultInfo) custResultInfo.innerHTML = "";
                return;
            }

            // 404等のエラーハンドリングを追加
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            const data = await res.json();

            custTableBody.innerHTML = "";
            customersByIdOnPage.clear();
            currentPage = Number(data.currentPage) || 1;
            totalPages = Math.max(1, Number(data.totalPages) || 1);
            const pageSize = Math.max(1, parseInt(String(data.pageSize), 10) || 25);
            const totalCount = Math.max(0, parseInt(String(data.totalCount), 10) || 0);
            renderCustomerResultInfo(totalCount, currentPage, pageSize, data.customers.length, totalPages);
            renderCustomerPagination();

            if (data.customers.length === 0) {
                custTableBody.innerHTML = "<tr><td colspan='6'>該当なし</td></tr>";
                if (custSelectAll) {
                    custSelectAll.checked = false;
                    custSelectAll.indeterminate = false;
                }
                return;
            }

            data.customers.forEach(c => {
                customersByIdOnPage.set(String(c.customerId), c);
                const tr = document.createElement("tr");
                const custIdEsc = attrEscape(c.customerId);
                tr.innerHTML = `
                    <td class="cust-col-check"><input type="checkbox" class="cust-row-check" data-id="${custIdEsc}" aria-label="顧客 ${custIdEsc} を選択"></td>
                    <td><button type="button" class="cust-id-edit-link" data-id="${custIdEsc}">${custIdEsc}</button></td>
                    <td>${c.customerName}</td>
                    <td class="cust-col-email">${(c.email || "").trim() || "-"}</td>
                    <td class="cust-col-rank">${c.priceRank || "-"}</td>
                    <td class="cust-col-actions">
                        <button class="btn-proxy-login" data-id="${c.customerId}" data-name="${c.customerName}"
                        style="padding:4px 8px; font-size:0.8125rem; background:transparent; color:#111827; border:1px solid #d1d5db; border-radius:6px; cursor:pointer; margin-right:4px;" title="この顧客としてユーザー画面を表示">
                        代理ログイン
                        </button>
                        <button class="btn-invite" data-id="${c.customerId}" data-name="${c.customerName}" data-email="${(c.email || "").replace(/"/g, "&quot;")}"
                        style="padding:4px 8px; font-size:0.8125rem; background:transparent; color:#111827; border:1px solid #d1d5db; border-radius:6px; cursor:pointer; margin-right:4px;" title="招待メール送信またはURL発行">
                        招待
                        </button>
                        <button class="btn-god-mode" data-id="${c.customerId}" data-name="${c.customerName}" 
                        style="padding:4px 8px; font-size:0.8125rem; background:transparent; color:#111827; border:1px solid #d1d5db; border-radius:6px; cursor:pointer;">
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

                tr.querySelector(".cust-id-edit-link").addEventListener("click", function () {
                    const row = customersByIdOnPage.get(this.dataset.id);
                    if (!row) return;
                    openModal("edit", {
                        id: row.customerId,
                        name: row.customerName,
                        rank: row.priceRank || "",
                        email: row.email || "",
                        deliveryName: row.deliveryName || "",
                        deliveryZip: row.deliveryZip || "",
                        deliveryAddress: row.deliveryAddress || "",
                        deliveryTel: row.deliveryTel || ""
                    });
                });

                // 「特価設定へ」→ システム設定の価格タブ
                tr.querySelector(".btn-god-mode").addEventListener("click", function () {
                    const id = this.dataset.id;
                    const q = id ? "?tab=prices&customerId=" + encodeURIComponent(id) : "?tab=prices";
                    window.location.href = "admin-settings.html" + q;
                });
                tr.querySelector(".cust-row-check").addEventListener("change", syncCustSelectAllState);
                custTableBody.appendChild(tr);
            });
            syncCustSelectAllState();

        } catch (err) {
            console.error(err);
            if (custResultInfo) custResultInfo.innerHTML = "";
            custTableBody.innerHTML = "<tr><td colspan='6' style='color:red'>読み込みエラー</td></tr>";
            if (custSelectAll) {
                custSelectAll.checked = false;
                custSelectAll.indeterminate = false;
            }
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

    let custSearchDebounceTimer = null;
    function scheduleCustomerSearch() {
        clearTimeout(custSearchDebounceTimer);
        custSearchDebounceTimer = setTimeout(function () {
            loadCustomers(1);
        }, 300);
    }

    if (searchInput) {
        searchInput.addEventListener("input", scheduleCustomerSearch);
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                clearTimeout(custSearchDebounceTimer);
                loadCustomers(1);
            }
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
            cmTitle.textContent = "新規追加";
            cmId.readOnly = false;
            cmId.style.backgroundColor = "white";
            if (cmPassRequiredStar) cmPassRequiredStar.style.display = "inline";
            if (cmPassNote) {
                cmPassNote.textContent = "";
            }

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
            if (cmPassRequiredStar) cmPassRequiredStar.style.display = "none";
            if (cmPassNote) {
                cmPassNote.textContent = "(空欄なら変更なし)";
            }

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
                toastWarning("新規登録時はパスワードを入力してください");
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
                } else {
                    toastError("失敗: " + d.message);
                }
            } catch (err) { toastError("通信エラー"); }
        };
    }

    function escapeCsvCell(val) {
        const s = String(val == null ? "" : val);
        if (/[",\r\n]/.test(s)) {
            return "\"" + s.replace(/"/g, "\"\"") + "\"";
        }
        return s;
    }

    function getSelectedCustomersForDownload() {
        if (!custTableBody) return [];
        const selected = [];
        custTableBody.querySelectorAll(".cust-row-check:checked").forEach(function (cb) {
            const row = customersByIdOnPage.get(cb.dataset.id);
            if (row) selected.push(row);
        });
        return selected;
    }

    async function downloadCustomerMasterCsv() {
        if (!customerCsvDownloadBtn) return;
        const all = getSelectedCustomersForDownload();
        if (!all.length) {
            if (typeof toastError === "function") {
                toastError("ダウンロードする顧客をチェックで選択してください");
            }
            return;
        }
        customerCsvDownloadBtn.disabled = true;
        try {
            const header = ["顧客ID", "パスワード", "顧客名", "価格ランク", "メール", "納品先名", "納品先郵便番号", "納品先住所", "納品先電話"];
            const lines = [header.map(escapeCsvCell).join(",")];
            all.forEach(function (c) {
                lines.push([
                    escapeCsvCell(c.customerId),
                    escapeCsvCell(""),
                    escapeCsvCell(c.customerName),
                    escapeCsvCell(c.priceRank || ""),
                    escapeCsvCell(c.email || ""),
                    escapeCsvCell(c.deliveryName || ""),
                    escapeCsvCell(c.deliveryZip || ""),
                    escapeCsvCell(c.deliveryAddress || ""),
                    escapeCsvCell(c.deliveryTel || "")
                ].join(","));
            });

            const body = lines.join("\r\n") + "\r\n";
            const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            a.href = url;
            a.download = "customers_" + stamp + ".csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            if (typeof toastSuccess === "function") {
                toastSuccess("選択した顧客 " + all.length + " 件をダウンロードしました", 3000);
            }
        } catch (e) {
            console.error(e);
            if (typeof toastError === "function") toastError("ダウンロードに失敗しました");
        } finally {
            customerCsvDownloadBtn.disabled = false;
        }
    }

    if (customerCsvExcelBtn && customerCsvFileInput) {
        customerCsvExcelBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            setCustomersMoreMenuOpen(false);
            customerCsvFileInput.click();
        });
        customerCsvFileInput.addEventListener("change", function () {
            if (!this.files || !this.files[0]) return;
            uploadCsv(this, "/api/upload-customer-data");
        });
    }
    if (customerCsvDownloadBtn) {
        customerCsvDownloadBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            setCustomersMoreMenuOpen(false);
            downloadCustomerMasterCsv();
        });
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