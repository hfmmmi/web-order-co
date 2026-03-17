// routes/products-api.js
// 商品関連API（一覧取得・検索・見積・カート詳細）
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs").promises;

// ★心臓部（価格計算機）を輸入
const { calculateFinalPrice } = require("../utils/priceCalc");
const stockService = require("../services/stockService");

// ★見積ロジックを輸入
const specialPriceService = require("../services/specialPriceService");

// データベースの場所
const PRODUCTS_DB_PATH = path.join(__dirname, "../products.json");
const PRICES_DB_PATH = path.join(__dirname, "../prices.json");
const RANK_PRICES_DB_PATH = path.join(__dirname, "../rank_prices.json");

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
            message: stock ? (stock.hiddenMessage || stockUi.hiddenMessage) : stockUi.hiddenMessage,
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
    const warehouses = (Array.isArray(stock.warehouses) ? stock.warehouses : []).map(w => {
        const preset = presets.find(p => String(p.code || "").trim() === String(w.code || "").trim());
        const displayName = (preset && (preset.name || "").trim()) ? String(preset.name).trim() : (w.name || w.code || "");
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
    stocks.forEach(stock => {
        const key = normalizeProductCode(stock.productCode);
        stockMap.set(key, stock);
    });
    const stockUi = buildStockUiConfig(display || {});
    return { stockMap, stockUi };
}

// =================================================================
// 🛍️ 1. 商品一覧取得 API (Standard Search)
// =================================================================
router.get("/products", async (req, res) => {
    // ログインチェック
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const keyword = req.query.keyword || "";
    const customerId = req.session.customerId;
    const myRank = req.session.priceRank || "";

    try {
        // マスタ一括ロード
        const [productData, pricesData, rankData] = await Promise.all([
            fs.readFile(PRODUCTS_DB_PATH, "utf-8"),
            fs.readFile(PRICES_DB_PATH, "utf-8"),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").catch(() => "{}")
        ]);

        const productMaster = JSON.parse(productData);
        const priceList = JSON.parse(pricesData);
        const rankPriceMap = JSON.parse(rankData);

        // 検索フィルタリング（取り込みExcel＝rank_pricesに存在する商品のみ表示）
        let filtered = productMaster.filter(p => {
            if (p.active === false) return false;
            if (!rankPriceMap[p.productCode]) return false;

            if (!keyword) return true;
            const lowerKey = keyword.toLowerCase();
            return (
                (p.name && p.name.toLowerCase().includes(lowerKey)) ||
                (p.productCode && p.productCode.toLowerCase().includes(lowerKey)) ||
                (p.manufacturer && p.manufacturer.toLowerCase().includes(lowerKey))
            );
        });

        // ページネーション計算
        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / limit);
        const startIndex = (page - 1) * limit;
        const paginatedItems = filtered.slice(startIndex, startIndex + limit);

        // 各商品の最終価格を計算
        const { stockMap, stockUi } = await getStockContext();

        const resultItems = paginatedItems.map(product => {
            const specialPriceEntry = priceList.find(p => p.customerId === customerId && p.productCode === product.productCode);
            const productWithRank = { ...product, rankPrices: rankPriceMap[product.productCode] || {} };
            const finalPrice = calculateFinalPrice(productWithRank, myRank, specialPriceEntry);

            return {
                ...product,
                price: finalPrice,
                isSpecialPrice: !!specialPriceEntry,
                stockInfo: buildStockInfo(product.productCode, stockMap, stockUi)
            };
        });

        res.json({
            items: resultItems,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems
            },
            stockUi
        });

    } catch (error) {
        console.error("Product Load Error:", error);
        res.status(500).json({ message: "商品データの読み込みに失敗しました" });
    }
});

