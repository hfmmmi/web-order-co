// public/js/products.js
// 商品一覧画面の制御：検索、ページネーション、カート、および見積番号検索

let cart = [];
// 現在表示中の商品リスト（カート追加時に詳細情報を参照するため保持）
let currentProductList = [];
// 現在のタブ状態
let currentTab = "all"; // "all" | "frequent" | "favorites"
// お気に入りリスト（ローカル管理用）
let favoriteList = [];
let stockUiConfig = {
    enabled: false,
    hiddenMessage: "",
    stocklessLabel: "",
    showStocklessLabel: true,
    allowOrderingWhenZero: true,
    highlightThresholdMinutes: 180
};

// ★追加: 外部サイトに頼らない、埋め込み型の「No Image」画像データ (SVG)
const NO_IMAGE_DATA_URI = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2250%22%20height%3D%2250%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2050%2050%22%20preserveAspectRatio%3D%22none%22%3E%3Crect%20width%3D%2250%22%20height%3D%2250%22%20style%3D%22fill%3A%23cccccc%3B%22%2F%3E%3Ctext%20x%3D%2225%22%20y%3D%2230%22%20style%3D%22fill%3A%23666666%3Bfont-size%3A10px%3Btext-anchor%3Amiddle%3Bfont-family%3A%27Arial%27%2C%20sans-serif%3B%22%3ENo%20Img%3C%2Ftext%3E%3C%2Fsvg%3E";

function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(String(s == null ? "" : s));
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// =========================================================
// 🚀 初期化処理 (Initialization)
// =========================================================
document.addEventListener("DOMContentLoaded", function () {
    // 1. セッションからカートを復元
    const savedCart = sessionStorage.getItem("cart");
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartBadge();
    }

    // 2. DOM要素の取得
    const searchBtn = document.querySelector("#search-btn");
    const searchInput = document.querySelector("#search-input");
    
    // 見積検索用要素
    const estimateInput = document.querySelector("#estimate-input");
    const estimateSearchBtn = document.querySelector("#estimate-search-btn");
    const estimateBanner = document.querySelector("#estimate-mode-banner");
    const clearEstimateBtn = document.querySelector("#clear-estimate-btn");

    // 3. イベントリスナー設定

    // A. 通常検索
    if (searchBtn) {
        searchBtn.addEventListener("click", () => fetchProducts(1));
    }
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                fetchProducts(1);
            }
        });
    }

    // B. 見積番号検索
    if (estimateSearchBtn) {
        estimateSearchBtn.addEventListener("click", executeEstimateSearch);
    }
    if (estimateInput) {
        estimateInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                executeEstimateSearch();
            }
        });
    }

    // C. 見積モード解除
    if (clearEstimateBtn) {
        clearEstimateBtn.addEventListener("click", exitEstimateMode);
    }

    // D. タブ切り替え
    const productTabs = document.querySelectorAll(".product-tab");
    productTabs.forEach(tab => {
        tab.addEventListener("click", function() {
            const targetTab = this.dataset.tab;
            switchTab(targetTab);
        });
    });

    // E. お気に入りをローカルストレージから復元
    const savedFavorites = localStorage.getItem("favorites");
    if (savedFavorites) {
        try {
            favoriteList = JSON.parse(savedFavorites);
        } catch (e) {
            favoriteList = [];
        }
    }

    // 4. 初回データロード (通常モード)
    fetchProducts(1);
});

// =========================================================
// 🛠️ ヘルパー関数: 検索キーワードの正規化 (Normalize)
// =========================================================
function normalizeString(str) {
    if (!str) return '';
    return str
        // 全角英数字を半角に変換
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        // 大文字を小文字に統一
        .toLowerCase()
        // 前後の空白削除
        .trim();
}

// =========================================================
// 📡 データ取得ロジック (Fetching Logic)
// =========================================================

