// services/orderService.js
// 【役割】注文データのCRUD、出荷管理、およびFLAM連携を担当
// [Updated] データの欠損（code/price/name）に対する強力な自己修復・補完ロジックを追加

const fs = require("fs").promises;
const { parse } = require('csv-parse/sync'); // FLAM用
const iconv = require('iconv-lite');      // FLAM用
const { calculateFinalPrice } = require("../utils/priceCalc"); // 価格計算
const stockService = require("./stockService");
const settingsService = require("./settingsService");
const { runWithJsonFileWriteLock } = require("../utils/jsonWriteQueue");
const { INTEGRATION_SNAPSHOT_MAX_LIMIT } = require("../utils/integrationSnapshotLimit");

/** 物流CSVの1行から、候補列名のうち最初に値があるものを返す */
function firstCsvRowValue(row, keys) {
    if (!row || !Array.isArray(keys)) return "";
    for (const k of keys) {
        if (k && row[k] != null && String(row[k]).trim() !== "") {
            return String(row[k]).trim();
        }
    }
    return "";
}

// データベースのパス定義（業務データは dbPaths 経由で一元管理）
const { dbPath } = require("../dbPaths");
const ORDERS_DB = dbPath("orders.json");
const PRODUCTS_DB = dbPath("products.json");
const PRICES_DB = dbPath("prices.json");
const CUSTOMERS_DB = dbPath("customers.json");
const RANK_PRICES_DB = dbPath("rank_prices.json");

// ヘルパー: 公開ID(W00...)から内部ID(数値)への変換 (FLAM用)
const fromPublicId = (publicId) => {
    if (!publicId) return null;
    const num = parseInt(publicId.replace(/^W/, ''), 10);
    return isNaN(num) ? null : num;
};

