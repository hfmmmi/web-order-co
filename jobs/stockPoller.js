const cron = require("node-cron");
const stockService = require("../services/stockService");
const { createAdapter } = require("../services/stockAdapters");

class StockPoller {
    constructor() {
        this.tasks = [];
        this.started = false;
    }

    async start() {
        if (this.started) return;
        await this.reload();
        this.started = true;
        console.log("[StockPoller] 起動しました");
    }

    async reload() {
        this.stopAll();
        const config = await stockService.getAdapterConfig();
        (config.adapters || []).forEach(adapterConfig => {
            if (!adapterConfig || !adapterConfig.enabled) return;
            const pollMinutes = Number(adapterConfig.pollIntervalMinutes) || 0;
            if (pollMinutes <= 0) return;
            const cronExpr = `*/${Math.max(pollMinutes, 1)} * * * *`;
            const task = cron.schedule(cronExpr, () => {
                this.runOnce(adapterConfig).catch(err => this._handleError(adapterConfig, err));
            }, { scheduled: false });
            task.start();
            this.tasks.push(task);
        });
    }

    stopAll() {
        this.tasks.forEach(task => task.stop());
        this.tasks = [];
    }

    async runOnce(adapterConfig, overrideOptions = {}) {
        const adapter = createAdapter(adapterConfig);
        if (!adapter) {
            throw new Error(`アダプタ種別 "${adapterConfig.type}" は未対応です`);
        }
        const result = await adapter.run({
            adapterId: adapterConfig.id,
            skipLocked: adapterConfig.skipLocked !== false,
            allowPartial: adapterConfig.allowPartial !== false,
            ...overrideOptions
        });
        console.log(`[StockPoller] ${adapterConfig.id}: ${result.rows}件処理`);
        return result;
    }

    async _handleError(adapterConfig, error) {
        console.error(`[StockPoller] ${adapterConfig.id} エラー:`, error.message);
        await stockService.logEvent({
            adapterId: adapterConfig.id,
            source: adapterConfig.type,
            successCount: 0,
            skippedCount: 0,
            errorCount: 1,
            errorMessage: error.message,
            stack: String(error.stack || ""),
            finishedAt: new Date().toISOString()
        });
    }
}

module.exports = new StockPoller();
