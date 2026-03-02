const BaseAdapter = require("./baseAdapter");

class RestAdapter extends BaseAdapter {
    async pull(runOptions = {}) {
        const endpoint = runOptions.endpoint || this.config.options?.endpoint;
        if (!endpoint) {
            throw new Error("RESTエンドポイントが設定されていません");
        }

        const method = (runOptions.method || this.config.options?.method || "GET").toUpperCase();
        const headers = {
            "Content-Type": "application/json",
            ...(this.config.options?.headers || {}),
            ...(runOptions.headers || {})
        };
        const bodyPayload = runOptions.body || this.config.options?.body;

        const response = await this._fetch(endpoint, {
            method,
            headers,
            body: bodyPayload ? JSON.stringify(bodyPayload) : undefined
        });

        if (!response.ok) {
            throw new Error(`RESTアダプタの取得に失敗しました (status: ${response.status})`);
        }

        return await response.json();
    }

    async normalize(payload = []) {
        if (!Array.isArray(payload)) return [];
        return payload
            .map(row => ({
                productCode: row.productCode || row.code,
                totalQty: Number.isFinite(row.totalQty) ? row.totalQty : Number(row.qty ?? 0) || 0,
                reservedQty: Number.isFinite(row.reservedQty) ? row.reservedQty : 0,
                warehouses: Array.isArray(row.warehouses) ? row.warehouses : [],
                publish: row.publish !== undefined ? !!row.publish : true,
                hiddenMessage: row.hiddenMessage || "",
                manualLock: !!row.manualLock,
                source: "rest",
                timestamp: row.timestamp || row.lastSyncedAt || new Date().toISOString()
            }))
            .filter(row => !!row.productCode);
    }

    async _fetch(url, options) {
        if (typeof fetch === "function") {
            return await fetch(url, options);
        }
        throw new Error("fetch API が利用できないため REST アダプタを実行できません (Node.js v18 以上が必要)");
    }
}

module.exports = RestAdapter;
