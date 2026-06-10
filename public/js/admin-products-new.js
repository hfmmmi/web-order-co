// public/js/admin-products-new.js — 商品登録専用ページ（新規・編集）

document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector("#np-add-product-form");
    const codeInput = document.querySelector("#np-product-code");
    const nameInput = document.querySelector("#np-product-name");
    const manufacturerInput = document.querySelector("#np-product-manufacturer");
    const unitInput = document.querySelector("#np-product-unit");
    const categoryInput = document.querySelector("#np-product-category");
    const remarksInput = document.querySelector("#np-product-remarks");
    const priceInput = document.querySelector("#np-product-price");
    const purchasePriceInput = document.querySelector("#np-product-purchase-price");
    const stockSelect = document.querySelector("#np-product-stock");
    const activeSelect = document.querySelector("#np-product-active");
    const stockTotalInput = document.querySelector("#np-stock-total-qty");
    const stockReservedInput = document.querySelector("#np-stock-reserved-qty");
    const stockPublishSelect = document.querySelector("#np-stock-publish");
    const stockHiddenMessageInput = document.querySelector("#np-stock-hidden-message");
    const stockManualLockCheckbox = document.querySelector("#np-stock-manual-lock");
    const saveToolBtn = document.querySelector("#np-tool-save");
    const newToolBtn = document.querySelector("#np-tool-new");
    const copyToolBtn = document.querySelector("#np-tool-copy");
    const deleteToolBtn = document.querySelector("#np-tool-delete");
    const tabLabel = document.querySelector("#np-reg-tab-label");
    const auditFooterEl = document.getElementById("np-audit-footer");

    const urlParams = new URLSearchParams(window.location.search);
    const editRaw = urlParams.get("edit");
    let editProductCode =
        editRaw != null && String(editRaw).trim() !== "" ? decodeURIComponent(String(editRaw).trim()) : null;

    let allProducts = [];
    let isEditMode = false;

    const TITLE_NEW = "商品登録 - 発注システム";
    const TITLE_EDIT = "商品登録（編集） - 発注システム";

    function setTabLabel(text) {
        if (tabLabel) tabLabel.textContent = text;
    }

    function updateProductAuditFooter(product) {
        if (!auditFooterEl || !window.AuditRecordFooter) return;
        if (!isEditMode || !product) {
            auditFooterEl.hidden = true;
            auditFooterEl.textContent = "";
            return;
        }
        AuditRecordFooter.setAuditRecordFooterElement(auditFooterEl, product, {
            fallbackDateFields: []
        });
    }

    function resetStockFields() {
        if (stockTotalInput) stockTotalInput.value = "0";
        if (stockReservedInput) stockReservedInput.value = "0";
        if (stockPublishSelect) stockPublishSelect.value = "true";
        if (stockHiddenMessageInput) stockHiddenMessageInput.value = "";
        if (stockManualLockCheckbox) stockManualLockCheckbox.checked = false;
    }

    function resetFormDefaults() {
        if (!form) return;
        form.reset();
        if (stockSelect) stockSelect.selectedIndex = 0;
        if (activeSelect) activeSelect.value = "true";
        resetStockFields();
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
        updateProductAuditFooter(null);
        try {
            window.history.replaceState({}, "", "admin-products-new.html");
        } catch (e) {
            /* ignore */
        }
    }

    function applyFormDataExceptCode(data) {
        if (!data) return;
        if (nameInput) nameInput.value = data.name || "";
        if (manufacturerInput) manufacturerInput.value = data.manufacturer || "";
        if (unitInput) unitInput.value = data.unit || "";
        if (categoryInput) categoryInput.value = data.category || "";
        if (remarksInput) remarksInput.value = data.remarks != null ? String(data.remarks) : "";
        if (priceInput) priceInput.value = data.basePrice != null ? data.basePrice : 0;
        if (purchasePriceInput) {
            purchasePriceInput.value = data.purchaseUnitPrice != null ? data.purchaseUnitPrice : 0;
        }
        if (stockSelect) stockSelect.value = data.stockStatus || stockSelect.options[0].value;
        if (activeSelect) {
            const isActive = Object.prototype.hasOwnProperty.call(data, "active") ? data.active : true;
            activeSelect.value = isActive ? "true" : "false";
        }
    }

    function copyFormForNewProduct() {
        const data = getFormData();
        if (!data.name && !data.manufacturer && !data.unit && !data.category && !data.remarks && !data.basePrice && !data.purchaseUnitPrice) {
            toastWarning("コピーする内容がありません");
            return;
        }

        if (isEditMode) {
            isEditMode = false;
            editProductCode = null;
            if (deleteToolBtn) deleteToolBtn.style.display = "none";
            setTabLabel("商品登録");
            document.title = TITLE_NEW;
            try {
                window.history.replaceState({}, "", "admin-products-new.html");
            } catch (e) {
                /* ignore */
            }
        }

        applyFormDataExceptCode(data);
        if (codeInput) {
            codeInput.value = "";
            codeInput.readOnly = false;
            codeInput.style.backgroundColor = "";
            codeInput.focus();
        }
        toastSuccess("商品コード以外をコピーしました。新しい商品コードを入力してください", 3500);
    }

    function applyStockData(stock) {
        if (!stock) {
            resetStockFields();
            return;
        }
        if (stockTotalInput) stockTotalInput.value = stock.totalQty != null ? stock.totalQty : 0;
        if (stockReservedInput) stockReservedInput.value = stock.reservedQty != null ? stock.reservedQty : 0;
        if (stockPublishSelect) stockPublishSelect.value = stock.publish === false ? "false" : "true";
        if (stockHiddenMessageInput) stockHiddenMessageInput.value = stock.hiddenMessage || "";
        if (stockManualLockCheckbox) stockManualLockCheckbox.checked = !!stock.manualLock;
    }

    async function loadStockForProductCode(productCode) {
        if (!productCode) {
            resetStockFields();
            return;
        }
        try {
            const response = await adminApiFetch(
                "/api/admin/stocks/" + encodeURIComponent(productCode)
            );
            if (response.status === 404) {
                resetStockFields();
                return;
            }
            if (!response.ok) throw new Error("在庫データの取得に失敗しました");
            const data = await response.json();
            if (data.success && data.stock) {
                applyStockData(data.stock);
            } else {
                resetStockFields();
            }
        } catch (e) {
            console.error(e);
            resetStockFields();
        }
    }

    function getStockFormData(productCode) {
        return {
            productCode: productCode,
            totalQty: parseInt(stockTotalInput ? stockTotalInput.value : "0", 10) || 0,
            reservedQty: parseInt(stockReservedInput ? stockReservedInput.value : "0", 10) || 0,
            publish: stockPublishSelect ? stockPublishSelect.value === "true" : true,
            hiddenMessage: stockHiddenMessageInput ? stockHiddenMessageInput.value.trim() : "",
            manualLock: stockManualLockCheckbox ? stockManualLockCheckbox.checked : false,
            warehouses: []
        };
    }

    async function saveStockForProduct(productCode) {
        const payload = getStockFormData(productCode);
        const response = await adminApiFetch("/api/admin/stocks/manual-adjust", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || "在庫の保存に失敗しました");
        }
    }

    async function applyEditProduct(product) {
        if (!codeInput || !nameInput) return;
        codeInput.value = product.productCode || "";
        applyFormDataExceptCode({
            name: product.name || "",
            manufacturer: product.manufacturer || "",
            unit: product.unit || "",
            category: product.category || "",
            remarks: product.remarks != null ? String(product.remarks) : "",
            basePrice: product.basePrice != null ? product.basePrice : 0,
            purchaseUnitPrice: product.purchaseUnitPrice != null ? product.purchaseUnitPrice : 0,
            stockStatus: product.stockStatus || (stockSelect ? stockSelect.options[0].value : ""),
            active: Object.prototype.hasOwnProperty.call(product, "active") ? product.active : true
        });
        codeInput.readOnly = true;
        codeInput.style.backgroundColor = "#f3f4f6";
        isEditMode = true;
        if (deleteToolBtn) deleteToolBtn.style.display = "inline-flex";
        setTabLabel("商品登録（編集）");
        document.title = TITLE_EDIT;
        await loadStockForProductCode(product.productCode);
        updateProductAuditFooter(product);
        if (nameInput) nameInput.focus();
    }

    async function tryApplyEditModeAfterFetch() {
        if (!editProductCode || isEditMode) return;
        const want = String(editProductCode);
        const p = allProducts.find((x) => String(x.productCode) === want);
        if (p) {
            await applyEditProduct(p);
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
            unit: unitInput ? unitInput.value.trim() : "",
            category: categoryInput.value.trim(),
            remarks: remarksInput ? remarksInput.value.trim() : "",
            basePrice: parseInt(priceInput.value, 10) || 0,
            purchaseUnitPrice: purchasePriceInput ? parseInt(purchasePriceInput.value, 10) || 0 : 0,
            stockStatus: stockSelect.value,
            active: activeSelect.value === "true"
        };
    }

    async function fetchProductList() {
        try {
            const response = await adminApiFetch("/api/admin/products");
            if (response.status === 401) return;
            if (!response.ok) throw new Error("fetch failed");
            allProducts = await response.json();
            await tryApplyEditModeAfterFetch();
        } catch (e) {
            console.error(e);
            if (editProductCode) {
                toastError("商品一覧の取得に失敗しました");
            }
        }
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

    if (copyToolBtn) {
        copyToolBtn.addEventListener("click", copyFormForNewProduct);
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
                    try {
                        await saveStockForProduct(payload.productCode);
                    } catch (stockErr) {
                        console.error(stockErr);
                        toastWarning(
                            "商品は保存しましたが、在庫の保存に失敗しました: " + (stockErr.message || "")
                        );
                        await fetchProductList();
                        return;
                    }
                    toastSuccess(isEditMode ? "更新しました" : "保存しました");
                    if (!isEditMode) {
                        resetFormDefaults();
                    } else {
                        await loadStockForProductCode(payload.productCode);
                        if (data.audit && auditFooterEl && window.AuditRecordFooter) {
                            AuditRecordFooter.setAuditRecordFooterElement(
                                auditFooterEl,
                                data.audit,
                                { fallbackDateFields: [] }
                            );
                        }
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
        fetchProductList();
    });
});