class OrderService {
    // 内部ヘルパー: JSON読み込み
    async _loadJson(filePath) {
        try {
            const data = await fs.readFile(filePath, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            return (filePath.endsWith("orders.json") || filePath.endsWith("customers.json")) ? [] : {};
        }
    }

    // 内部ヘルパー: ステータス再計算
    _recalculateStatus(order) {
        if (!order.shipments || order.shipments.length === 0) return "未発送";
        let isComplete = true;
        let hasShipment = false;
        order.items.forEach(item => {
            const shippedQty = order.shipments.reduce((sum, s) => {
                const shipItem = s.items.find(si => si.code === item.code);
                return sum + (shipItem ? shipItem.quantity : 0);
            }, 0);
            if (shippedQty > 0) hasShipment = true;
            if (shippedQty < item.quantity) isComplete = false;
        });
        if (isComplete) return "発送済";
        if (hasShipment) return "一部発送";
        return "未発送";
    }

    _generateNextOrderId(orders) {
        const now = Date.now();
        const maxNumericId = orders.reduce((max, row) => {
            const id = Number(row && row.orderId);
            return Number.isFinite(id) ? Math.max(max, id) : max;
        }, 0);
        return Math.max(now, maxNumericId + 1);
    }

    // =========================================
    // 1. 基本CRUD機能 (Existing Features)
    // =========================================

    _orderDateIsoFromYmd(ymd) {
        if (typeof ymd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
        const d = new Date(ymd + "T00:00:00+09:00");
        return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // 新規注文作成（orderDateYmd: 管理画面など YYYY-MM-DD を渡すとその日の JST 0時を orderDate に保存）
    async placeOrder(customerId, cart, deliveryInfo, myRank, orderDateYmd) {
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const [productMaster, priceList, rankPriceMap, orders] = await Promise.all([
                this._loadJson(PRODUCTS_DB),
                this._loadJson(PRICES_DB),
                this._loadJson(RANK_PRICES_DB),
                this._loadJson(ORDERS_DB)
            ]);

            // 価格最終確認 & データ正規化
            const fixedItems = cart.map(item => {
                // ★修正: カートデータのキー揺らぎを徹底的に吸収
                // フロントエンドの実装ブレ(code, productCode, id)に対応
                const targetCode = item.code || item.productCode || item.id || "";

                const product = productMaster.find(p => p.productCode === targetCode);

                // 名前決定: マスタ優先 > カート内の名前 > 不明
                // マスタがあれば必ずマスタの正式名称を使うことで「不明」を防ぐ
                let productName = product ? product.name : (item.name || "商品名不明");
                if (productName === "不明") productName = "商品名不明";

                // 価格計算
                const specialPriceEntry = priceList.find(p => p.customerId === customerId && p.productCode === targetCode);

                let finalPrice = item.price;
                // 数値変換とNaN対策
                if (typeof finalPrice !== "number") finalPrice = parseInt(finalPrice, 10) || 0;

                // マスタがあり、価格が未確定(0)の場合はサーバーサイドで強制再計算
                if (product && finalPrice === 0) {
                    const productWithRank = { ...product, rankPrices: rankPriceMap[product.productCode] || {} };
                    finalPrice = calculateFinalPrice(productWithRank, myRank, specialPriceEntry);
                }

                return {
                    code: targetCode,
                    name: productName,
                    price: finalPrice,
                    quantity: item.quantity
                };
            });

            // 仕入先直送が多く在庫管理が困難なため、在庫引当は行わず常に受付可能とする
            const resolvedDate =
                this._orderDateIsoFromYmd(orderDateYmd) || new Date().toISOString();
            const newOrder = {
                orderId: this._generateNextOrderId(orders),
                orderDate: resolvedDate,
                customerId,
                items: fixedItems,
                deliveryInfo,
                status: "未発送",
                shipments: [],
                exported_at: null,
                stockSnapshot: null
            };

            orders.push(newOrder);
            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
            return newOrder;
        });
    }

    // 全注文取得 (管理者用ショートカット)
    async getAllOrders() {
        return await this.searchOrders({ isAdmin: true });
    }

    // 注文検索・一覧取得
    async searchOrders(criteria) {
        const { status, keyword, start, end, customerId, isAdmin } = criteria;
        
        const [orders, productMaster, priceList, rankPriceMap, customerList] = await Promise.all([
            this._loadJson(ORDERS_DB),
            this._loadJson(PRODUCTS_DB),
            this._loadJson(PRICES_DB),
            this._loadJson(RANK_PRICES_DB),
            this._loadJson(CUSTOMERS_DB)
        ]);

        // フィルタリング
        const filtered = orders.filter(order => {
            if (!isAdmin && order.customerId !== customerId) return false;

            const orderIdStr = String(order.orderId);
            const custIdStr = order.customerId || "";
            const key = keyword ? keyword.toLowerCase() : "";
            const matchKeyword = (key === "") || orderIdStr.includes(key) || custIdStr.toLowerCase().includes(key);

            const currentStatus = order.status || "未発送";
            const matchStatus = (status === "" || status === undefined) || (currentStatus === status);

            let orderDateStr = "1970-01-01";
            try {
                const d = new Date(order.orderDate);
                if (!isNaN(d.getTime())) {
                    const jstTime = d.getTime() + (9 * 60 * 60 * 1000);
                    orderDateStr = new Date(jstTime).toISOString().split('T')[0];
                }
            } catch (e) { }

            let matchDate = true;
            if (start && orderDateStr < start) matchDate = false;
            if (end && orderDateStr > end) matchDate = false;

            return matchKeyword && matchStatus && matchDate;
        });

        // データ補完・自己修復処理 (Self-Healing)
        const calculated = filtered.map(order => {
            const customer = customerList.find(c => c.customerId === order.customerId);
            const customerRank = customer ? (customer.priceRank || "") : "";

            let customerName = "名称不明";
            if (customer) {
                customerName = customer.customerName || "名称不明";
            } else if (!order.customerId) {
                customerName = "ゲスト(IDなし)";
            } else {
                const deliveryName = order.deliveryInfo ? order.deliveryInfo.name : "";
                customerName = deliveryName 
                    ? `${deliveryName} (ID:${order.customerId} 削除済)` 
                    : `(未登録ID: ${order.customerId})`;
            }

            // ★修正: 表示時のデータ補完ロジックを大幅強化
            const enrichedItems = order.items.map(item => {
                // 1. 商品コードの特定（揺らぎ吸収）
                let itemCode = item.code || item.productCode || "";
                
                // マスタ検索
                let product = productMaster.find(p => p.productCode === itemCode);

                // ★修復A: コードがない、またはマスタにない場合、名前で逆引きを試みる（最後の手段）
                if (!product && item.name && item.name !== "不明" && item.name !== "商品名不明") {
                    product = productMaster.find(p => p.name === item.name);
                    if (product) itemCode = product.productCode; // コード復元
                }

                // 2. 商品名: マスタがあればマスタ名を優先（表記ゆれ・「不明」防止）
                let itemName = item.name;
                if (product) {
                    itemName = product.name;
                } else {
                    // マスタにもなく、注文データも空/不明の場合
                    if (!itemName || itemName === "不明" || itemName === "商品名不明") {
                        itemName = "（取扱終了商品またはデータ不整合）"; 
                    }
                }

                // 3. 価格: 0円なら再計算 (ランク価格適用)
                let finalPrice = item.price;
                if (typeof finalPrice !== 'number') finalPrice = parseInt(finalPrice, 10) || 0;

                // 価格が0、かつマスタが見つかった場合のみ救済措置を発動
                if (finalPrice === 0 && product) {
                    const productWithRank = { ...product, rankPrices: rankPriceMap[product.productCode] || {} };
                    const specialPriceEntry = priceList.find(p => p.customerId === order.customerId && p.productCode === itemCode);
                    finalPrice = calculateFinalPrice(productWithRank, customerRank, specialPriceEntry);
                }
                
                return {
                    ...item,
                    code: itemCode,
                    name: itemName,
                    price: finalPrice
                };
            });

            // 合計金額計算
            const totalAmount = enrichedItems.reduce((total, item) => {
                return total + (item.price * item.quantity);
            }, 0);

            return { ...order, items: enrichedItems, totalAmount, customerName };
        });

        return calculated.sort((a, b) => b.orderId - a.orderId);
    }

    // ステータス・配送情報更新
    async updateOrderStatus(orderId, updates) {
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const targetIndex = orders.findIndex(o => String(o.orderId) === String(orderId));

            if (targetIndex === -1) throw new Error("Order not found");

            const order = orders[targetIndex];
            if (updates.status) {
                order.status = updates.status;
                const normalized = (updates.status || "").toLowerCase();
                if (normalized.includes("キャンセル") || normalized.includes("取消")) {
                    if (order.stockSnapshot && !order.stockSnapshot.released && Array.isArray(order.stockSnapshot.reservedItems)) {
                        try {
                            await stockService.release(order.stockSnapshot.reservedItems, {
                                userId: updates.performedBy || "admin"
                            });
                            order.stockSnapshot.released = true;
                            order.stockSnapshot.releasedAt = new Date().toISOString();
                        } catch (releaseError) {
                            console.error("Stock release error:", releaseError);
                        }
                    }
                }
            }
            if (updates.deliveryCompany !== undefined) order.deliveryCompany = updates.deliveryCompany;
            if (updates.trackingNumber !== undefined) order.trackingNumber = updates.trackingNumber;

            if (!order.deliveryInfo) order.deliveryInfo = {};
            if (updates.deliveryDate !== undefined) order.deliveryInfo.date = updates.deliveryDate;
            if (updates.deliveryDateUnknown !== undefined) order.deliveryInfo.dateUnknown = updates.deliveryDateUnknown;
            if (updates.deliveryEstimate !== undefined) order.deliveryInfo.estimateMessage = updates.deliveryEstimate;

            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
            return true;
        });
    }

    /**
     * 管理者用: 納品先・備考・荷主・明細など注文の表示用詳細を更新（出荷履歴・ステータスは変更しない）
     */
    async updateAdminOrderDetails(orderId, opts) {
        const { deliveryInfo: di, items } = opts || {};
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const targetIndex = orders.findIndex((o) => String(o.orderId) === String(orderId));
            if (targetIndex === -1) throw new Error("Order not found");

            const order = orders[targetIndex];
            if (di) {
                if (!order.deliveryInfo) order.deliveryInfo = {};
                const keys = ["date", "zip", "tel", "address", "name", "note", "clientOrderNumber"];
                keys.forEach((k) => {
                    if (di[k] !== undefined) order.deliveryInfo[k] = di[k];
                });
                if (di.shipper !== undefined) {
                    order.deliveryInfo.shipper = { ...(order.deliveryInfo.shipper || {}), ...di.shipper };
                }
            }
            if (items && items.length > 0) {
                order.items = items.map((it) => ({
                    code: it.code,
                    name: it.name && String(it.name).trim() !== "" ? it.name : "商品名不明",
                    price: Math.round(Number(it.price)) || 0,
                    quantity: Math.round(Number(it.quantity)) || 1
                }));
            }

            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
            return true;
        });
    }

    /** 管理者用: 注文を orders.json から完全削除（在庫引当があれば解放を試みる） */
    async deleteOrder(orderId) {
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const targetIndex = orders.findIndex((o) => String(o.orderId) === String(orderId));
            if (targetIndex === -1) throw new Error("Order not found");

            const order = orders[targetIndex];
            if (
                order.stockSnapshot &&
                !order.stockSnapshot.released &&
                Array.isArray(order.stockSnapshot.reservedItems)
            ) {
                try {
                    await stockService.release(order.stockSnapshot.reservedItems, {
                        userId: "admin-delete-order"
                    });
                } catch (releaseError) {
                    console.error("Stock release on deleteOrder:", releaseError);
                }
            }

            orders.splice(targetIndex, 1);
            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
            return true;
        });
    }

    // 出荷登録
    async registerShipment(orderId, shipmentDataArray) {
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const targetIndex = orders.findIndex(o => String(o.orderId) === String(orderId));

            if (targetIndex === -1) throw new Error("Order not found");

            const order = orders[targetIndex];
            if (!order.shipments) order.shipments = [];

            shipmentDataArray.forEach((payload, idx) => {
                order.shipments.push({
                    shipmentId: Date.now() + idx,
                    shippedDate: new Date().toISOString(),
                    ...payload
                });
            });

            const newStatus = this._recalculateStatus(order);
            order.status = newStatus;

            const lastShipment = shipmentDataArray[shipmentDataArray.length - 1];
            order.deliveryCompany = lastShipment.deliveryCompany;
            order.trackingNumber = lastShipment.trackingNumber;

            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
            return newStatus;
        });
    }

    // 出荷修正
    async updateShipment(orderId, shipmentId, updates) {
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const targetIndex = orders.findIndex(o => String(o.orderId) === String(orderId));

            if (targetIndex === -1) throw new Error("Order not found");
            const order = orders[targetIndex];

            if (!order.shipments) throw new Error("No shipments");
            const shipIndex = order.shipments.findIndex(s => String(s.shipmentId) === String(shipmentId));
            if (shipIndex === -1) throw new Error("Shipment not found");

            Object.assign(order.shipments[shipIndex], updates);

            if (shipIndex === order.shipments.length - 1) {
                if (updates.deliveryCompany) order.deliveryCompany = updates.deliveryCompany;
                if (updates.trackingNumber) order.trackingNumber = updates.trackingNumber;
            }

            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
            return true;
        });
    }

    // =========================================
    // 2. CSVエクスポート支援 (Export Features)
    // =========================================

    async getAllDataForCsv(criteria) {
        const [orders, productMaster, priceList, customerList, rankPriceMap] = await Promise.all([
            this._loadJson(ORDERS_DB),
            this._loadJson(PRODUCTS_DB),
            this._loadJson(PRICES_DB),
            this._loadJson(CUSTOMERS_DB),
            this._loadJson(RANK_PRICES_DB)
        ]);
        
        return {
            productMaster, priceList, customerList, rankPriceMap, rawOrders: orders
        };
    }

    async markOrdersAsExported(orderIds) {
        await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const nowISO = new Date().toISOString();

            orderIds.forEach(id => {
                const target = orders.find(o => o.orderId === id);
                if (target) target.exported_at = nowISO;
            });

            await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
        });
    }

    async resetExportStatus(orderId) {
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);
            const target = orders.find(o => String(o.orderId) === String(orderId));
            if (target) {
                target.exported_at = null;
                await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));
                return true;
            }
            return false;
        });
    }

    // =========================================
    // 3. FLAM連携機能 (New Import Feature)
    // =========================================

    async importFlamData(fileBuffer) {
        try {
            const cfg = await settingsService.getLogisticsCsvImportConfig();
            const content = iconv.decode(fileBuffer, "Shift_JIS");
            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                relax_column_count: true
            });

            let publicIdRegex;
            try {
                publicIdRegex = new RegExp(cfg.publicIdPattern || "W(\\d{11})");
            } catch (e) {
                publicIdRegex = /W(\d{11})/;
            }

            const memoFields = Array.isArray(cfg.memoFields) && cfg.memoFields.length ? cfg.memoFields : ["社内メモ", "備考"];
            const sourceLabel =
                cfg.importSourceLabel && String(cfg.importSourceLabel).trim()
                    ? String(cfg.importSourceLabel).trim()
                    : "FLAM";

            return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
                const orders = await this._loadJson(ORDERS_DB);
                const stats = { updated: 0, created: 0, skipped: 0 };
                const historyLog = [];

                records.forEach((row) => {
                    const memo = firstCsvRowValue(row, memoFields);
                    const match = memo.match(publicIdRegex);

                    if (match) {
                        const publicId = match[0];
                        const dbId = fromPublicId(publicId);
                        const targetOrder = orders.find(o => o.orderId === dbId);

                        if (targetOrder) {
                            targetOrder.status = "発送済";
                            targetOrder.deliveryDate = firstCsvRowValue(row, cfg.deliveryDate) || "";
                            targetOrder.flamInfo = {
                                orderNo: firstCsvRowValue(row, cfg.orderNumber),
                                updatedAt: new Date().toISOString()
                            };
                            stats.updated++;
                            historyLog.push(`[更新] ID:${publicId}`);
                        } else {
                            stats.skipped++;
                        }
                    } else {
                        const newId = orders.length > 0 ? Math.max(...orders.map(o => o.orderId)) + 1 : 1;
                        const newOrder = {
                            orderId: newId,
                            userId: "FAX_USER",
                            customerName: firstCsvRowValue(row, cfg.customerName) || "不明",
                            totalAmount: parseInt(firstCsvRowValue(row, cfg.orderTotal) || "0", 10) || 0,
                            orderDate:
                                firstCsvRowValue(row, cfg.orderDate) || new Date().toISOString().split("T")[0],
                            status: "発送済",
                            items: [],
                            deliveryDate: firstCsvRowValue(row, cfg.deliveryDate) || "",
                            source: sourceLabel
                        };
                        orders.push(newOrder);
                        stats.created++;
                    }
                });

                await fs.writeFile(ORDERS_DB, JSON.stringify(orders, null, 2));

                return {
                    success: true,
                    message: `処理完了: 更新${stats.updated}件 / 新規${stats.created}件`,
                    stats,
                    logs: historyLog.slice(0, 10)
                };
            });
        } catch (error) {
            console.error("[OrderService] FLAM Import Error:", error);
            throw new Error("システムエラー: " + error.message);
        }
    }

    /**
     * 販管連携用: 注文スナップショット（パスワード等は含まない）
     * @param {{ since?: string, limit?: string|number }} opts
     */
    async getOrdersSnapshotForIntegration(opts = {}) {
        const { since, limit } = opts;
        const orders = await this._loadJson(ORDERS_DB);
        const lim = Math.min(
            Math.max(1, parseInt(String(limit), 10) || 500),
            INTEGRATION_SNAPSHOT_MAX_LIMIT
        );
        let sinceMs = 0;
        if (since) {
            const d = new Date(String(since));
            if (!isNaN(d.getTime())) sinceMs = d.getTime();
        }
        const list = Array.isArray(orders) ? orders : [];
        const filtered = list.filter((o) => {
            if (!sinceMs) return true;
            const t = new Date(o.orderDate).getTime();
            return !isNaN(t) && t >= sinceMs;
        });
        filtered.sort((a, b) => {
            const ta = new Date(a.orderDate).getTime();
            const tb = new Date(b.orderDate).getTime();
            if (isNaN(ta) && isNaN(tb)) return 0;
            if (isNaN(ta)) return 1;
            if (isNaN(tb)) return -1;
            return ta - tb;
        });
        const slice = filtered.slice(0, lim);
        const safe = slice.map((o) => ({
            orderId: o.orderId,
            orderDate: o.orderDate,
            customerId: o.customerId,
            customerName: o.customerName,
            status: o.status,
            items: Array.isArray(o.items) ? o.items : [],
            deliveryInfo: o.deliveryInfo || null,
            shipments: Array.isArray(o.shipments) ? o.shipments : [],
            source: o.source,
            totalAmount: o.totalAmount,
            exported_at: o.exported_at ?? null
        }));
        return { orders: safe, count: safe.length };
    }

    async importExternalOrders(importedOrders) {
        if (!Array.isArray(importedOrders)) {
            throw new Error("importedOrders must be an array");
        }
        return await runWithJsonFileWriteLock(ORDERS_DB, async () => {
            const orders = await this._loadJson(ORDERS_DB);

            let createdCount = 0;
            let skippedCount = 0;
            const createdIds = [];
            const skippedIds = [];

            const merged = Array.isArray(orders) ? [...orders] : [];
            for (const newOrd of importedOrders) {
                if (!newOrd || newOrd.orderId === undefined || newOrd.orderId === null) {
                    skippedCount++;
                    continue;
                }
                const exists = merged.some((o) => String(o.orderId) === String(newOrd.orderId));
                if (exists) {
                    skippedCount++;
                    skippedIds.push(newOrd.orderId);
                    continue;
                }
                merged.push(newOrd);
                createdCount++;
                createdIds.push(newOrd.orderId);
            }

            await fs.writeFile(ORDERS_DB, JSON.stringify(merged, null, 2));
            return {
                createdCount,
                skippedCount,
                createdIds,
                skippedIds
            };
        });
    }
}

const orderServiceSingleton = new OrderService();
module.exports = orderServiceSingleton;
if (process.env.NODE_ENV === "test") {
    orderServiceSingleton.__testOnly = {
        firstCsvRowValue,
        fromPublicId,
        loadJson: (filePath) => orderServiceSingleton._loadJson(filePath)
    };
}