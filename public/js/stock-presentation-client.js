// 顧客向け商品一覧と同じ在庫表示ロジック（クライアント用・stockPresentation.js と整合）
(function (global) {
    function normalizeProductCode(code) {
        return String(code || "")
            .trim()
            .toUpperCase();
    }

    function buildStockUiConfig(display) {
        const d = display || {};
        return {
            enabled: !!d.enabled,
            hiddenMessage: d.hiddenMessage || "在庫情報は非公開です",
            stocklessLabel: d.stocklessLabel || "仕入先直送",
            showStocklessLabel: d.showStocklessLabel !== false,
            allowOrderingWhenZero: d.allowOrderingWhenZero !== false,
            highlightThresholdMinutes: Number(d.highlightThresholdMinutes) || 180,
            warehousePresets: Array.isArray(d.warehousePresets) ? d.warehousePresets : []
        };
    }

    function buildStockInfo(productCode, stockMap, stockUi) {
        const ui = stockUi || buildStockUiConfig({});
        if (!productCode) {
            return {
                visible: false,
                publish: false,
                message: ui.hiddenMessage
            };
        }

        const stock = stockMap.get(normalizeProductCode(productCode));

        if (!ui.enabled) {
            return {
                visible: false,
                publish: false,
                message: stock ? stock.hiddenMessage || ui.hiddenMessage : ui.hiddenMessage,
                manualLock: stock ? !!stock.manualLock : false,
                lastSyncedAt: stock ? stock.lastSyncedAt : null
            };
        }

        if (!stock || stock.publish === false) {
            return {
                visible: false,
                publish: false,
                message: (stock && stock.hiddenMessage) || ui.hiddenMessage,
                manualLock: stock ? !!stock.manualLock : false,
                lastSyncedAt: stock ? stock.lastSyncedAt : null,
                source: stock ? stock.source : null
            };
        }

        const totalQty = Number(stock.totalQty) || 0;
        const reservedQty = Number(stock.reservedQty) || 0;
        const availableQty = Math.max(totalQty - reservedQty, 0);
        const lastSyncedAt = stock.lastSyncedAt || null;
        let isStale = false;
        if (lastSyncedAt) {
            const synced = new Date(lastSyncedAt).getTime();
            if (!isNaN(synced)) {
                const diffMinutes = (Date.now() - synced) / 60000;
                isStale = diffMinutes > ui.highlightThresholdMinutes;
            }
        }

        const presets = ui.warehousePresets || [];
        const warehouses = (Array.isArray(stock.warehouses) ? stock.warehouses : []).map(function (w) {
            const preset = presets.find(function (p) {
                return String(p.code || "").trim() === String(w.code || "").trim();
            });
            const displayName =
                preset && (preset.name || "").trim() ? String(preset.name).trim() : w.name || w.code || "";
            return { code: w.code, name: displayName, qty: w.qty };
        });

        return {
            visible: true,
            publish: true,
            totalQty,
            reservedQty,
            availableQty,
            warehouses,
            lastSyncedAt,
            isStale,
            manualLock: !!stock.manualLock,
            source: stock.source || "manual"
        };
    }

    function formatProductsStockHiddenText(message) {
        const t = String(message || "").trim();
        if (!t || t === "在庫情報は非公開です") return "非公開";
        return t;
    }

    function getStockSortValue(stockInfo, stockUi) {
        const ui = stockUi || buildStockUiConfig({});
        if (!ui.enabled) return -2000000000;
        if (!stockInfo || !stockInfo.visible) return -1000000000;
        return Number(stockInfo.availableQty) || 0;
    }

    function buildAdminProductStockCell(stockInfo, stockUi, escHtml) {
        const esc = escHtml || function (s) {
            return String(s ?? "");
        };
        const ui = stockUi || buildStockUiConfig({});

        if (!ui.enabled) {
            const label = formatProductsStockHiddenText(ui.hiddenMessage);
            return {
                html:
                    '<span class="admin-product-col-stock admin-product-stock-hidden" title="' +
                    esc(label) +
                    '">' +
                    esc(label) +
                    "</span>",
                sortValue: getStockSortValue(stockInfo, ui)
            };
        }

        const info = stockInfo || {};
        if (!info.visible) {
            const rawMessage =
                info.message ||
                (ui.showStocklessLabel ? ui.stocklessLabel : ui.hiddenMessage) ||
                "";
            const message = formatProductsStockHiddenText(rawMessage);
            const lockBadge = info.manualLock ? " LOCK" : "";
            const label = (message || "非公開") + lockBadge;
            return {
                html:
                    '<span class="admin-product-col-stock admin-product-stock-hidden" title="' +
                    esc(label) +
                    '">' +
                    esc(label) +
                    "</span>",
                sortValue: getStockSortValue(info, ui)
            };
        }

        const available = Number(info.availableQty) || 0;
        const total = Number(info.totalQty) || 0;
        const reserved = Number(info.reservedQty) || 0;
        const statusClass = available <= 0 ? "admin-product-stock-zero" : "admin-product-stock-available";
        const staleBadge = info.isStale ? '<span class="admin-product-stock-stale">古</span>' : "";
        const lockBadge = info.manualLock ? '<span class="admin-product-stock-lock">LOCK</span>' : "";
        const title = "合計 " + total + " / 引当 " + reserved;

        return {
            html:
                '<span class="admin-product-col-stock ' +
                statusClass +
                '" title="' +
                esc(title) +
                '"><span class="admin-product-stock-qty">' +
                esc(String(available)) +
                '</span><span class="admin-product-stock-unit">点</span>' +
                staleBadge +
                lockBadge +
                "</span>",
            sortValue: getStockSortValue(info, ui)
        };
    }

    function buildStockMap(stocks) {
        const map = new Map();
        (stocks || []).forEach(function (stock) {
            const key = normalizeProductCode(stock.productCode);
            if (key) map.set(key, stock);
        });
        return map;
    }

    global.StockPresentationClient = {
        normalizeProductCode,
        buildStockUiConfig,
        buildStockInfo,
        buildStockMap,
        formatProductsStockHiddenText,
        getStockSortValue,
        buildAdminProductStockCell
    };
})(typeof window !== "undefined" ? window : globalThis);
