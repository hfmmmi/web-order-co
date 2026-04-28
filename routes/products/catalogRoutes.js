// routes/products/catalogRoutes.js
// 顧客向け商品・見積・カート・価格表DL（元 routes/products-api.js）
const express = require("express");
const router = express.Router();
const fs = require("fs").promises;

const { calculateFinalPrice } = require("../../utils/priceCalc");
const { buildStockInfo, getStockContext } = require("../../utils/stockPresentation");
const specialPriceService = require("../../services/specialPriceService");

const { dbPath } = require("../../dbPaths");
const PRODUCTS_DB_PATH = dbPath("products.json");
const PRICES_DB_PATH = dbPath("prices.json");
const RANK_PRICES_DB_PATH = dbPath("rank_prices.json");

/** 価格表CSV・一覧API共通：ランク適用後の販売価格が0より大きい行のみ */
async function buildMyPricelistRows(customerId, myRank) {
    const [productData, pricesData, rankData] = await Promise.all([
        fs.readFile(PRODUCTS_DB_PATH, "utf-8"),
        fs.readFile(PRICES_DB_PATH, "utf-8"),
        fs.readFile(RANK_PRICES_DB_PATH, "utf-8").catch(() => "{}")
    ]);

    const productMaster = JSON.parse(productData);
    const priceList = JSON.parse(pricesData);
    const rankPriceMap = JSON.parse(rankData);

    const rows = [];
    productMaster.forEach(product => {
        if (!rankPriceMap[product.productCode]) return;
        const specialPriceEntry = priceList.find(p => p.customerId === customerId && p.productCode === product.productCode);
        const productWithRank = { ...product, rankPrices: rankPriceMap[product.productCode] || {} };
        const finalPrice = calculateFinalPrice(productWithRank, myRank, specialPriceEntry);

        if (finalPrice === 0) return;

        rows.push({
            productCode: product.productCode,
            name: product.name,
            manufacturer: product.manufacturer || "",
            category: product.category || "",
            price: finalPrice
        });
    });

    return rows;
}

router.get("/products", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const keyword = req.query.keyword || "";
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

        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / limit);
        const startIndex = (page - 1) * limit;
        const paginatedItems = filtered.slice(startIndex, startIndex + limit);

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

router.post("/cart-details", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "Auth Required" });

    const cartItems = req.body.cart;
    if (!Array.isArray(cartItems)) return res.status(400).json({ success: false, message: "Invalid Data" });

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

        const details = cartItems.map(item => {
            const product = productMaster.find(p => p.productCode === item.productCode);
            if (!product) return null;

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

router.get("/products/frequent", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    const customerId = req.session.customerId;
    const myRank = req.session.priceRank || "";
    const limit = parseInt(req.query.limit) || 20;

    try {
        const ORDERS_DB_PATH = dbPath("orders.json");
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

        const frequencyMap = {};

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

                    if (!frequencyMap[code].lastOrdered || orderDate > frequencyMap[code].lastOrdered) {
                        frequencyMap[code].lastOrdered = orderDate;
                    }
                });
            });

        const sortedCodes = Object.entries(frequencyMap)
            .filter(([code]) => rankPriceMap[code])
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([code]) => code);

        if (sortedCodes.length === 0) {
            return res.json({
                items: [],
                message: "まだ注文履歴がありません"
            });
        }

        const { stockMap, stockUi } = await getStockContext();

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

router.get("/download-my-pricelist", async (req, res) => {
    if (!req.session.customerId) return res.status(401).send("ログインが必要です");

    const customerId = req.session.customerId;
    const myRank = req.session.priceRank || "";

    try {
        const rows = await buildMyPricelistRows(customerId, myRank);

        const headers = "商品コード,商品名,メーカー,規格,貴社提供価格\n";
        const csvRows = rows.map(r => {
            const safeName = String(r.name || "").replace(/"/g, '""');
            return `${r.productCode},"${safeName}",${r.manufacturer},${r.category},${r.price}`;
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

/** 価格表をブラウザ一覧表示するためのJSON（ダウンロードと同一ロジック） */
router.get("/my-pricelist-data", async (req, res) => {
    if (!req.session.customerId) return res.status(401).json({ message: "ログインが必要です" });

    try {
        const rows = await buildMyPricelistRows(req.session.customerId, req.session.priceRank || "");
        res.json({ rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "データの取得に失敗しました" });
    }
});

module.exports = router;
