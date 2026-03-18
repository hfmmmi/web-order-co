const path = require("path");
const fs = require("fs").promises;
const { randomUUID } = require("crypto");
const { dbPath } = require("../dbPaths");

const STOCKS_DB = dbPath("stocks.json");
const ADAPTER_CONFIG_DB = dbPath("config/stocks-adapters.json");
const HISTORY_DB = dbPath("logs/stocks-history.json");

class StockService {
    constructor() {
        this._isReady = false;
        this._readyPromise = this._ensureStorage();
    }

    async _ensureStorage() {
        if (this._isReady) return;

        await fs.mkdir(path.dirname(ADAPTER_CONFIG_DB), { recursive: true });
        await fs.mkdir(path.dirname(HISTORY_DB), { recursive: true });

        await this._touchIfMissing(STOCKS_DB, []);
        await this._touchIfMissing(ADAPTER_CONFIG_DB, {
            version: 1,
            updatedAt: null,
            display: {
                enabled: false,
                hiddenMessage: "仕入先直送のため在庫表示は行っておりません",
                showStocklessLabel: true,
                stocklessLabel: "仕入先直送",
                allowOrderingWhenZero: true,
                highlightThresholdMinutes: 180
            },
            adapters: []
        });
        await this._touchIfMissing(HISTORY_DB, []);
        this._isReady = true;
    }

    async _touchIfMissing(targetPath, defaultValue) {
        try {
            await fs.access(targetPath);
        } catch (_) {
            await fs.writeFile(targetPath, JSON.stringify(defaultValue, null, 2));
        }
    }

    async _readJson(targetPath, fallback) {
        await this._readyPromise;
        try {
            const raw = await fs.readFile(targetPath, "utf-8");
            return JSON.parse(raw);
        } catch (error) {
            console.error(`[StockService] read error (${targetPath}):`, error);
            return fallback;
        }
    }

    async _writeJson(targetPath, data) {
        await this._readyPromise;
        await fs.writeFile(targetPath, JSON.stringify(data, null, 2));
    }

    async _readStocks() {
        const list = await this._readJson(STOCKS_DB, []);
        return Array.isArray(list) ? list : [];
    }

    async _writeStocks(list) {
        await this._writeJson(STOCKS_DB, list);
    }

    _normalizeEntry(entry = {}) {
        const totalQty = Number.isFinite(entry.totalQty) ? entry.totalQty : 0;
        const reservedQty = Number.isFinite(entry.reservedQty) ? entry.reservedQty : 0;
        const publish = entry.publish !== undefined ? !!entry.publish : true;
        const warehouses = Array.isArray(entry.warehouses) ? entry.warehouses : [];

        return {
            productCode: entry.productCode,
            totalQty,
            reservedQty,
            warehouses: warehouses.map(w => ({
                code: w.code || "default",
                name: w.name || "標準倉庫",
                qty: Number.isFinite(w.qty) ? w.qty : 0
            })),
            lastSyncedAt: entry.lastSyncedAt || new Date().toISOString(),
            source: entry.source || "manual",
            publish,
            hiddenMessage: entry.hiddenMessage || "",
            manualLock: !!entry.manualLock,
            customLabels: entry.customLabels || {},
            note: entry.note || ""
        };
    }

    async getAllStocks() {
        return await this._readStocks();
    }

    async getStock(productCode) {
        if (!productCode) return null;
        const list = await this._readStocks();
        return list.find(item => item.productCode === productCode) || null;
    }

    async saveStock(entry) {
        if (!entry || !entry.productCode) {
            throw new Error("productCode is required");
        }
        const stocks = await this._readStocks();
        const normalized = this._normalizeEntry(entry);
        const index = stocks.findIndex(s => s.productCode === normalized.productCode);
        if (index === -1) {
            stocks.push(normalized);
        } else {
            stocks[index] = {
                ...stocks[index],
                ...normalized
            };
        }
        await this._writeStocks(stocks);
        return normalized;
    }

    async syncStocks(inputList, options = {}) {
        if (!Array.isArray(inputList)) {
            throw new Error("inputList must be an array");
        }

        const {
            adapterId = "manual-upload",
            source = "manual",
            skipLocked = true,
            userId = null,
            filename = null,
            allowPartial = true
        } = options;

        const existing = await this._readStocks();
        const byCode = new Map(existing.map(item => [item.productCode, item]));

        let successCount = 0;
        let skippedCount = 0;
        let errorRows = [];

        inputList.forEach((row, idx) => {
            if (!row || !row.productCode) {
                errorRows.push({ row: idx + 1, reason: "商品コードが空です" });
                return;
            }

            const current = byCode.get(row.productCode);
            if (skipLocked && current && current.manualLock) {
                skippedCount++;
                return;
            }

            const normalized = this._normalizeEntry({
                ...current,
                ...row,
                source,
                lastSyncedAt: row.timestamp || new Date().toISOString()
            });

            // totalQty が未指定の場合は倉庫合計を採用
            if (!Number.isFinite(row.totalQty) && normalized.warehouses.length > 0) {
                normalized.totalQty = normalized.warehouses.reduce((sum, wh) => sum + (wh.qty || 0), 0);
            }

            byCode.set(normalized.productCode, normalized);
            successCount++;
        });

        if (!allowPartial && errorRows.length > 0) {
            throw new Error("データ検証に失敗しました");
        }

        await this._writeStocks(Array.from(byCode.values()));
        await this._appendHistory({
            id: randomUUID(),
            adapterId,
            source,
            userId,
            filename,
            successCount,
            skippedCount,
            errorCount: errorRows.length,
            errorRows: errorRows.slice(0, 20),
            finishedAt: new Date().toISOString()
        });

        return { successCount, skippedCount, errorRows };
    }