// 1. 通常の商品一覧取得
async function fetchProducts(page = 1) {
    const listBody = document.querySelector("#product-list-body");
    const paginationContainer = document.querySelector("#pagination-container");
    const searchInput = document.querySelector("#search-input");
    const infoArea = document.querySelector("#search-result-info");
    const estimateBanner = document.querySelector("#estimate-mode-banner");

    // 見積モードの表示をリセット
    if (estimateBanner) estimateBanner.style.display = "none";
    if (infoArea) infoArea.textContent = "";

    // ローディング表示
    listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">データを読み込んでいます...</td></tr>';

    try {
        const rawKeyword = searchInput ? searchInput.value : "";
        // ★修正: 正規化処理を適用 (全角→半角、大文字→小文字)
        const keyword = normalizeString(rawKeyword);
        
        const query = `?page=${page}&limit=10&keyword=${encodeURIComponent(keyword)}`;
        
        // ★APIパス修正: /products
        const response = await fetch(`/products${query}`);
        
        if (response.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        if (data.stockUi) {
            stockUiConfig = { ...stockUiConfig, ...data.stockUi };
        }
        currentProductList = data.items;

        // 検索結果情報の表示
        if (rawKeyword && infoArea) {
            infoArea.textContent = `🔍 "${rawKeyword}" の検索結果: ${data.pagination.totalItems} 件`;
        }

        renderProductList(data.items);
        setupPagination(data.pagination);

    } catch (error) {
        console.error("Fetch Error:", error);
        listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">データの読み込みに失敗しました</td></tr>';
    }
}

// 2. 見積番号による検索
async function executeEstimateSearch() {
    const estimateInput = document.querySelector("#estimate-input");
    const estimateId = estimateInput.value.trim();
    const listBody = document.querySelector("#product-list-body");
    const estimateBanner = document.querySelector("#estimate-mode-banner");
    const currentEstimateIdSpan = document.querySelector("#current-estimate-id");
    const currentEstimateSubject = document.querySelector("#current-estimate-subject");
    const currentEstimateValid = document.querySelector("#current-estimate-valid");
    const paginationContainer = document.querySelector("#pagination-container");
    const infoArea = document.querySelector("#search-result-info");

    if (!estimateId) {
        toastWarning("見積番号を入力してください");
        return;
    }

    // ローディング
    listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">見積データを照会中...</td></tr>';
    
    try {
        // APIパス修正: /products/estimate
        const response = await fetch(`/products/estimate?estimateId=${encodeURIComponent(estimateId)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.stockUi) {
            stockUiConfig = { ...stockUiConfig, ...data.stockUi };
        }

        if (data.items.length === 0) {
            toastInfo(data.message || "該当する見積が見つかりません");
            listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">該当する見積明細はありません。<br>番号、有効期限、顧客IDをご確認ください。</td></tr>';
            if (estimateBanner) estimateBanner.style.display = "none";
            return;
        }

        // 成功時: 見積モードへ切り替え
        currentProductList = data.items;
        
        if (estimateBanner) {
            estimateBanner.style.display = "flex";
            if (currentEstimateIdSpan) currentEstimateIdSpan.textContent = estimateId;
            
            // 件名の表示
            if (currentEstimateSubject && data.estimateInfo && data.estimateInfo.subject) {
                currentEstimateSubject.textContent = `【${data.estimateInfo.subject}】`;
            } else if (currentEstimateSubject) {
                currentEstimateSubject.textContent = "";
            }
            
            // 有効期限の表示
            if (currentEstimateValid && data.estimateInfo && data.estimateInfo.validUntil) {
                const validDate = new Date(data.estimateInfo.validUntil);
                const formattedDate = `${validDate.getFullYear()}/${validDate.getMonth() + 1}/${validDate.getDate()}`;
                currentEstimateValid.textContent = `【有効期限: ${formattedDate}まで】`;
            } else if (currentEstimateValid) {
                currentEstimateValid.textContent = "";
            }
        }

        if (paginationContainer) paginationContainer.innerHTML = "";
        if (infoArea) infoArea.textContent = "";

        renderProductList(data.items, true); 

    } catch (error) {
        console.error("Estimate Fetch Error:", error);
        toastError("通信エラーが発生しました");
        listBody.innerHTML = "";
    }
}

// 3. 見積モード終了
function exitEstimateMode() {
    const estimateInput = document.querySelector("#estimate-input");
    if (estimateInput) estimateInput.value = "";
    currentTab = "all";
    updateTabUI();
    fetchProducts(1);
}

// =========================================================
// 🔄 タブ切り替えロジック (Tab Switching)
// =========================================================
function switchTab(tabName) {
    currentTab = tabName;
    updateTabUI();
    
    // 見積モードを解除
    const estimateBanner = document.querySelector("#estimate-mode-banner");
    if (estimateBanner) estimateBanner.style.display = "none";
    
    // タブに応じてデータを取得
    if (tabName === "all") {
        fetchProducts(1);
    } else if (tabName === "frequent") {
        fetchFrequentProducts();
    } else if (tabName === "favorites") {
        fetchFavoriteProducts();
    }
}

function updateTabUI() {
    const tabs = document.querySelectorAll(".product-tab");
    tabs.forEach(tab => {
        if (tab.dataset.tab === currentTab) {
            tab.style.background = "#007bff";
            tab.style.color = "white";
        } else {
            tab.style.background = "#e9ecef";
            tab.style.color = "#495057";
        }
    });
}

// 4. よく注文する商品を取得
async function fetchFrequentProducts() {
    const listBody = document.querySelector("#product-list-body");
    const paginationContainer = document.querySelector("#pagination-container");
    const infoArea = document.querySelector("#search-result-info");

    listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">よく注文する商品を読み込んでいます...</td></tr>';
    if (paginationContainer) paginationContainer.innerHTML = "";
    if (infoArea) infoArea.textContent = "";

    try {
        const response = await fetch("/products/frequent?limit=30");
        
        if (response.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        if (data.stockUi) {
            stockUiConfig = { ...stockUiConfig, ...data.stockUi };
        }
        currentProductList = data.items;

        if (data.items.length === 0) {
            listBody.innerHTML = `
                <tr><td colspan="6" style="text-align:center; padding:40px;">
                    <div style="font-size: 1.2rem; color: #666; margin-bottom: 10px;">📭 まだ注文履歴がありません</div>
                    <div style="font-size: 0.9rem; color: #999;">商品を注文すると、ここによく注文する商品が表示されます</div>
                </td></tr>
            `;
            return;
        }

        if (infoArea) {
            infoArea.innerHTML = `🔥 <strong>よく注文する商品</strong> (${data.items.length}件) - 注文回数の多い順に表示`;
        }

        renderProductList(data.items, false, true); // isFrequentMode = true

    } catch (error) {
        console.error("Frequent Products Error:", error);
        listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">データの読み込みに失敗しました</td></tr>';
    }
}

// 5. お気に入り商品を取得（Phase 3で完全実装）
async function fetchFavoriteProducts() {
    const listBody = document.querySelector("#product-list-body");
    const paginationContainer = document.querySelector("#pagination-container");
    const infoArea = document.querySelector("#search-result-info");

    if (paginationContainer) paginationContainer.innerHTML = "";

    if (favoriteList.length === 0) {
        listBody.innerHTML = `
            <tr><td colspan="6" style="text-align:center; padding:40px;">
                <div style="font-size: 1.2rem; color: #666; margin-bottom: 10px;">⭐ お気に入りがまだありません</div>
                <div style="font-size: 0.9rem; color: #999;">商品一覧で ☆ マークをクリックしてお気に入りに追加できます</div>
            </td></tr>
        `;
        if (infoArea) infoArea.textContent = "";
        return;
    }

    listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">お気に入り商品を読み込んでいます...</td></tr>';

    try {
        // お気に入り商品を取得するために通常検索を利用（各商品を個別に取得）
        const response = await fetch("/products?limit=1000");
        
        if (!response.ok) throw new Error("Failed to fetch");

        const data = await response.json();
        if (data.stockUi) {
            stockUiConfig = { ...stockUiConfig, ...data.stockUi };
        }
        
        // お気に入りリストにマッチする商品をフィルタ
        const favoriteItems = data.items.filter(p => favoriteList.includes(p.productCode));
        currentProductList = favoriteItems;

        if (infoArea) {
            infoArea.innerHTML = `⭐ <strong>お気に入り商品</strong> (${favoriteItems.length}件)`;
        }

        if (favoriteItems.length === 0) {
            listBody.innerHTML = `
                <tr><td colspan="6" style="text-align:center; padding:40px;">
                    <div style="font-size: 1.2rem; color: #666;">お気に入りの商品が見つかりませんでした</div>
                </td></tr>
            `;
            return;
        }

        renderProductList(favoriteItems, false, false, true); // isFavoriteMode = true

    } catch (error) {
        console.error("Favorite Products Error:", error);
        listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">データの読み込みに失敗しました</td></tr>';
    }
}

function formatStockTimestamp(timestamp) {
    if (!timestamp) return "同期情報なし";
    const dt = new Date(timestamp);
    if (isNaN(dt.getTime())) return "同期情報なし";
    return dt.toLocaleString("ja-JP");
}

function renderStockCell(product) {
    if (!stockUiConfig.enabled) {
        const label = stockUiConfig.hiddenMessage || "";
        return `<div class="stock-hidden-cell">${label}</div>`;
    }
    const info = product.stockInfo || {};
    if (!info.visible) {
        const message = info.message || (stockUiConfig.showStocklessLabel ? stockUiConfig.stocklessLabel : stockUiConfig.hiddenMessage) || "";
        const lockBadge = info.manualLock ? `<span class="stock-lock">LOCK</span>` : "";
        return `<div class="stock-hidden-cell">${message || "-"} ${lockBadge}</div>`;
    }
    const available = Number(info.availableQty) || 0;
    const total = Number(info.totalQty) || 0;
    const reserved = Number(info.reservedQty) || 0;
    const statusClass = available <= 0 ? "stock-zero" : "stock-available";
    const tooltip = formatStockTimestamp(info.lastSyncedAt);
    const staleBadge = info.isStale ? `<span class="stock-stale" title="同期が古い可能性があります">⚠</span>` : "";
    const lockBadge = info.manualLock ? `<span class="stock-lock" title="手動ロック中">LOCK</span>` : "";
    const warehouses = Array.isArray(info.warehouses) ? info.warehouses : [];
    const chips = warehouses.slice(0, 2).map(w => {
        const qty = Number(w.qty) || 0;
        const label = (w.name || w.code || "-").trim() || "-";
        return `<span class="stock-warehouse-chip">${label}:${qty}</span>`;
    }).join("");
    const overflow = warehouses.length > 2 ? `<span class="stock-warehouse-chip">+${warehouses.length - 2}</span>` : "";
    return `
        <div class="stock-cell ${statusClass}" title="${tooltip}">
            <div class="stock-qty">
                ${available}<span class="stock-unit">点</span>
                ${staleBadge}${lockBadge}
            </div>
            <div class="stock-meta">合計 ${total} / 引当 ${reserved}</div>
            ${warehouses.length > 0 ? `<div class="stock-warehouses">${chips}${overflow}</div>` : ""}
        </div>
    `;
}

function shouldDisableOrder(product) {
    if (!stockUiConfig.enabled || stockUiConfig.allowOrderingWhenZero) {
        return false;
    }
    const info = product.stockInfo;
    if (!info) return true;
    if (!info.visible) return true;
    return (Number(info.availableQty) || 0) <= 0;
}

// =========================================================
// 🎨 描画ロジック (Rendering Logic)
// =========================================================

function renderProductList(items, isEstimateMode = false, isFrequentMode = false, isFavoriteMode = false) {
    const listBody = document.querySelector("#product-list-body");
    listBody.innerHTML = "";

    if (!items || items.length === 0) {
        listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">商品が見つかりません</td></tr>';
        return;
    }

    items.forEach(product => {
        const tr = document.createElement("tr");

        // ★修正: 外部サイト(via.placeholder.com)を使わず、埋め込みDataURIを使用
        const imgSrc = product.image && product.image !== "no_image.png" 
            ? `/images/${product.image}` 
            : NO_IMAGE_DATA_URI;

        let priceDisplay = "";
        let badgeDisplay = "";

        if (isEstimateMode) {
            priceDisplay = `<span style="color:#d63384; font-weight:bold; font-size:1.1rem;">¥${product.price.toLocaleString()}</span>`;
            badgeDisplay = `<span class="badge badge-warning" style="background:#ffc107; color:#000;">見積特価</span>`;
        } else if (product.isSpecialPrice) {
            priceDisplay = `<span style="color:#d63384; font-weight:bold;">¥${product.price.toLocaleString()}</span>`;
            badgeDisplay = `<span class="badge badge-info" style="background:#17a2b8; color:#fff;">特別価格</span>`;
        } else {
            priceDisplay = `¥${product.price.toLocaleString()}`;
        }

        // お気に入り状態をチェック
        const isFavorite = favoriteList.includes(product.productCode);
        const favIcon = isFavorite ? "★" : "☆";
        const favBgColor = isFavorite ? "#fff3cd" : "#f8f9fa";
        const favColor = isFavorite ? "#ffc107" : "#adb5bd";
        const favBorder = isFavorite ? "#ffc107" : "#dee2e6";

        // よく注文する商品モードでは注文回数を表示
        let frequentBadge = "";
        if (isFrequentMode && product.orderCount) {
            frequentBadge = `<span style="background: linear-gradient(135deg, #ff6b6b, #ffa500); color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; margin-left: 5px;">🔥 ${product.orderCount}回注文</span>`;
        }

        const stockHtml = renderStockCell(product);
        const disableOrder = shouldDisableOrder(product);
        const priceNum = Number(product.price);
        const isQuoteRequired = priceNum === 0;

        const makerText = esc(product.manufacturer || "—");
        const specText = esc(product.category || "—");
        const codeAttr = escAttr(product.productCode);

        let orderCellInner;
        if (isQuoteRequired) {
            orderCellInner = `
                <div style="display:flex; align-items:center; gap:5px;">
                    <input type="number" min="1" value="1" id="qty-${product.productCode}"
                        style="width:50px; padding:5px; border:1px solid #ddd; border-radius:4px;" disabled title="価格が0円の商品はお問い合わせください">
                    <button type="button" class="btn-quote-request" data-code="${codeAttr}"
                        style="background:#6f42c1; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; white-space:nowrap;" title="見積依頼（サポート）を別タブで開きます">
                        要問合
                    </button>
                </div>`;
        } else {
            orderCellInner = `
                <div style="display:flex; align-items:center; gap:5px;">
                    <input type="number" min="1" value="1" id="qty-${product.productCode}"
                        style="width:50px; padding:5px; border:1px solid #ddd; border-radius:4px;" ${disableOrder ? "disabled" : ""}>
                    <button type="button" class="btn-add-cart" data-code="${codeAttr}"
                        style="background:${disableOrder ? "#adb5bd" : "#007bff"}; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:${disableOrder ? "not-allowed" : "pointer"};" ${disableOrder ? "disabled" : ""}>
                        ${disableOrder ? "在庫なし" : "カート"}
                    </button>
                </div>`;
        }

        tr.innerHTML = `
            <td style="vertical-align:middle; width:110px; text-align:center;">
                <div style="font-weight:bold; font-size:0.95rem; line-height:1.3; word-break:break-word;">${makerText}</div>
                <div style="margin-top:8px;">
                    <img src="${imgSrc}" alt="" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:1px solid #eee;">
                </div>
            </td>
            <td style="vertical-align:middle; min-width:200px;">
                <div style="display:flex; align-items:flex-start; gap:6px;">
                    <button class="btn-favorite" data-code="${codeAttr}"
                        style="background:${favBgColor}; border:1px solid ${favBorder}; border-radius:4px; font-size:1rem; cursor:pointer; color:${favColor}; width:28px; height:28px; min-width:28px; padding:0; flex-shrink:0; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box;"
                        title="${isFavorite ? "お気に入りから削除" : "お気に入りに追加"}">
                        ${favIcon}
                    </button>
                    <div style="flex:1; min-width:0; overflow-wrap:break-word;">
                        <div style="font-weight:bold; font-size:1rem; word-wrap:break-word; overflow-wrap:break-word;">${product.name}</div>
                        <div style="font-size:0.85rem; color:#666; margin-top:2px;">
                            ${esc(product.productCode)} ${badgeDisplay} ${frequentBadge}
                        </div>
                        ${isEstimateMode ? `<div style="font-size:0.8rem; color:#d63384;">有効期限: ${product.validUntil || "不明"}</div>` : ""}
                    </div>
                </div>
            </td>
            <td style="vertical-align:middle; width:100px; font-size:0.9rem; word-break:break-word; color:#333;">
                ${specText}
            </td>
            <td style="font-family:'Arial',sans-serif; width:100px; text-align:right; vertical-align:middle;">
                ${priceDisplay}
            </td>
            <td style="width:140px; vertical-align:middle;">
                ${stockHtml}
            </td>
            <td style="width:140px; vertical-align:middle;">
                ${orderCellInner}
            </td>
        `;

        const quoteBtn = tr.querySelector(".btn-quote-request");
        if (quoteBtn) {
            quoteBtn.addEventListener("click", function () {
                const code = this.getAttribute("data-code");
                const p = currentProductList.find(x => x.productCode === code);
                const q = new URLSearchParams();
                q.set("type", "見積依頼");
                q.set("productCode", code);
                if (p && p.name) q.set("productName", p.name);
                window.open("support.html?" + q.toString(), "_blank", "noopener,noreferrer");
            });
        }

        const addBtn = tr.querySelector(".btn-add-cart");
        if (addBtn && !disableOrder) {
            addBtn.addEventListener("click", function () {
                const code = this.getAttribute("data-code");
                const qtyInput = document.querySelector(`#qty-${code}`);
                const qty = parseInt(qtyInput.value) || 1;
                addToCart(code, qty);
            });
        } else if (addBtn) {
            addBtn.title = "在庫不足のためカート追加不可";
        }

        // お気に入りボタン
        const favBtn = tr.querySelector(".btn-favorite");
        favBtn.addEventListener("click", function() {
            const code = this.getAttribute("data-code");
            toggleFavorite(code, this);
        });

        listBody.appendChild(tr);
    });
}

