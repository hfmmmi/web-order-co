// public/js/admin-products.js
// 管理画面：商品マスタおよび見積・特価データの管理スクリプト

document.addEventListener("DOMContentLoaded", function () {
    console.log("📦 Product Manager Loaded (Extended Edition)");

    // ★追加: 外部サイトに頼らない、埋め込み型の「No Image」画像データ (SVG)
    const NO_IMAGE_DATA_URI = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2250%22%20height%3D%2250%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2050%2050%22%20preserveAspectRatio%3D%22none%22%3E%3Crect%20width%3D%2250%22%20height%3D%2250%22%20style%3D%22fill%3A%23cccccc%3B%22%2F%3E%3Ctext%20x%3D%2225%22%20y%3D%2230%22%20style%3D%22fill%3A%23666666%3Bfont-size%3A10px%3Btext-anchor%3Amiddle%3Bfont-family%3A%27Arial%27%2C%20sans-serif%3B%22%3ENo%20Img%3C%2Ftext%3E%3C%2Fsvg%3E";

    // =========================================================
    // 1. DOM要素の取得 (UI Binding)
    // =========================================================
    const addForm = document.querySelector("#add-product-form");
    
    // 基本情報
    const codeInput = document.querySelector("#product-code");
    const nameInput = document.querySelector("#product-name");
    const manufacturerInput = document.querySelector("#product-manufacturer");
    
    // 属性・条件
    const categoryInput = document.querySelector("#product-category");
    const priceInput = document.querySelector("#product-price");
    const stockSelect = document.querySelector("#product-stock");
    const activeSelect = document.querySelector("#product-active");

    // 操作ボタン・リスト
    const productListContainer = document.querySelector("#admin-product-list");
    const addBtn = document.querySelector("#add-btn");
    const updateButton = document.querySelector("#update-btn");
    const cancelBtn = document.querySelector("#cancel-edit-btn");

    // CSVアップロード用 (商品マスタ)
    const csvFileInput = document.querySelector("#csv-file-input");
    const csvUploadBtn = document.querySelector("#csv-upload-btn");

    // データ保持用メモリ
    let allProducts = [];

    if (window.AdminProductsEstimates && typeof window.AdminProductsEstimates.init === "function") {
        window.AdminProductsEstimates.init();
    }
    if (window.AdminProductsDeleteBatch && typeof window.AdminProductsDeleteBatch.init === "function") {
        window.AdminProductsDeleteBatch.init();
    }

    // =========================================================
    // 🚀 起動シーケンス: 認証完了イベント待ち
    // =========================================================
    document.addEventListener("admin-ready", function() {
        console.log("🚀 Product Manager: Auth Signal Received. Starting fetch...");
        
        // 1. 商品一覧の取得
        fetchProductList();

        if (window.AdminProductsDeleteBatch && typeof window.AdminProductsDeleteBatch.renderDeleteProductList === "function") {
            window.AdminProductsDeleteBatch.renderDeleteProductList();
        }
    });

    // =========================================================
    // 2. 商品データ取得 & 描画 (Product List Logic)
    // =========================================================
    async function fetchProductList() {
        if (!productListContainer) return;
        
        productListContainer.innerHTML = "<p style='padding:10px;'>データを読み込んでいます...</p>";

        try {
            const response = await adminApiFetch("/api/admin/products");
            
            // 未ログイン時は静かに終了
            if (response.status === 401) {
                productListContainer.innerHTML = "<p>認証が必要です。</p>";
                return; 
            }

            if (!response.ok) throw new Error("データ取得失敗");
            
            allProducts = await response.json();
            
            // 検索窓のセットアップ（初回のみ）
            setupSearchBox();

            // 一覧描画
            renderProductList(allProducts);
        } catch (error) {
            console.error(error);
            productListContainer.innerHTML = "<p class='error'>商品データの読み込みに失敗しました。</p>";
        }
    }

    // 検索窓の動的生成
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

        // リアルタイムフィルタリング
        searchInput.addEventListener("input", function(e) {
            const term = e.target.value.normalize("NFKC").toLowerCase();
            const filtered = allProducts.filter(p => {
                const searchTarget = [
                    p.productCode,
                    p.name,
                    p.manufacturer,
                    p.category
                ].map(val => (val || "").toString().normalize("NFKC").toLowerCase()).join(" ");
                
                return searchTarget.includes(term);
            });
            renderProductList(filtered);
        });
    }

    // リスト描画処理
    function renderProductList(products) {
        productListContainer.innerHTML = "";
        
        if (products.length === 0) {
            productListContainer.innerHTML = "<div style='padding:10px; color:#999;'>一致する商品はありません</div>";
            return;
        }

        // 描画負荷軽減のため先頭100件のみ表示
        const displayLimit = 100;
        const itemsToShow = products.slice(0, displayLimit);

        itemsToShow.forEach(product => {
            const div = document.createElement("div");
            div.className = "product-item-admin";
            div.style.borderBottom = "1px solid #eee";
            div.style.padding = "10px";
            div.style.backgroundColor = product.active === false ? "#f8d7da" : "#fff"; // 非表示は赤背景
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";
            div.style.cursor = "pointer";

            // 画像 (管理画面でも表示する場合に備えて定数化)
            // 現状のHTML構造では画像表示エリアはないが、将来的な拡張に備えて定義しておく
            // const imgSrc = product.image && product.image !== "no_image.png" ? `/images/${product.image}` : NO_IMAGE_DATA_URI;

            // 情報表示の組み立て
            const makerTag = product.manufacturer ? `<span class="badge badge-info">${product.manufacturer}</span>` : "";
            const catTag = product.category ? `<span class="badge badge-secondary">${product.category}</span>` : "";
            const stockTag = product.stockStatus ? `<span style="font-size:0.8rem; color:#28a745;">[${product.stockStatus}]</span>` : "";
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
                <button class="btn-delete" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:3px; margin-left:10px;">削除</button>
            `;

            // クリックで編集モードへ
            div.addEventListener("click", function () {
                enterEditMode(product);
            });

            // 削除ボタン
            const deleteBtn = div.querySelector(".btn-delete");
            deleteBtn.addEventListener("click", function (event) {
                event.stopPropagation();
                if (confirm(`【削除確認】\n商品名: ${product.name}\n\n本当に削除しますか？\n(※SaaS運用では「非表示」推奨です)`)) {
                    deleteProduct(product.productCode);
                }
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

    // =========================================================
    // 3. 編集モード制御 (UI Logic)
    // =========================================================
    function enterEditMode(product) {
        // フォームに値をセット
        codeInput.value = product.productCode || "";
        nameInput.value = product.name || "";
        manufacturerInput.value = product.manufacturer || "";
        categoryInput.value = product.category || "";
        priceInput.value = product.basePrice || 0;
        
        if (stockSelect) stockSelect.value = product.stockStatus || "";
        
        if (activeSelect) {
            const isActive = product.hasOwnProperty('active') ? product.active : true;
            activeSelect.value = isActive.toString();
        }

        // 商品コードはキーなので編集不可にする（誤更新防止）
        codeInput.readOnly = true;
        codeInput.style.backgroundColor = "#e9ecef";

        // ボタンの切り替え
        addBtn.style.display = "none";
        updateButton.style.display = "inline-block";
        cancelBtn.style.display = "inline-block";

        // フォームへスクロール
        addForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function resetFormMode() {
        addForm.reset();
        codeInput.readOnly = false;
        codeInput.style.backgroundColor = "";
        
        addBtn.style.display = "inline-block";
        updateButton.style.display = "none";
        cancelBtn.style.display = "none";
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", resetFormMode);
    }

    // =========================================================
    // 4. データ保存処理 (Product API Connector)
    // =========================================================
    
    // 共通：フォームデータからオブジェクトを生成
    function getFormData() {
        return {
            productCode: codeInput.value.trim(),
            name: nameInput.value.trim(),
            manufacturer: manufacturerInput.value.trim(),
            category: categoryInput.value.trim(),
            basePrice: parseInt(priceInput.value) || 0,
            stockStatus: stockSelect.value, 
            active: activeSelect.value === "true"
        };
    }

    // 新規追加
    if (addForm) {
        addForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            
            if (updateButton.style.display !== "none") return;

            const newProduct = getFormData();
            if (!newProduct.productCode || !newProduct.name) {
                toastWarning("商品コードと商品名は必須です");
                return;
            }

            try {
                const response = await adminApiFetch("/api/add-product", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newProduct)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("商品を追加しました");
                    fetchProductList();
                    resetFormMode();
                } else {
                    toastError("エラー: " + data.message);
                }
            } catch (error) { toastError("通信エラーが発生しました"); }
        });
    }

    // 更新実行
    if (updateButton) {
        updateButton.addEventListener("click", async function () {
            const updateData = getFormData();
            
            try {
                const response = await adminApiFetch("/api/update-product", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updateData)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("商品情報を更新しました");
                    fetchProductList();
                    resetFormMode();
                } else {
                    toastError("更新失敗: " + data.message);
                }
            } catch (error) { toastError("通信エラーが発生しました"); }
        });
    }

    // 削除実行
    async function deleteProduct(productCode) {
        try {
            const response = await adminApiFetch("/api/delete-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productCode: productCode })
            });
            const data = await response.json();
            if (data.success) {
                toastSuccess("削除しました");
                fetchProductList();
                resetFormMode();
            } else {
                toastError("削除失敗: " + data.message);
            }
        } catch (error) { toastError("通信エラーが発生しました"); }
    }

    // 商品マスタCSVアップロード
    if (csvUploadBtn) {
        csvUploadBtn.addEventListener("click", function () {
            const file = csvFileInput.files[0];
            if (!file) { toastWarning("ファイルを選択してください"); return; }
            
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
                    csvUploadBtn.textContent = "一括登録";
                }
            };
        });
    }

    // 商品マスタ：テンプレート・マスタ全件ダウンロード
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