    async reserve(items, metadata = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("reservation items required");
        }

        const stocks = await this._readStocks();
        const issues = [];

        items.forEach(item => {
            const code = item.productCode || item.code;
            const quantity = Number(item.quantity) || 0;
            if (!code || quantity <= 0) return;

            const target = stocks.find(s => s.productCode === code);
            if (!target) {
                issues.push(`${code}: 在庫マスタなし`);
                return;
            }

            const available = Math.max(target.totalQty - target.reservedQty, 0);
            if (available < quantity) {
                issues.push(`${code}: 在庫不足 (必要${quantity} / 残${available})`);
            }
        });

        if (issues.length > 0) {
            const message = metadata.silent ? "在庫不足" : issues.join(", ");
            const error = new Error(message);
            error.code = "STOCK_SHORTAGE";
            error.details = issues;
            throw error;
        }

        items.forEach(item => {
            const code = item.productCode || item.code;
            const quantity = Number(item.quantity) || 0;
            const target = stocks.find(s => s.productCode === code);
            if (!target) return;
            target.reservedQty = (target.reservedQty || 0) + quantity;
            target.lastSyncedAt = new Date().toISOString();
        });

        await this._writeStocks(stocks);
        await this._appendHistory({
            id: randomUUID(),
            adapterId: "order-reserve",
            source: "order",
            userId: metadata.userId || null,
            successCount: items.length,
            skippedCount: 0,
            errorCount: 0,
            reservedItems: items,
            finishedAt: new Date().toISOString()
        });
        return true;
    }

    async release(items, metadata = {}) {
        if (!Array.isArray(items) || items.length === 0) return false;
        const stocks = await this._readStocks();

        items.forEach(item => {
            const code = item.productCode || item.code;
            const quantity = Number(item.quantity) || 0;
            if (!code || quantity <= 0) return;
            const target = stocks.find(s => s.productCode === code);
            if (!target) return;
            const updated = (target.reservedQty || 0) - quantity;
            target.reservedQty = updated < 0 ? 0 : updated;
            target.lastSyncedAt = new Date().toISOString();
        });

        await this._writeStocks(stocks);
        await this._appendHistory({
            id: randomUUID(),
            adapterId: "order-release",
            source: "order",
            userId: metadata.userId || null,
            successCount: items.length,
            skippedCount: 0,
            errorCount: 0,
            releasedItems: items,
            finishedAt: new Date().toISOString()
        });
        return true;
    }

    async toggleManualLock(productCode, locked) {
        if (!productCode) return;
        const stocks = await this._readStocks();
        const target = stocks.find(s => s.productCode === productCode);
        if (!target) return;
        target.manualLock = !!locked;
        target.lastSyncedAt = new Date().toISOString();
        await this._writeStocks(stocks);
    }

    async getDisplaySettings() {
        const config = await this._readJson(ADAPTER_CONFIG_DB, {});
        return config.display || {};
    }

    async updateDisplaySettings(payload = {}) {
        const config = await this._readJson(ADAPTER_CONFIG_DB, {});
        config.display = {
            ...config.display,
            ...payload
        };
        config.updatedAt = new Date().toISOString();
        await this._writeJson(ADAPTER_CONFIG_DB, config);
        return config.display;
    }

    async getAdapterConfig() {
        return await this._readJson(ADAPTER_CONFIG_DB, {});
    }

    async saveAdapterConfig(config) {
        if (!config) throw new Error("config is required");
        config.updatedAt = new Date().toISOString();
        await this._writeJson(ADAPTER_CONFIG_DB, config);
        return config;
    }

    async _appendHistory(entry) {
        const history = await this._readJson(HISTORY_DB, []);
        history.unshift({
            ...entry,
            loggedAt: new Date().toISOString()
        });
        const trimmed = history.slice(0, 200);
        await this._writeJson(HISTORY_DB, trimmed);
    }

    async getHistory(limit = 50) {
        const history = await this._readJson(HISTORY_DB, []);
        return history.slice(0, limit);
    }

    async logEvent(entry = {}) {
        await this._appendHistory({
            id: entry.id || randomUUID(),
            ...entry
        });
    }
}

module.exports = new StockService();