// =========================================================
// ⭐ お気に入り機能 (Favorite Logic)
// =========================================================
function toggleFavorite(productCode, buttonElement) {
    const index = favoriteList.indexOf(productCode);
    
    if (index === -1) {
        // 追加
        favoriteList.push(productCode);
        buttonElement.textContent = "★";
        buttonElement.style.color = "#ffc107";
        buttonElement.style.background = "#fff3cd";
        buttonElement.style.borderColor = "#ffc107";
        buttonElement.title = "お気に入りから削除";
        toastSuccess("お気に入りに追加しました", 1500);
    } else {
        // 削除
        favoriteList.splice(index, 1);
        buttonElement.textContent = "☆";
        buttonElement.style.color = "#adb5bd";
        buttonElement.style.background = "#f8f9fa";
        buttonElement.style.borderColor = "#dee2e6";
        buttonElement.title = "お気に入りに追加";
        toastInfo("お気に入りから削除しました", 1500);
        
        // お気に入りタブ表示中なら、リストから即座に削除
        if (currentTab === "favorites") {
            buttonElement.closest("tr").remove();
            // 残りが0なら空メッセージ表示
            const listBody = document.querySelector("#product-list-body");
            if (listBody.children.length === 0) {
                listBody.innerHTML = `
                    <tr><td colspan="6" style="text-align:center; padding:40px;">
                        <div style="font-size: 1.2rem; color: #666; margin-bottom: 10px;">⭐ お気に入りがまだありません</div>
                        <div style="font-size: 0.9rem; color: #999;">商品一覧で ☆ マークをクリックしてお気に入りに追加できます</div>
                    </td></tr>
                `;
            }
        }
    }
    
    // ローカルストレージに保存
    localStorage.setItem("favorites", JSON.stringify(favoriteList));
}

