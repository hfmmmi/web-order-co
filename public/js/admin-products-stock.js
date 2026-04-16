// public/js/admin-products-stock.js
// 管理画面：商品ページ内の在庫表示・連携（admin-products.html 用）
document.addEventListener("DOMContentLoaded", function () {
    const stockDisplayToggle = document.querySelector("#stock-display-toggle");
    const stockHiddenMessageInput = document.querySelector("#stock-hidden-message");
    const stockStocklessLabelInput = document.querySelector("#stock-stockless-label");
    const stockAllowZeroCheckbox = document.querySelector("#stock-allow-zero");
    const stockHighlightInput = document.querySelector("#stock-highlight-minutes");
    const stockSaveSettingsBtn = document.querySelector("#stock-save-settings");
    const stockSettingsStatus = document.querySelector("#stock-settings-status");
    const addWarehousePresetBtn = document.querySelector("#add-warehouse-preset");
    const warehousePresetList = document.querySelector("#warehouse-preset-list");

    const stockManualForm = document.querySelector("#stock-manual-form");
    const manualCodeInput = document.querySelector("#manual-stock-code");
    const manualTotalInput = document.querySelector("#manual-total-qty");
    const manualReservedInput = document.querySelector("#manual-reserved-qty");
    const manualPublishSelect = document.querySelector("#manual-publish");
    const manualHiddenInput = document.querySelector("#manual-hidden-message");
    const manualLockCheckbox = document.querySelector("#manual-lock-flag");
    const loadStockBtn = document.querySelector("#load-stock-btn");
    const addWarehouseRowBtn = document.querySelector("#add-warehouse-row");
    const warehouseList = document.querySelector("#warehouse-list");
    const warehouseListHeader = document.querySelector("#warehouse-list-header");
    const manualStockStatus = document.querySelector("#manual-stock-status");

    document.addEventListener("admin-ready", function () {
        loadStockSettings();
    });

    function applyStockDisplayToForm(display = {}) {
        if (!stockDisplayToggle) return;
        stockDisplayToggle.checked = !!display.enabled;
        if (stockHiddenMessageInput) stockHiddenMessageInput.value = display.hiddenMessage || "";
        if (stockStocklessLabelInput) stockStocklessLabelInput.value = display.stocklessLabel || "";
        if (stockAllowZeroCheckbox) stockAllowZeroCheckbox.checked = display.allowOrderingWhenZero !== false;
        if (stockHighlightInput) stockHighlightInput.value = display.highlightThresholdMinutes || 180;
        renderWarehousePresetList(display.warehousePresets || []);
    }

    function renderWarehousePresetList(presets) {
        if (!warehousePresetList) return;
        warehousePresetList.innerHTML = "";
        (presets || []).forEach((item, index) => appendWarehousePresetRow(item, index));
        if (warehousePresetList.children.length === 0) {
            const empty = document.createElement("div");
            empty.className = "warehouse-preset-empty";
            empty.style.cssText = "color:#888; font-size:0.9rem; padding:6px 0;";
            empty.textContent = "倉庫を追加するとテンプレに反映されます";
            warehousePresetList.appendChild(empty);
        }
    }

    function appendWarehousePresetRow(data = {}) {
        if (!warehousePresetList) return;
        const emptyHint = warehousePresetList.querySelector(".warehouse-preset-empty");
        if (emptyHint) emptyHint.remove();
        const row = document.createElement("div");
        row.className = "warehouse-preset-row";
        row.style.cssText = "display:flex; gap:10px; align-items:center; margin-bottom:8px; flex-wrap:wrap;";
        row.innerHTML = `
            <label class="preset-label" style="flex:0 0 auto; width:70px; font-size:0.9rem; color:#555;">コード</label>
            <input type="text" class="form-control preset-code" placeholder="例: 本社" value="${(data.code || "").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" style="width:100px; min-width:80px;">
            <label class="preset-label" style="flex:0 0 auto; width:70px; font-size:0.9rem; color:#555;">倉庫名</label>
            <input type="text" class="form-control preset-name" placeholder="例: 本社倉庫" value="${(data.name || "").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" style="flex:1; min-width:180px;">
            <button type="button" class="warehouse-preset-remove" style="background:transparent; color:#111827; border:none; padding:4px 10px; cursor:pointer;">削除</button>
        `;
        row.querySelector(".warehouse-preset-remove").addEventListener("click", () => {
            row.remove();
            if (warehousePresetList.children.length === 0) {
                const empty = document.createElement("div");
                empty.className = "warehouse-preset-empty";
                empty.style.cssText = "color:#888; font-size:0.9rem; padding:6px 0;";
                empty.textContent = "倉庫を追加するとテンプレに反映されます";
                warehousePresetList.appendChild(empty);
            }
        });
        warehousePresetList.appendChild(row);
    }

    function collectWarehousePresetsFromForm() {
        if (!warehousePresetList) return [];
        const rows = warehousePresetList.querySelectorAll(".warehouse-preset-row");
        return Array.from(rows)
            .map((row) => {
                const code =
                    (row.querySelector(".preset-code") && row.querySelector(".preset-code").value.trim()) || "";
                const name =
                    (row.querySelector(".preset-name") && row.querySelector(".preset-name").value.trim()) || "";
                return { code, name };
            })
            .filter((p) => p.code || p.name);
    }

    async function loadStockSettings() {
        if (!stockDisplayToggle) return;
        try {
            const response = await adminApiFetch("/api/admin/stocks/settings");
            if (!response.ok) throw new Error("設定取得に失敗しました");
            const data = await response.json();
            if (!data.success) throw new Error(data.message || "設定取得に失敗しました");
            applyStockDisplayToForm(data.display || {});
            if (stockSettingsStatus) stockSettingsStatus.textContent = "";
        } catch (error) {
            console.error(error);
            if (stockSettingsStatus) stockSettingsStatus.textContent = "設定の取得に失敗しました";
        }
    }

    if (addWarehousePresetBtn) {
        addWarehousePresetBtn.addEventListener("click", () => appendWarehousePresetRow({ code: "", name: "" }));
    }

    if (stockSaveSettingsBtn) {
        stockSaveSettingsBtn.addEventListener("click", async () => {
            const payload = {
                display: {
                    enabled: stockDisplayToggle ? stockDisplayToggle.checked : false,
                    hiddenMessage: stockHiddenMessageInput ? stockHiddenMessageInput.value.trim() : "",
                    stocklessLabel: stockStocklessLabelInput ? stockStocklessLabelInput.value.trim() : "",
                    allowOrderingWhenZero: stockAllowZeroCheckbox ? stockAllowZeroCheckbox.checked : true,
                    highlightThresholdMinutes:
                        parseInt(stockHighlightInput ? stockHighlightInput.value : "180", 10) || 180,
                    warehousePresets: collectWarehousePresetsFromForm()
                }
            };

            stockSaveSettingsBtn.disabled = true;
            if (stockSettingsStatus) stockSettingsStatus.textContent = "保存中...";
            try {
                const response = await adminApiFetch("/api/admin/stocks/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("在庫設定を保存しました");
                    if (stockSettingsStatus) stockSettingsStatus.textContent = "保存しました";
                } else {
                    throw new Error(data.message || "保存に失敗しました");
                }
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫設定の保存に失敗しました");
                if (stockSettingsStatus) stockSettingsStatus.textContent = "保存に失敗しました";
            } finally {
                stockSaveSettingsBtn.disabled = false;
            }
        });
    }

    function resetWarehouseList() {
        if (!warehouseList) return;
        warehouseList.innerHTML = `<div style="color:#888; font-size:0.9rem;">倉庫行を追加してください</div>`;
        if (warehouseListHeader) warehouseListHeader.style.display = "none";
    }

    function addWarehouseRow(data = {}) {
        if (!warehouseList) return;
        if (warehouseList.children.length === 1 && warehouseList.children[0].textContent.includes("倉庫行")) {
            warehouseList.innerHTML = "";
            if (warehouseListHeader) warehouseListHeader.style.display = "flex";
        }

        const row = document.createElement("div");
        row.className = "warehouse-row";
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.marginBottom = "8px";
        row.style.alignItems = "center";
        const codeVal = (data.code || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        const nameVal = (data.name || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        const qtyVal = Number.isFinite(data.qty) ? data.qty : 0;
        row.innerHTML = `
            <input type="text" class="form-control warehouse-code" placeholder="例: 本社" title="倉庫コード" value="${codeVal}" style="width:100px; min-width:100px;">
            <input type="text" class="form-control warehouse-name" placeholder="例: 本社倉庫" title="倉庫名" value="${nameVal}" style="flex:1; min-width:140px;">
            <input type="number" class="form-control warehouse-qty" placeholder="0" title="数量" value="${qtyVal}" style="width:100px; min-width:80px;">
            <button type="button" class="btn-danger warehouse-remove" title="この行を削除" style="background:#dc3545; color:white; border:none; padding:4px 10px;">×</button>
        `;

        row.querySelector(".warehouse-remove").addEventListener("click", () => {
            row.remove();
            if (warehouseList.querySelectorAll(".warehouse-row").length === 0) {
                resetWarehouseList();
            }
        });

        warehouseList.appendChild(row);
    }

    if (addWarehouseRowBtn) {
        addWarehouseRowBtn.addEventListener("click", () => addWarehouseRow());
    }

    function collectWarehousesFromForm() {
        if (!warehouseList) return [];
        const rows = [...warehouseList.querySelectorAll(".warehouse-row")];
        return rows
            .map((row) => ({
                code: row.querySelector(".warehouse-code").value.trim() || "default",
                name: row.querySelector(".warehouse-name").value.trim() || "標準倉庫",
                qty: parseInt(row.querySelector(".warehouse-qty").value || "0", 10) || 0
            }))
            .filter((item) => item.qty !== 0 || item.code);
    }

    async function fetchStockByCode(code) {
        const response = await adminApiFetch(`/api/admin/stocks/${encodeURIComponent(code)}`);
        if (response.status === 404) {
            throw new Error("在庫データが見つかりません");
        }
        if (!response.ok) {
            throw new Error("在庫データの取得に失敗しました");
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || "在庫データの取得に失敗しました");
        }
        return data.stock;
    }

    if (loadStockBtn) {
        loadStockBtn.addEventListener("click", async () => {
            const code = manualCodeInput ? manualCodeInput.value.trim() : "";
            if (!code) {
                toastWarning("商品コードを入力してください");
                return;
            }
            loadStockBtn.disabled = true;
            if (manualStockStatus) manualStockStatus.textContent = "読み込み中...";
            try {
                const stock = await fetchStockByCode(code);
                if (manualTotalInput) manualTotalInput.value = stock.totalQty || 0;
                if (manualReservedInput) manualReservedInput.value = stock.reservedQty || 0;
                if (manualPublishSelect) manualPublishSelect.value = stock.publish === false ? "false" : "true";
                if (manualHiddenInput) manualHiddenInput.value = stock.hiddenMessage || "";
                if (manualLockCheckbox) manualLockCheckbox.checked = !!stock.manualLock;
                resetWarehouseList();
                if (Array.isArray(stock.warehouses) && stock.warehouses.length > 0) {
                    stock.warehouses.forEach(addWarehouseRow);
                }
                if (manualStockStatus) manualStockStatus.textContent = "在庫データを読み込みました";
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫データの取得に失敗しました");
                if (manualStockStatus) manualStockStatus.textContent = error.message || "取得に失敗しました";
            } finally {
                loadStockBtn.disabled = false;
            }
        });
    }

    if (stockManualForm) {
        stockManualForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!manualCodeInput || !manualCodeInput.value.trim()) {
                toastWarning("商品コードを入力してください");
                return;
            }

            const payload = {
                productCode: manualCodeInput.value.trim(),
                totalQty: parseInt(manualTotalInput ? manualTotalInput.value : "0", 10) || 0,
                reservedQty: parseInt(manualReservedInput ? manualReservedInput.value : "0", 10) || 0,
                publish: manualPublishSelect ? manualPublishSelect.value === "true" : true,
                hiddenMessage: manualHiddenInput ? manualHiddenInput.value.trim() : "",
                manualLock: manualLockCheckbox ? manualLockCheckbox.checked : false,
                warehouses: collectWarehousesFromForm()
            };

            if (manualStockStatus) manualStockStatus.textContent = "保存中...";
            try {
                const response = await adminApiFetch("/api/admin/stocks/manual-adjust", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("在庫を保存しました");
                    manualStockStatus.textContent = "保存しました";
                } else {
                    throw new Error(data.message || "保存に失敗しました");
                }
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫の保存に失敗しました");
                if (manualStockStatus) manualStockStatus.textContent = "保存に失敗しました";
            }
        });
    }

    resetWarehouseList();
});
