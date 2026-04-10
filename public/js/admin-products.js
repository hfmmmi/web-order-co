// public/js/admin-products.js
// 管理画面：商品マスタの管理スクリプト（見積・特価管理は admin-estimates.html）

document.addEventListener("DOMContentLoaded", function () {
    console.log("📦 Product Manager Loaded (Extended Edition)");

    const productListContainer = document.querySelector("#admin-product-list");

    const csvFileInput = document.querySelector("#csv-file-input");
    const csvExcelHeaderBtn = document.getElementById("btn-product-csv-excel");

    csvExcelHeaderBtn?.addEventListener("click", function () {
        csvFileInput?.click();
    });

    let allProducts = [];
    /** @type {{ id: string, name: string }[]} */
    let rankListMeta = [];

    function escHtml(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    document.addEventListener("admin-ready", function () {
        console.log("🚀 Product Manager: Auth Signal Received. Starting fetch...");

        fetchProductList();
    });

    async function fetchProductList() {
        if (!productListContainer) return;

        productListContainer.innerHTML = "<p style='padding:10px;'>データを読み込んでいます...</p>";

        try {
            const [response, rankRes] = await Promise.all([
                adminApiFetch("/api/admin/products"),
                adminApiFetch("/api/admin/rank-list")
            ]);

            if (response.status === 401) {
                productListContainer.innerHTML = "<p>認証が必要です。</p>";
                return;
            }

            if (!response.ok) throw new Error("データ取得失敗");

            allProducts = await response.json();
            if (rankRes.ok) {
                rankListMeta = await rankRes.json();
            } else {
                rankListMeta = [];
            }

            setupSearchBox();

            renderProductList(allProducts);
        } catch (error) {
            console.error(error);
            productListContainer.innerHTML = "<p class='error'>商品データの読み込みに失敗しました。</p>";
        }
    }

    function setupSearchBox() {
        if (document.getElementById("admin-prod-dynamic-search")) return;

        const searchMount = document.getElementById("admin-product-search-mount");
        if (!searchMount) return;

        const searchIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        searchIcon.setAttribute("class", "admin-product-list-search-icon");
        searchIcon.setAttribute("viewBox", "0 0 24 24");
        searchIcon.setAttribute("width", "16");
        searchIcon.setAttribute("height", "16");
        searchIcon.setAttribute("aria-hidden", "true");
        const searchIconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        searchIconPath.setAttribute("fill", "currentColor");
        searchIconPath.setAttribute(
            "d",
            "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        );
        searchIcon.appendChild(searchIconPath);

        const searchInput = document.createElement("input");
        searchInput.id = "admin-prod-dynamic-search";
        searchInput.type = "text";
        searchInput.className = "admin-product-list-search-field";
        searchInput.placeholder = "コード、商品名、メーカー、仕様、備考、ランク価格で検索…";
        searchInput.setAttribute("aria-label", "コード、商品名、メーカー、仕様、備考、ランク価格で検索");

        searchMount.appendChild(searchIcon);
        searchMount.appendChild(searchInput);

        searchInput.addEventListener("input", function (e) {
            const term = e.target.value.normalize("NFKC").toLowerCase();
            const filtered = allProducts.filter((p) => {
                const rankBits = Object.entries(p.mergedRankPrices || {}).map(
                    ([id, v]) => `${id}${v}`.toLowerCase()
                );
                const searchTarget = [
                    p.productCode,
                    p.name,
                    p.manufacturer,
                    p.category,
                    p.remarks,
                    ...rankBits
                ]
                    .map((val) => (val || "").toString().normalize("NFKC").toLowerCase())
                    .join(" ");

                return searchTarget.includes(term);
            });
            renderProductList(filtered);
        });
    }

    function openProductEditor(product) {
        const code = encodeURIComponent(product.productCode || "");
        if (!code) return;
        const url = `admin-products-new.html?edit=${code}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    function formatMergedRankLine(product) {
        const prices = product.mergedRankPrices || {};
        const keys = Object.keys(prices);
        if (keys.length === 0) return "";
        if (rankListMeta.length) {
            const parts = rankListMeta
                .map((r) => {
                    const v = prices[r.id];
                    if (v == null) return null;
                    return `${escHtml(r.name)}: ¥${Number(v).toLocaleString()}`;
                })
                .filter(Boolean);
            return parts.length ? parts.join(" · ") : "";
        }
        return keys
            .sort()
            .map((id) => `${escHtml(id)}: ¥${Number(prices[id]).toLocaleString()}`)
            .join(" · ");
    }

    function renderProductList(products) {
        productListContainer.innerHTML = "";

        if (products.length === 0) {
            productListContainer.innerHTML = "<div style='padding:10px; color:#999;'>一致する商品はありません</div>";
            return;
        }

        const displayLimit = 100;
        const itemsToShow = products.slice(0, displayLimit);

        itemsToShow.forEach((product) => {
            const div = document.createElement("div");
            div.className = "product-item-admin";
            div.style.borderBottom = "1px solid #e5e7eb";
            div.style.padding = "10px 12px";
            div.style.backgroundColor = product.active === false ? "#f8d7da" : "#fff";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";
            div.style.gap = "calc(10px + 1ch)";
            div.style.fontSize = "0.9rem";

            const makerTag = product.manufacturer ? `<span class="badge badge-info">${escHtml(product.manufacturer)}</span>` : "";
            const catTag = product.category ? `<span class="badge badge-secondary">${escHtml(product.category)}</span>` : "";
            const stockTag = product.stockStatus
                ? `<span style="font-size:0.8rem; color:#28a745;">[${escHtml(product.stockStatus)}]</span>`
                : "";
            const statusTag = product.active === false ? "<span style='color:red; font-weight:bold;'>[非表示]</span>" : "";
            const rankLine = formatMergedRankLine(product);
            const remarksRaw = product.remarks != null ? String(product.remarks).trim() : "";
            const remarksBlock =
                remarksRaw !== ""
                    ? `<div style="font-size:0.8rem; color:#4b5563; margin-top:4px; line-height:1.4;" title="${escHtml(
                          remarksRaw
                      )}"><span style="color:#6b7280;">備考:</span> ${escHtml(remarksRaw)}</div>`
                    : "";
            const rankBlock =
                rankLine !== ""
                    ? `<div style="font-size:0.8rem; color:#1e40af; margin-top:4px; line-height:1.45; font-variant-numeric:tabular-nums;"><span style="color:#3b82f6;">ランク別:</span> ${rankLine}</div>`
                    : "";

            div.innerHTML = `
                <div style="flex-grow:1; min-width:0;">
                    <div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 16px; line-height:1.35;">
                        <div style="font-size:0.85rem; color:#666; flex:0 1 auto;">
                            ${escHtml(product.productCode)} ${makerTag} ${catTag} ${stockTag}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 14px; flex:1; min-width:min(200px, 100%); color:#111827;">
                            <div style="font-weight:600; flex:1; min-width:min(140px, 100%);">
                                ${statusTag} ${escHtml(product.name)}
                            </div>
                            <div style="white-space:nowrap; font-variant-numeric:tabular-nums; flex-shrink:0;">
                                定価: ¥${(product.basePrice || 0).toLocaleString()}
                            </div>
                        </div>
                    </div>
                    ${rankBlock}
                    ${remarksBlock}
                </div>
                <button type="button" class="btn-edit-row" style="background:#2563eb; color:white; border:none; padding:6px 10px; border-radius:6px; flex-shrink:0; font-weight:600; font-size:0.875rem; cursor:pointer;">編集</button>
            `;

            const editBtn = div.querySelector(".btn-edit-row");
            editBtn.addEventListener("click", function (event) {
                event.stopPropagation();
                openProductEditor(product);
            });

            productListContainer.appendChild(div);
        });

        if (products.length > displayLimit) {
            const msg = document.createElement("div");
            msg.style.textAlign = "center";
            msg.style.padding = "10px";
            msg.style.color = "#666";
            msg.innerHTML = `他 ${products.length - displayLimit} 件ヒットしています。検索で絞り込んでください。`;
            productListContainer.appendChild(msg);
        }
    }

    if (csvFileInput) {
        csvFileInput.addEventListener("change", function () {
            const file = csvFileInput.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async function (event) {
                try {
                    const base64Data = event.target.result.split(",")[1];
                    if (csvExcelHeaderBtn) {
                        csvExcelHeaderBtn.disabled = true;
                        csvExcelHeaderBtn.textContent = "処理中...";
                    }

                    const response = await adminApiFetch("/api/upload-product-data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileData: base64Data })
                    });
                    const data = await response.json();

                    if (data.success) {
                        toastSuccess(data.message, 4000);
                        fetchProductList();
                    } else {
                        toastError("取込失敗: " + data.message);
                    }
                } catch (error) {
                    console.error(error);
                    toastError("通信エラーまたはファイル形式エラー");
                } finally {
                    csvFileInput.value = "";
                    if (csvExcelHeaderBtn) {
                        csvExcelHeaderBtn.disabled = false;
                        csvExcelHeaderBtn.textContent = "CSV/Excel ↑";
                    }
                }
            };
        });
    }

    document.querySelectorAll(".js-product-template-dl").forEach(function (btn) {
        btn.addEventListener("click", function () {
            window.location.href = "/api/admin/product-master/template";
        });
    });
    document.querySelectorAll(".js-product-export-dl").forEach(function (btn) {
        btn.addEventListener("click", function () {
            window.location.href = "/api/admin/product-master/export";
        });
    });
});