// =================================================================
// 📄 2. 見積番号検索 API (Estimate Search)
// =================================================================
router.get("/products/estimate", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const estimateId = req.query.estimateId;
    const customerId = req.session.customerId;

    if (!estimateId) {
        return res.status(400).json({ message: "見積番号が指定されていません" });
    }

    try {
        const estimateItems = await specialPriceService.getSpecialPrices(estimateId, customerId);

        if (estimateItems.length === 0) {
            return res.json({ 
                items: [], 
                message: "該当する有効な見積が見つかりません（番号間違い、期限切れ、または他顧客の可能性があります）" 
            });
        }

        const productData = await fs.readFile(PRODUCTS_DB_PATH, "utf-8");
        const productMaster = JSON.parse(productData);

        // 見積の件名を取得（同じ見積番号の最初のアイテムから）
        const estimateSubject = estimateItems.length > 0 ? (estimateItems[0].subject || "") : "";
        const estimateValidUntil = estimateItems.length > 0 ? (estimateItems[0].validUntil || "") : "";
        
        const { stockMap, stockUi } = await getStockContext();

        const resultItems = estimateItems.map(estItem => {
            const masterItem = productMaster.find(p => p.productCode === estItem.productCode);
            const baseInfo = masterItem || {
                productCode: estItem.productCode,
                name: estItem.productName,
                manufacturer: estItem.manufacturer || "見積品",
                category: "見積対象商品",
                image: "no_image.png"
            };

            return {
                ...baseInfo,
                price: estItem.unitPrice, 
                isEstimateItem: true,
                estimateId: estItem.estimateId,
                validUntil: estItem.validUntil,
                subject: estItem.subject || "",
                stockInfo: buildStockInfo(baseInfo.productCode, stockMap, stockUi)
            };
        });

        res.json({ 
            items: resultItems,
            stockUi,
            estimateInfo: {
                estimateId: estimateId,
                subject: estimateSubject,
                validUntil: estimateValidUntil
            }
        });

    } catch (error) {
        console.error("Estimate Search Error:", error);
        res.status(500).json({ message: "見積データの検索中にエラーが発生しました" });
    }
});