// ページネーション生成 (1 2 3 ... 9 ... 154 形式)
function setupPagination(pagination) {
    const container = document.querySelector("#pagination-container");
    if (!container) return;
    
    container.innerHTML = "";

    if (!pagination || pagination.totalPages <= 1) return;

    const current = pagination.currentPage;
    const total = pagination.totalPages;

    if (current > 1) {
        container.appendChild(createPageBtn("前へ", current - 1));
    }

    // 表示するページ番号を決定: 1, 2..9, ..., 中央付近, ..., 末尾
    const pagesToShow = new Set();
    pagesToShow.add(1);
    pagesToShow.add(total);
    // 先頭付近: 2〜9
    for (let p = 2; p <= Math.min(9, total); p++) pagesToShow.add(p);
    // 現在ページの前後
    for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p++) pagesToShow.add(p);

    let sortedPages = Array.from(pagesToShow).filter(p => p > 0 && p <= total).sort((a, b) => a - b);

    let lastPage = 0;
    sortedPages.forEach(p => {
        if (lastPage > 0 && p - lastPage > 1) {
            const dots = document.createElement("span");
            dots.textContent = "...";
            dots.style.padding = "0 5px";
            dots.style.color = "#666";
            container.appendChild(dots);
        }
        
        const btn = createPageBtn(String(p), p);
        if (p === current) {
            btn.style.background = "#007bff";
            btn.style.color = "white";
            btn.style.borderColor = "#007bff";
        }
        container.appendChild(btn);
        lastPage = p;
    });

    if (current < total) {
        container.appendChild(createPageBtn("次へ", current + 1));
    }
}

