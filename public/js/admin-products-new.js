// public/js/admin-products-new.js — 商品登録専用ページ（新規・編集）

document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector("#np-add-product-form");
    const codeInput = document.querySelector("#np-product-code");
    const nameInput = document.querySelector("#np-product-name");
    const manufacturerInput = document.querySelector("#np-product-manufacturer");
    const categoryInput = document.querySelector("#np-product-category");
    const remarksInput = document.querySelector("#np-product-remarks");
    const priceInput = document.querySelector("#np-product-price");
    const purchasePriceInput = document.querySelector("#np-product-purchase-price");
    const stockSelect = document.querySelector("#np-product-stock");
    const activeSelect = document.querySelector("#np-product-active");
    const saveToolBtn = document.querySelector("#np-tool-save");
    const newToolBtn = document.querySelector("#np-tool-new");
    const deleteToolBtn = document.querySelector("#np-tool-delete");
    const tabLabel = document.querySelector("#np-reg-tab-label");
    const sessionListEl = document.querySelector("#np-session-list");
    const refListEl = document.querySelector("#np-reference-list");
    const refSearchInput = document.querySelector("#np-reference-search");

    const urlParams = new URLSearchParams(window.location.search);
    const editRaw = urlParams.get("edit");
    let editProductCode =
        editRaw != null && String(editRaw).trim() !== "" ? decodeURIComponent(String(editRaw).trim()) : null;

    let allProducts = [];
    const sessionAdded = [];
    let isEditMode = false;

    const TITLE_NEW = "商品登録 - WEB受注システム";
    const TITLE_EDIT = "商品登録（編集） - WEB受注システム";

    function setTabLabel(text) {
        if (tabLabel) tabLabel.textContent = text;
    }

    function resetFormDefaults() {
        if (!form) return;
        form.reset();
        if (stockSelect) stockSelect.selectedIndex = 0;
        if (activeSelect) activeSelect.value = "true";
        if (codeInput) {
            codeInput.readOnly = false;
            codeInput.style.backgroundColor = "";
            codeInput.focus();
        }
    }

    function exitEditMode() {
        isEditMode = false;
        editProductCode = null;
        if (deleteToolBtn) deleteToolBtn.style.display = "none";
        setTabLabel("商品登録");
        document.title = TITLE_NEW;
        resetFormDefaults();
        try {
            window.history.replaceState({}, "", "admin-products-new.html");
        } catch (e) {
            /* ignore */
        }
    }

    function applyEditProduct(product) {
        if (!codeInput || !nameInput) return;
        codeInput.value = product.productCode || "";
        nameInput.value = product.name || "";
        manufacturerInput.value = product.manufacturer || "";
        categoryInput.value = product.category || "";
        if (remarksInput) remarksInput.value = product.remarks != null ? String(product.remarks) : "";
        priceInput.value = product.basePrice != null ? product.basePrice : 0;
        if (purchasePriceInput) {
            purchasePriceInput.value = product.purchaseUnitPrice != null ? product.purchaseUnitPrice : 0;
        }
        if (stockSelect) stockSelect.value = product.stockStatus || stockSelect.options[0].value;
        if (activeSelect) {
            const isActive = Object.prototype.hasOwnProperty.call(product, "active") ? product.active : true;
            activeSelect.value = isActive ? "true" : "false";
        }
        codeInput.readOnly = true;
        codeInput.style.backgroundColor = "#e9ecef";
        isEditMode = true;
        if (deleteToolBtn) deleteToolBtn.style.display = "inline-flex";
        setTabLabel("商品登録（編集）");
        document.title = TITLE_EDIT;
        if (nameInput) nameInput.focus();
    }

    function tryApplyEditModeAfterFetch() {
        if (!editProductCode || isEditMode) return;
        const want = String(editProductCode);
        const p = allProducts.find((x) => String(x.productCode) === want);
        if (p) {
            applyEditProduct(p);
        } else {
            toastError("商品が見つかりません: " + want);
            editProductCode = null;
            try {
                window.history.replaceState({}, "", "admin-products-new.html");
            } catch (e) {
                /* ignore */
            }
        }
    }

    function getFormData() {
        return {
            productCode: codeInput.value.trim(),
            name: nameInput.value.trim(),
            manufacturer: manufacturerInput.value.trim(),
            category: categoryInput.value.trim(),
            remarks: remarksInput ? remarksInput.value.trim() : "",
            basePrice: parseInt(priceInput.value, 10) || 0,
            purchaseUnitPrice: purchasePriceInput ? parseInt(purchasePriceInput.value, 10) || 0 : 0,
            stockStatus: stockSelect.value,
            active: activeSelect.value === "true"
        };
    }

    function renderSessionList() {
        if (!sessionListEl) return;
        if (sessionAdded.length === 0) {
            sessionListEl.innerHTML =
                "<p style=\"margin:0; color:#888; font-size:0.88rem;\">まだありません。「保存」で新規登録するとここに表示されます。</p>";
            return;
        }
        const rows = sessionAdded
            .map(
                (p) =>
                    `<tr><td>${escapeHtml(p.productCode)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(
                        p.manufacturer || ""
                    )}</td><td>${escapeHtml(p.category || "")}</td><td>¥${(p.basePrice || 0).toLocaleString()}</td></tr>`
            )
            .join("");
        sessionListEl.innerHTML = `
            <table class="np-mini-table">
                <thead><tr><th>商品コード</th><th>商品名</th><th>メーカー</th><th>規格</th><th>標準価格</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderReferenceList(products) {
        if (!refListEl) return;
        if (products.length === 0) {
            refListEl.innerHTML = "<p style=\"margin:0; color:#888;\">商品がありません</p>";
            return;
        }
        const limit = 150;
        const slice = products.slice(0, limit);
        refListEl.innerHTML = slice
            .map(
                (p) =>
                    `<div class="np-ref-row"><span class="np-ref-code">${escapeHtml(p.productCode)}</span> <strong>${escapeHtml(
                        p.name
                    )}</strong> <span class="np-ref-meta">${escapeHtml(p.manufacturer || "")} ${escapeHtml(
                        p.category || ""
                    )}</span></div>`
            )
            .join("");
        if (products.length > limit) {
            refListEl.innerHTML += `<p style="margin:8px 0 0; color:#666; font-size:0.85rem;">先頭 ${limit} 件を表示しています。検索で絞り込んでください。</p>`;
        }
    }

    async function fetchProductList() {
        if (!refListEl) return;
        refListEl.innerHTML = "<p style=\"margin:0; color:#888;\">読み込み中…</p>";
        try {
            const response = await adminApiFetch("/api/admin/products");
            if (response.status === 401) {
                refListEl.innerHTML = "<p style=\"margin:0; color:#c62828;\">認証が必要です。</p>";
                return;
            }
            if (!response.ok) throw new Error("fetch failed");
            allProducts = await response.json();
            applyReferenceFilter();
            tryApplyEditModeAfterFetch();
        } catch (e) {
            console.error(e);
            refListEl.innerHTML = "<p style=\"margin:0; color:#c62828;\">一覧の取得に失敗しました。</p>";
        }
    }

    function applyReferenceFilter() {
        const term =
            refSearchInput && refSearchInput.value ? refSearchInput.value.normalize("NFKC").toLowerCase() : "";
        if (!term) {
            renderReferenceList(allProducts);
            return;
        }
        const filtered = allProducts.filter((p) => {
            const hay = [p.productCode, p.name, p.manufacturer, p.category]
                .map((v) => (v || "").toString().normalize("NFKC").toLowerCase())
                .join(" ");
            return hay.includes(term);
        });
        renderReferenceList(filtered);
    }

    if (refSearchInput) {
        refSearchInput.addEventListener("input", applyReferenceFilter);
    }

    if (newToolBtn && form) {
        newToolBtn.addEventListener("click", function () {
            if (isEditMode) {
                exitEditMode();
            } else {
                resetFormDefaults();
            }
        });
    }

    if (deleteToolBtn) {
        deleteToolBtn.addEventListener("click", async function () {
            const code = codeInput.value.trim();
            const name = nameInput.value.trim();
            if (!code) return;
            if (
                !confirm(
                    `【削除確認】\n商品コード: ${code}\n商品名: ${name}\n\n本当に削除しますか？\n(※運用では「非公開」も検討ください)`
                )
            ) {
                return;
            }
            deleteToolBtn.disabled = true;
            try {
                const response = await adminApiFetch("/api/delete-product", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productCode: code })
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("削除しました");
                    exitEditMode();
                    await fetchProductList();
                } else {
                    toastError("削除失敗: " + (data.message || ""));
                }
            } catch (err) {
                console.error(err);
                toastError("通信エラーが発生しました");
            } finally {
                deleteToolBtn.disabled = false;
            }
        });
    }

    if (saveToolBtn && form) {
        saveToolBtn.addEventListener("click", function () {
            if (typeof form.requestSubmit === "function") {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
        });
    }

    if (form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const payload = getFormData();
            if (!payload.productCode || !payload.name) {
                toastWarning("商品コードと商品名は必須です");
                return;
            }
            if (saveToolBtn) {
                saveToolBtn.disabled = true;
                saveToolBtn.textContent = "保存中…";
            }
            try {
                const endpoint = isEditMode ? "/api/update-product" : "/api/add-product";
                const response = await adminApiFetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess(isEditMode ? "更新しました" : "保存しました");
                    if (!isEditMode) {
                        sessionAdded.unshift({ ...payload });
                        renderSessionList();
                        resetFormDefaults();
                    }
                    await fetchProductList();
                } else {
                    toastError("エラー: " + (data.message || "保存に失敗しました"));
                }
            } catch (err) {
                console.error(err);
                toastError("通信エラーが発生しました");
            } finally {
                if (saveToolBtn) {
                    saveToolBtn.disabled = false;
                    saveToolBtn.textContent = "保存";
                }
            }
        });
    }

    document.addEventListener("admin-ready", function () {
        renderSessionList();
        fetchProductList();
    });
});