// =================================================================
// 🛒 3. カート詳細取得 API (Cart Details) [新規実装]
// =================================================================
router.post("/cart-details", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "Auth Required" });

    const cartItems = req.body.cart; // [{ productCode: "...", quantity: 1 }, ...]
    if (!Array.isArray(cartItems)) return res.status(400).json({ success: false, message: "Invalid Data" });

    const customerId = req.session.customerId;
    const myRank = req.session.priceRank || "";

    try {
        // 全マスタ読み込み (計算に必要)
        const [productData, pricesData, rankData] = await Promise.all([
            fs.readFile(PRODUCTS_DB_PATH, "utf-8"),
            fs.readFile(PRICES_DB_PATH, "utf-8"),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").catch(() => "{}")
        ]);

        const productMaster = JSON.parse(productData);
        const priceList = JSON.parse(pricesData);
        const rankPriceMap = JSON.parse(rankData);

        // 各アイテムの情報を補完・再計算
        const details = cartItems.map(item => {
            const product = productMaster.find(p => p.productCode === item.productCode);
            if (!product) return null; // 商品が削除されている場合などは除外

            // 最新価格を再計算
            const specialPriceEntry = priceList.find(p => p.customerId === customerId && p.productCode === product.productCode);
            const productWithRank = { ...product, rankPrices: rankPriceMap[product.productCode] || {} };
            const finalPrice = calculateFinalPrice(productWithRank, myRank, specialPriceEntry);

            return {
                code: product.productCode,
                name: product.name,
                price: finalPrice,
                quantity: item.quantity,
                stockStatus: product.stockStatus || "取寄",
                image: product.image
            };
        }).filter(d => d !== null);

        res.json({ success: true, cartDetails: details });

    } catch (e) {
        console.error("Cart Detail Error:", e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// =================================================================
// 🔥 4. よく注文する商品 API (Frequent Orders)
// =================================================================
router.get("/products/frequent", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const customerId = req.session.customerId;
    const myRank = req.session.priceRank || "";
    const limit = parseInt(req.query.limit) || 20; // 上位20件

    try {
        // データ一括ロード
        const ORDERS_DB_PATH = path.join(__dirname, "../orders.json");
        const [productData, pricesData, rankData, ordersData] = await Promise.all([
            fs.readFile(PRODUCTS_DB_PATH, "utf-8"),
            fs.readFile(PRICES_DB_PATH, "utf-8"),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").catch(() => "{}"),
            fs.readFile(ORDERS_DB_PATH, "utf-8").catch(() => "[]")
        ]);

        const productMaster = JSON.parse(productData);
        const priceList = JSON.parse(pricesData);
        const rankPriceMap = JSON.parse(rankData);
        const orders = JSON.parse(ordersData);

        // 顧客の注文履歴から商品ごとの注文回数を集計
        const frequencyMap = {}; // { productCode: { count: N, totalQty: M, lastOrdered: Date } }

        orders
            .filter(order => order.customerId === customerId)
            .forEach(order => {
                const orderDate = new Date(order.orderDate);
                (order.items || []).forEach(item => {
                    const code = item.code || item.productCode;
                    if (!code) return;

                    if (!frequencyMap[code]) {
                        frequencyMap[code] = { count: 0, totalQty: 0, lastOrdered: null };
                    }
                    frequencyMap[code].count += 1;
                    frequencyMap[code].totalQty += (item.quantity || 1);
                    
                    // 最新注文日を更新
                    if (!frequencyMap[code].lastOrdered || orderDate > frequencyMap[code].lastOrdered) {
                        frequencyMap[code].lastOrdered = orderDate;
                    }
                });
            });

        // 注文回数が0の場合は空を返す（取り込みExcel＝rank_pricesに存在する商品のみ表示）
        const sortedCodes = Object.entries(frequencyMap)
            .filter(([code]) => rankPriceMap[code])
            .sort((a, b) => b[1].count - a[1].count) // 注文回数の多い順
            .slice(0, limit)
            .map(([code]) => code);

        if (sortedCodes.length === 0) {
            return res.json({
                items: [],
                message: "まだ注文履歴がありません"
            });
        }

        const { stockMap, stockUi } = await getStockContext();

        // 商品詳細と価格を取得
        const resultItems = sortedCodes.map(code => {
            const product = productMaster.find(p => p.productCode === code);
            if (!product || product.active === false) return null;

            const specialPriceEntry = priceList.find(p => p.customerId === customerId && p.productCode === code);
            const productWithRank = { ...product, rankPrices: rankPriceMap[code] || {} };
            const finalPrice = calculateFinalPrice(productWithRank, myRank, specialPriceEntry);

            const freq = frequencyMap[code];
            return {
                ...product,
                price: finalPrice,
                isSpecialPrice: !!specialPriceEntry,
                orderCount: freq.count,
                totalOrderedQty: freq.totalQty,
                lastOrdered: freq.lastOrdered ? freq.lastOrdered.toISOString() : null,
                stockInfo: buildStockInfo(product.productCode, stockMap, stockUi)
            };
        }).filter(item => item !== null);

        res.json({
            items: resultItems,
            totalFrequentItems: resultItems.length,
            stockUi
        });

    } catch (error) {
        console.error("Frequent Products Error:", error);
        res.status(500).json({ message: "データの取得に失敗しました" });
    }
});

// =================================================================
// 📥 5. 価格表ダウンロード API
// =================================================================
// ★修正: /api を削除 (/download-my-pricelist)
router.get("/download-my-pricelist", async (req, res) => {
    if (!req.session.customerId) return res.status(401).send("ログインが必要です");

    const customerId = req.session.customerId;
    const myRank = req.session.priceRank || "";

    try {
        const [productData, pricesData, rankData] = await Promise.all([
            fs.readFile(PRODUCTS_DB_PATH, "utf-8"),
            fs.readFile(PRICES_DB_PATH, "utf-8"),
            fs.readFile(RANK_PRICES_DB_PATH, "utf-8").catch(() => "{}")
        ]);

        const productMaster = JSON.parse(productData);
        const priceList = JSON.parse(pricesData);
        const rankPriceMap = JSON.parse(rankData);

        const headers = "商品コード,商品名,メーカー,規格,貴社提供価格\n";
        const csvRows = [];

        productMaster.forEach(product => {
            if (!rankPriceMap[product.productCode]) return;
            const specialPriceEntry = priceList.find(p => p.customerId === customerId && p.productCode === product.productCode);
            const productWithRank = { ...product, rankPrices: rankPriceMap[product.productCode] || {} };
            const finalPrice = calculateFinalPrice(productWithRank, myRank, specialPriceEntry);

            if (finalPrice === 0) return;

            const row = `${product.productCode},"${product.name}",${product.manufacturer || ""},${product.category || ""},${finalPrice}`;
            csvRows.push(row);
        });

        const csvData = "\uFEFF" + headers + csvRows.join("\n");
        const filename = encodeURIComponent("最新価格表.csv");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
        res.send(csvData);

    } catch (error) {
        console.error(error);
        res.status(500).send("CSV生成エラー");
    }
});

module.exports = router;