function createPageBtn(text, pageNum) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.margin = "0 2px";
    btn.style.padding = "5px 10px";
    btn.style.border = "1px solid #ccc";
    btn.style.background = "white";
    btn.style.color = "#333";
    btn.style.cursor = "pointer";
    btn.style.borderRadius = "4px";

    btn.addEventListener("click", () => {
        fetchProducts(pageNum);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return btn;
}

// =========================================================
// 🛒 カート機能 (Cart Logic)
// =========================================================

function addToCart(code, quantity) {
    const product = currentProductList.find(p => p.productCode === code);
    if (!product) {
        toastError("商品情報が見つかりません");
        return;
    }

    const existingItem = cart.find(item => item.productCode === code);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            productCode: product.productCode,
            name: product.name,
            price: product.price, 
            manufacturer: product.manufacturer,
            quantity: quantity,
            image: product.image
        });
    }

    sessionStorage.setItem("cart", JSON.stringify(cart));
    updateCartBadge();
    // トースト通知でカート追加を表示（UX改善：操作を止めない）
    toastSuccess(`${product.name} (${quantity}個) をカートに追加`, 2000);
}

function updateCartBadge() {
    const navCart = document.querySelector(".nav-cart");
    if (!navCart) return;

    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    let badge = navCart.querySelector(".cart-badge");
    if (totalQty > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "cart-badge";
            badge.style.background = "red";
            badge.style.color = "white";
            badge.style.borderRadius = "50%";
            badge.style.padding = "2px 6px";
            badge.style.fontSize = "0.75rem";
            badge.style.marginLeft = "5px";
            navCart.appendChild(badge);
        }
        badge.textContent = totalQty;
    } else {
        if (badge) badge.remove();
    }
}
