// public/js/admin-products.js
// 管理画面：商品マスタおよび見積・特価データの管理スクリプト

document.addEventListener("DOMContentLoaded", function () {
    console.log("📦 Product Manager Loaded (Extended Edition)");

    const productListContainer = document.querySelector("#admin-product-list");

    const csvFileInput = document.querySelector("#csv-file-input");
    const csvUploadBtn = document.querySelector("#csv-upload-btn");

    let allProducts = [];

    if (window.AdminProductsEstimates && typeof window.AdminProductsEstimates.init === "function") {
        window.AdminProductsEstimates.init();
    }
    if (window.AdminProductsDeleteBatch && typeof window.AdminProductsDeleteBatch.init === "function") {
        window.AdminProductsDeleteBatch.init();
    }

    document.addEventListener("admin-ready", function () {
        console.log("🚀 Product Manager: Auth Signal Received. Starting fetch...");

        fetchProductList();

        if (window.AdminProductsDeleteBatch && typeof window.AdminProductsDeleteBatch.renderDeleteProductList === "function") {
            window.AdminProductsDeleteBatch.renderDeleteProductList();
        }
    });

    async function fetchProductList() {
        if (!productListContainer) return;

        productListContainer.innerHTML = "<p style='padding:10px;'>データを読み込んでいます...</p>";

        try {
            const response = await adminApiFetch("/api/admin/products");

            if (response.status === 401) {
                productListContainer.innerHTML = "<p>認証が必要です。</p>";
                return;
            }

            if (!response.ok) throw new Error("データ取得失敗");

            allProducts = await response.json();

            setupSearchBox();

            renderProductList(allProducts);
        } catch (error) {
            console.error(error);
            productListContainer.innerHTML = "<p class='error'>商品データの読み込みに失敗しました。</p>";
        }
    }

    function setupSearchBox() {
        if (document.getElementById("admin-prod-dynamic-search")) return;

        const searchWrapper = document.createElement("div");
        searchWrapper.style.marginBottom = "10px";
        searchWrapper.style.padding = "0 5px";

        const searchInput = document.createElement("input");
        searchInput.id = "admin-prod-dynamic-search";
        searchInput.type = "text";
        searchInput.placeholder = "🔍 コード、商品名、メーカー、カテゴリで検索...";
        searchInput.style.width = "100%";
        searchInput.style.padding = "10px";
        searchInput.style.border = "2px solid #007bff";
        searchInput.style.borderRadius = "4px";

        searchWrapper.appendChild(searchInput);
        productListContainer.parentNode.insertBefore(searchWrapper, productListContainer);

        searchInput.addEventListener("input", function (e) {
            const term = e.target.value.normalize("NFKC").toLowerCase();
            const filtered = allProducts.filter((p) => {
                const searchTarget = [p.productCode, p.name, p.manufacturer, p.category]
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
            div.style.borderBottom = "1px solid #eee";
            div.style.padding = "10px";
            div.style.backgroundColor = product.active === false ? "#f8d7da" : "#fff";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";

            const makerTag = product.manufacturer ? `<span class="badge badge-info">${product.manufacturer}</span>` : "";
            const catTag = product.category ? `<span class="badge badge-secondary">${product.category}</span>` : "";
            const stockTag = product.stockStatus
                ? `<span style="font-size:0.8rem; color:#28a745;">[${product.stockStatus}]</span>`
                : "";
            const statusTag = product.active === false ? "<span style='color:red; font-weight:bold;'>[非表示]</span>" : "";

            div.innerHTML = `
                <div style="flex-grow:1;">
                    <div style="font-size:0.85rem; color:#666;">
                        ${product.productCode} ${makerTag} ${catTag}
                    </div>
                    <div style="font-weight:bold; margin:2px 0;">
                        ${statusTag} ${product.name}
                    </div>
                    <div style="font-size:0.9rem;">
                        定価: ¥${(product.basePrice || 0).toLocaleString()} ${stockTag}
                    </div>
                </div>
                <button type="button" class="btn-edit-row" style="background:#2563eb; color:white; border:none; padding:5px 12px; border-radius:6px; margin-left:10px; font-weight:600; cursor:pointer;">編集</button>
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

    if (csvUploadBtn) {
        csvUploadBtn.addEventListener("click", function () {
            const file = csvFileInput.files[0];
            if (!file) {
                toastWarning("ファイルを選択してください");
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async function (event) {
                try {
                    const base64Data = event.target.result.split(",")[1];
                    csvUploadBtn.disabled = true;
                    csvUploadBtn.textContent = "処理中...";

                    const response = await adminApiFetch("/api/upload-product-data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileData: base64Data })
                    });
                    const data = await response.json();

                    if (data.success) {
                        toastSuccess(data.message, 4000);
                        fetchProductList();
                        csvFileInput.value = "";
                    } else {
                        toastError("取込失敗: " + data.message);
                    }
                } catch (error) {
                    console.error(error);
                    toastError("通信エラーまたはファイル形式エラー");
                } finally {
                    csvUploadBtn.disabled = false;
                    csvUploadBtn.textContent = "一括登録を実行";
                }
            };
        });
    }

    const productTemplateDlBtn = document.querySelector("#product-template-dl-btn");
    const productExportDlBtn = document.querySelector("#product-export-dl-btn");
    if (productTemplateDlBtn) {
        productTemplateDlBtn.addEventListener("click", function () {
            window.location.href = "/api/admin/product-master/template";
        });
    }
    if (productExportDlBtn) {
        productExportDlBtn.addEventListener("click", function () {
            window.location.href = "/api/admin/product-master/export";
        });
    }
});
