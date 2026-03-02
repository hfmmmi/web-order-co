const BaseAdapter = require("./baseAdapter");

class ManualAdapter extends BaseAdapter {
    async pull(runOptions = {}) {
        const rows = runOptions.rows || this.config.options?.rows || [];
        return Array.isArray(rows) ? rows : [];
    }

    async normalize(rows = []) {
        return rows
            .filter(row => row && row.productCode)
            .map(row => ({
                productCode: row.productCode,
                totalQty: Number.isFinite(row.totalQty) ? row.totalQty : 0,
                reservedQty: Number.isFinite(row.reservedQty) ? row.reservedQty : 0,
                warehouses: Array.isArray(row.warehouses) ? row.warehouses : [],
                publish: row.publish !== undefined ? !!row.publish : true,
                hiddenMessage: row.hiddenMessage || "",
                manualLock: !!row.manualLock,
                note: row.note || "",
                source: "manual",
                timestamp: row.timestamp || new Date().toISOString()
            }));
    }
}

module.exports = ManualAdapter;
