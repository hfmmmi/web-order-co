class BaseAdapter {
    constructor(config = {}, stockService) {
        if (!stockService) {
            throw new Error("stockService is required");
        }
        this.config = config;
        this.stockService = stockService;
    }

    async run(runOptions = {}) {
        await this.prepare(runOptions);
        const raw = await this.pull(runOptions);
        const normalized = await this.normalize(raw, runOptions);
        if (!Array.isArray(normalized)) {
            throw new Error("normalize() must return an array");
        }
        const adapterId = this.config.id || this.config.type || "stock-adapter";
        const summary = await this.stockService.syncStocks(normalized, {
            adapterId,
            source: this.config.type || "manual",
            userId: runOptions.userId,
            filename: runOptions.filename,
            skipLocked: runOptions.skipLocked ?? true,
            allowPartial: runOptions.allowPartial ?? true
        });
        return { rows: normalized.length, summary };
    }

    async prepare() { /* override if needed */ }
    async pull() { throw new Error("pull() must be implemented"); }
    async normalize(data) { return Array.isArray(data) ? data : []; }
}

module.exports = BaseAdapter;
