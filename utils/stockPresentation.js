const stockService = require("../services/stockService");

function normalizeProductCode(code) {
    return (code || "").trim().toUpperCase();
}

function buildStockUiConfig(display = {}) {
    return {
        enabled: !!display.enabled,
        hiddenMessage: display.hiddenMessage || "在庫情報は非公開です",
        stocklessLabel: display.stocklessLabel || "仕入先直送",
        showStocklessLabel: display.showStocklessLabel !== false,
        allowOrderingWhenZero: display.allowOrderingWhenZero !== false,
        highlightThresholdMinutes: Number(display.highlightThresholdMinutes) || 180,
        warehousePresets: Array.isArray(display.warehousePresets) ? display.warehousePresets : []
    };
}

function buildStockInfo(productCode, stockMap, stockUi) {
    if (!productCode) {
        return {
            visible: false,
            publish: false,
            message: stockUi.hiddenMessage
        };
    }

    const stock = stockMap.get(normalizeProductCode(productCode));

    if (!stockUi.enabled) {
        return {
            visible: false,
            publish: false,
            message: stock ? stock.hiddenMessage || stockUi.hiddenMessage : stockUi.hiddenMessage,
            manualLock: stock ? !!stock.manualLock : false,
            lastSyncedAt: stock ? stock.lastSyncedAt : null
        };
    }

    if (!stock || stock.publish === false) {
        return {
            visible: false,
            publish: false,
            message: (stock && stock.hiddenMessage) || stockUi.hiddenMessage,
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
            isStale = diffMinutes > stockUi.highlightThresholdMinutes;
        }
    }

    const presets = stockUi.warehousePresets || [];
    const warehouses = (Array.isArray(stock.warehouses) ? stock.warehouses : []).map((w) => {
        const preset = presets.find((p) => String(p.code || "").trim() === String(w.code || "").trim());
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

async function getStockContext() {
    const [stocks, display] = await Promise.all([
        stockService.getAllStocks(),
        stockService.getDisplaySettings()
    ]);
    const stockMap = new Map();
    stocks.forEach((stock) => {
        const key = normalizeProductCode(stock.productCode);
        stockMap.set(key, stock);
    });
    const stockUi = buildStockUiConfig(display || {});
    return { stockMap, stockUi };
}

module.exports = {
    normalizeProductCode,
    buildStockUiConfig,
    buildStockInfo,
    getStockContext
};
