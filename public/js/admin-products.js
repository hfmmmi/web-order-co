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

    // 見積インポート用 (新規追加)
    const estimateFileInput = document.querySelector("#estimate-file-input");
    const estimateUploadBtn = document.querySelector("#estimate-upload-btn");

    // メーカー別見積削除用
    const deleteManufacturerInput = document.querySelector("#delete-manufacturer-input");
    const deleteManufacturerBtn = document.querySelector("#delete-manufacturer-btn");

    // 商品コード別見積削除用
    const deleteProductInput = document.querySelector("#delete-product-input");
    const addDeleteProductBtn = document.querySelector("#add-delete-product-btn");
    const deleteProductCsvInput = document.querySelector("#delete-product-csv-input");
    const importDeleteProductBtn = document.querySelector("#import-delete-product-btn");
    const deleteProductListContainer = document.querySelector("#delete-product-list");
    const deleteProductCountSpan = document.querySelector("#delete-product-count");
    const clearDeleteProductBtn = document.querySelector("#clear-delete-product-btn");
    const execDeleteProductBtn = document.querySelector("#exec-delete-product-btn");

    // 在庫管理UI
    const stockDisplayToggle = document.querySelector("#stock-display-toggle");
    const stockHiddenMessageInput = document.querySelector("#stock-hidden-message");
    const stockStocklessLabelInput = document.querySelector("#stock-stockless-label");
    const stockAllowZeroCheckbox = document.querySelector("#stock-allow-zero");
    const stockHighlightInput = document.querySelector("#stock-highlight-minutes");
    const stockSaveSettingsBtn = document.querySelector("#stock-save-settings");
    const stockSettingsStatus = document.querySelector("#stock-settings-status");
    const addWarehousePresetBtn = document.querySelector("#add-warehouse-preset");
    const warehousePresetList = document.querySelector("#warehouse-preset-list");

    const stockCsvInput = document.querySelector("#stock-csv-input");
    const stockImportBtn = document.querySelector("#stock-import-btn");
    const stockTemplateBtn = document.querySelector("#stock-template-btn");
    const stockImportStatus = document.querySelector("#stock-import-status");
    const stockHistoryBody = document.querySelector("#stock-history-body");

    const stockManualForm = document.querySelector("#stock-manual-form");
    const manualCodeInput = document.querySelector("#manual-stock-code");
    const manualTotalInput = document.querySelector("#manual-total-qty");
    const manualReservedInput = document.querySelector("#manual-reserved-qty");
    const manualPublishSelect = document.querySelector("#manual-publish");
    const manualHiddenInput = document.querySelector("#manual-hidden-message");
    const manualLockCheckbox = document.querySelector("#manual-lock-flag");
    const loadStockBtn = document.querySelector("#load-stock-btn");
    const addWarehouseRowBtn = document.querySelector("#add-warehouse-row");
    const warehouseList = document.querySelector("#warehouse-list");
    const warehouseListHeader = document.querySelector("#warehouse-list-header");
    const manualStockStatus = document.querySelector("#manual-stock-status");

    // データ保持用メモリ
    let allProducts = [];
    let deleteProductCodes = [];  // 削除予定の商品コードリスト
    let currentStockDisplay = null;

    // =========================================================
    // 🚀 起動シーケンス: 認証完了イベント待ち
    // =========================================================
    document.addEventListener("admin-ready", function() {
        console.log("🚀 Product Manager: Auth Signal Received. Starting fetch...");
        
        // 1. 商品一覧の取得
        fetchProductList();

        // 2. 削除予定リストの初期描画
        renderDeleteProductList();

        // 3. 在庫設定読み込み
        loadStockSettings();
        loadStockHistory();
    });

    // =========================================================
    // 2. 商品データ取得 & 描画 (Product List Logic)
    // =========================================================
    async function fetchProductList() {
        if (!productListContainer) return;
        
        productListContainer.innerHTML = "<p style='padding:10px;'>データを読み込んでいます...</p>";

        try {
            const response = await fetch("/api/admin/products");
            
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
                const response = await fetch("/api/add-product", {
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
                const response = await fetch("/api/update-product", {
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
            const response = await fetch("/api/delete-product", {
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

                    const response = await fetch("/api/upload-product-data", {
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

    // =========================================================
    // 5. 見積・特価データ管理 (Estimate & Special Prices)
    // =========================================================

    // A. 見積データのインポート
    if (estimateUploadBtn) {
        estimateUploadBtn.addEventListener("click", async function() {
            const file = estimateFileInput.files[0];
            if (!file) {
                toastWarning("ファイルを選択してください");
                return;
            }

            // UIロック
            estimateUploadBtn.disabled = true;
            estimateUploadBtn.textContent = "送信中...";

            // ファイル送信にはFormDataを使用
            const formData = new FormData();
            formData.append("estimateFile", file);

            try {
                // admin-api.jsのルートに合わせる (/api/admin/...)
                const response = await fetch("/api/admin/import-estimates", {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();
                if (data.success) {
                    toastSuccess(data.message, 4000);
                    estimateFileInput.value = ""; // クリア
                } else {
                    toastError("エラー: " + data.message);
                }
            } catch (error) {
                console.error(error);
                toastError("通信エラーが発生しました");
            } finally {
                estimateUploadBtn.disabled = false;
                estimateUploadBtn.textContent = "見積データを取り込む";
            }
        });
    }

    // =========================================================
    // 6. メーカー別見積削除（商品名から部分一致で判定）
    // =========================================================
    if (deleteManufacturerBtn) {
        deleteManufacturerBtn.addEventListener("click", async function() {
            const manufacturer = deleteManufacturerInput.value.trim();
            if (!manufacturer) {
                toastWarning("メーカー名を入力してください");
                return;
            }

            // 確認ダイアログ（重要な操作なのでconfirm維持）
            const confirmMsg = `【⚠️ 削除確認】\n\n商品名に「${manufacturer}」を含む見積データをすべて削除します。\n（大文字/小文字は区別しません）\n\nこの操作は取り消せません。\n本当に削除しますか？`;
            if (!confirm(confirmMsg)) return;

            // 二重確認（重要な操作なのでprompt維持）
            const doubleCheck = prompt(`削除を実行するには「${manufacturer}」と入力してください：`);
            if (doubleCheck !== manufacturer) {
                toastWarning("入力が一致しません。削除をキャンセルしました。");
                return;
            }

            deleteManufacturerBtn.disabled = true;
            deleteManufacturerBtn.textContent = "削除中...";

            try {
                const response = await fetch("/api/admin/delete-estimates-by-manufacturer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ manufacturer: manufacturer })
                });

                const data = await response.json();
                if (data.success) {
                    toastSuccess(`「${manufacturer}」を含む見積を ${data.deletedCount} 件削除しました`, 4000);
                    deleteManufacturerInput.value = "";
                } else {
                    toastError("削除失敗: " + data.message);
                }
            } catch (e) {
                console.error(e);
                toastError("通信エラーが発生しました");
            } finally {
                deleteManufacturerBtn.disabled = false;
                deleteManufacturerBtn.textContent = "🗑️ 見積を削除";
            }
        });
    }

    // =========================================================
    // 7. 商品コード別見積削除
    // =========================================================

    // 削除予定リストの描画
    function renderDeleteProductList() {
        if (!deleteProductListContainer) return;
        deleteProductListContainer.innerHTML = "";
        
        // 件数表示を更新
        if (deleteProductCountSpan) {
            deleteProductCountSpan.textContent = deleteProductCodes.length;
        }

        if (deleteProductCodes.length === 0) {
            deleteProductListContainer.innerHTML = "<span style='color:#999;'>削除する商品コードを追加してください</span>";
            return;
        }

        deleteProductCodes.forEach((code, index) => {
            const item = document.createElement("span");
            item.className = "blocked-item";
            item.style.background = "#fff3e0";
            item.style.color = "#e65100";
            item.style.border = "1px solid #ffcc80";
            item.innerHTML = `${code} <span title="リストから除外" style="margin-left:8px; cursor:pointer; color:#d84315;">×</span>`;
            
            // リストから除外イベント
            item.querySelector("span").addEventListener("click", function() {
                deleteProductCodes.splice(index, 1);
                renderDeleteProductList();
            });
            
            deleteProductListContainer.appendChild(item);
        });
    }

    // 個別追加ボタン
    if (addDeleteProductBtn) {
        addDeleteProductBtn.addEventListener("click", function() {
            const val = deleteProductInput.value.trim();
            if (!val) {
                toastWarning("商品コードを入力してください");
                return;
            }
            
            if (!deleteProductCodes.includes(val)) {
                deleteProductCodes.push(val);
                renderDeleteProductList();
                toastSuccess(`${val} をリストに追加`, 1500);
            } else {
                toastInfo("この商品コードは既にリストに追加されています");
            }
            deleteProductInput.value = ""; // クリア
        });
    }

    // CSV一括読み込みボタン
    if (importDeleteProductBtn) {
        importDeleteProductBtn.addEventListener("click", function() {
            const file = deleteProductCsvInput.files[0];
            if (!file) {
                toastWarning("CSVファイルを選択してください");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const text = e.target.result;
                const lines = text.split(/\r?\n/);
                
                let addedCount = 0;
                let skippedCount = 0;

                // 1行目はヘッダーとして除外し、2行目から処理
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue; // 空行スキップ

                    // カンマ区切りの場合は1列目を取得
                    const cols = line.split(",");
                    const code = cols[0].replace(/"/g, "").trim();

                    if (!code) continue;

                    if (!deleteProductCodes.includes(code)) {
                        deleteProductCodes.push(code);
                        addedCount++;
                    } else {
                        skippedCount++;
                    }
                }

                renderDeleteProductList();
                toastSuccess(`取込完了: 追加 ${addedCount}件 / 重複スキップ ${skippedCount}件`, 4000);
                deleteProductCsvInput.value = ""; // クリア
            };

            reader.onerror = function() {
                toastError("ファイル読み込みエラーが発生しました");
            };

            reader.readAsText(file, "UTF-8");
        });
    }

    // リストクリアボタン
    if (clearDeleteProductBtn) {
        clearDeleteProductBtn.addEventListener("click", function() {
            if (deleteProductCodes.length === 0) {
                toastInfo("クリアする商品コードがありません");
                return;
            }
            
            if (confirm(`${deleteProductCodes.length}件の商品コードをリストからクリアしますか？`)) {
                deleteProductCodes = [];
                renderDeleteProductList();
                toastSuccess("リストをクリアしました");
            }
        });
    }

    // 削除実行ボタン
    if (execDeleteProductBtn) {
        execDeleteProductBtn.addEventListener("click", async function() {
            if (deleteProductCodes.length === 0) {
                toastWarning("削除する商品コードがリストにありません");
                return;
            }

            // 確認ダイアログ（重要な操作なのでconfirm維持）
            const confirmMsg = `【⚠️ 削除確認】\n\n${deleteProductCodes.length}件の商品コードの見積データを削除します。\n\nこの操作は取り消せません。\n本当に削除しますか？`;
            if (!confirm(confirmMsg)) return;

            execDeleteProductBtn.disabled = true;
            execDeleteProductBtn.textContent = "削除中...";

            try {
                const response = await fetch("/api/admin/delete-estimates-by-products", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productCodes: deleteProductCodes })
                });

                const data = await response.json();
                if (data.success) {
                    toastSuccess(`${data.deletedCount} 件の見積データを削除しました`, 4000);
                    deleteProductCodes = [];
                    renderDeleteProductList();
                } else {
                    toastError("削除失敗: " + data.message);
                }
            } catch (e) {
                console.error(e);
                toastError("通信エラーが発生しました");
            } finally {
                execDeleteProductBtn.disabled = false;
                execDeleteProductBtn.textContent = "🗑️ 見積を削除実行";
            }
        });
    }

    // =========================================================
    // 8. 在庫表示・連携管理
    // =========================================================

    function applyStockDisplayToForm(display = {}) {
        if (!stockDisplayToggle) return;
        stockDisplayToggle.checked = !!display.enabled;
        if (stockHiddenMessageInput) stockHiddenMessageInput.value = display.hiddenMessage || "";
        if (stockStocklessLabelInput) stockStocklessLabelInput.value = display.stocklessLabel || "";
        if (stockAllowZeroCheckbox) stockAllowZeroCheckbox.checked = display.allowOrderingWhenZero !== false;
        if (stockHighlightInput) stockHighlightInput.value = display.highlightThresholdMinutes || 180;
        renderWarehousePresetList(display.warehousePresets || []);
    }

    function renderWarehousePresetList(presets) {
        if (!warehousePresetList) return;
        warehousePresetList.innerHTML = "";
        (presets || []).forEach((item, index) => appendWarehousePresetRow(item, index));
        if (warehousePresetList.children.length === 0) {
            const empty = document.createElement("div");
            empty.className = "warehouse-preset-empty";
            empty.style.cssText = "color:#888; font-size:0.9rem; padding:6px 0;";
            empty.textContent = "倉庫を追加するとテンプレに反映されます";
            warehousePresetList.appendChild(empty);
        }
    }

    function appendWarehousePresetRow(data = {}, index) {
        if (!warehousePresetList) return;
        const emptyHint = warehousePresetList.querySelector(".warehouse-preset-empty");
        if (emptyHint) emptyHint.remove();
        const row = document.createElement("div");
        row.className = "warehouse-preset-row";
        row.style.cssText = "display:flex; gap:10px; align-items:center; margin-bottom:8px; flex-wrap:wrap;";
        row.innerHTML = `
            <label class="preset-label" style="flex:0 0 auto; width:70px; font-size:0.9rem; color:#555;">コード</label>
            <input type="text" class="form-control preset-code" placeholder="例: 本社" value="${(data.code || "").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" style="width:100px; min-width:80px;">
            <label class="preset-label" style="flex:0 0 auto; width:70px; font-size:0.9rem; color:#555;">倉庫名</label>
            <input type="text" class="form-control preset-name" placeholder="例: 本社倉庫" value="${(data.name || "").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" style="flex:1; min-width:180px;">
            <button type="button" class="warehouse-preset-remove btn-danger" style="background:#dc3545; color:white; border:none; padding:4px 10px;">削除</button>
        `;
        row.querySelector(".warehouse-preset-remove").addEventListener("click", () => {
            row.remove();
            if (warehousePresetList.children.length === 0) {
                const empty = document.createElement("div");
                empty.className = "warehouse-preset-empty";
                empty.style.cssText = "color:#888; font-size:0.9rem; padding:6px 0;";
                empty.textContent = "倉庫を追加するとテンプレに反映されます";
                warehousePresetList.appendChild(empty);
            }
        });
        warehousePresetList.appendChild(row);
    }

    function collectWarehousePresetsFromForm() {
        if (!warehousePresetList) return [];
        const rows = warehousePresetList.querySelectorAll(".warehouse-preset-row");
        return Array.from(rows).map(row => {
            const code = (row.querySelector(".preset-code") && row.querySelector(".preset-code").value.trim()) || "";
            const name = (row.querySelector(".preset-name") && row.querySelector(".preset-name").value.trim()) || "";
            return { code, name };
        }).filter(p => p.code || p.name);
    }

    async function loadStockSettings() {
        if (!stockDisplayToggle) return;
        try {
            const response = await fetch("/api/admin/stocks/settings");
            if (!response.ok) throw new Error("設定取得に失敗しました");
            const data = await response.json();
            if (!data.success) throw new Error(data.message || "設定取得に失敗しました");
            currentStockDisplay = data.display || {};
            applyStockDisplayToForm(currentStockDisplay);
            if (stockSettingsStatus) stockSettingsStatus.textContent = "";
        } catch (error) {
            console.error(error);
            if (stockSettingsStatus) stockSettingsStatus.textContent = "設定の取得に失敗しました";
        }
    }

    if (addWarehousePresetBtn) {
        addWarehousePresetBtn.addEventListener("click", () => appendWarehousePresetRow({ code: "", name: "" }));
    }

    if (stockSaveSettingsBtn) {
        stockSaveSettingsBtn.addEventListener("click", async () => {
            const payload = {
                display: {
                    enabled: stockDisplayToggle ? stockDisplayToggle.checked : false,
                    hiddenMessage: stockHiddenMessageInput ? stockHiddenMessageInput.value.trim() : "",
                    stocklessLabel: stockStocklessLabelInput ? stockStocklessLabelInput.value.trim() : "",
                    allowOrderingWhenZero: stockAllowZeroCheckbox ? stockAllowZeroCheckbox.checked : true,
                    highlightThresholdMinutes: parseInt(stockHighlightInput ? stockHighlightInput.value : "180", 10) || 180,
                    warehousePresets: collectWarehousePresetsFromForm()
                }
            };

            stockSaveSettingsBtn.disabled = true;
            if (stockSettingsStatus) stockSettingsStatus.textContent = "保存中...";
            try {
                const response = await fetch("/api/admin/stocks/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("在庫設定を保存しました");
                    if (stockSettingsStatus) stockSettingsStatus.textContent = "保存しました";
                } else {
                    throw new Error(data.message || "保存に失敗しました");
                }
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫設定の保存に失敗しました");
                if (stockSettingsStatus) stockSettingsStatus.textContent = "保存に失敗しました";
            } finally {
                stockSaveSettingsBtn.disabled = false;
            }
        });
    }

    async function loadStockHistory() {
        if (!stockHistoryBody) return;
        try {
            const response = await fetch("/api/admin/stocks/history");
            if (!response.ok) throw new Error("履歴取得に失敗しました");
            const data = await response.json();
            if (!data.success) throw new Error(data.message || "履歴取得に失敗しました");
            renderStockHistory(data.history || []);
        } catch (error) {
            console.error(error);
            stockHistoryBody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">履歴の取得に失敗しました</td></tr>`;
        }
    }

    function renderStockHistory(history = []) {
        if (!stockHistoryBody) return;
        if (history.length === 0) {
            stockHistoryBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">履歴がありません</td></tr>`;
            return;
        }

        const rows = history.slice(0, 30).map(record => {
            const time = new Date(record.finishedAt || record.loggedAt || record.timestamp || Date.now());
            const stamp = isNaN(time.getTime()) ? "-" : time.toLocaleString("ja-JP");
            const adapter = record.adapterId || record.source || "-";
            const summary = record.errorCount > 0
                ? `<span style="color:#c62828;">失敗 (${record.errorCount})</span>`
                : `成功 ${record.successCount || 0}件`;
            const memo = record.errorMessage || (record.filename || "");
            return `<tr>
                <td>${stamp}</td>
                <td>${adapter}</td>
                <td>${summary}</td>
                <td>${memo}</td>
            </tr>`;
        }).join("");

        stockHistoryBody.innerHTML = rows;
    }

    if (stockImportBtn) {
        stockImportBtn.addEventListener("click", async () => {
            if (!stockCsvInput || !stockCsvInput.files || stockCsvInput.files.length === 0) {
                toastWarning("在庫CSV/Excelファイルを選択してください");
                return;
            }
            const file = stockCsvInput.files[0];
            const formData = new FormData();
            formData.append("stockFile", file);

            stockImportBtn.disabled = true;
            if (stockImportStatus) stockImportStatus.textContent = "取込中...";
            try {
                const response = await fetch("/api/admin/stocks/import", {
                    method: "POST",
                    body: formData
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("在庫データを取り込みました");
                    if (stockImportStatus) stockImportStatus.textContent = "取込完了";
                    loadStockHistory();
                    stockCsvInput.value = "";
                } else {
                    throw new Error(data.message || "取込に失敗しました");
                }
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫取込に失敗しました");
                if (stockImportStatus) stockImportStatus.textContent = "取込に失敗しました";
            } finally {
                stockImportBtn.disabled = false;
            }
        });
    }

    if (stockTemplateBtn) {
        stockTemplateBtn.addEventListener("click", async () => {
            try {
                const res = await fetch("/api/admin/stocks/template", { credentials: "include" });
                if (!res.ok) throw new Error(await res.text());
                const blob = await res.blob();
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "stock_template.xlsx";
                a.click();
                URL.revokeObjectURL(a.href);
            } catch (err) {
                toastError(err.message || "テンプレートのダウンロードに失敗しました");
            }
        });
    }

    function resetWarehouseList() {
        if (!warehouseList) return;
        warehouseList.innerHTML = `<div style="color:#888; font-size:0.9rem;">倉庫行を追加してください</div>`;
        if (warehouseListHeader) warehouseListHeader.style.display = "none";
    }

    function addWarehouseRow(data = {}) {
        if (!warehouseList) return;
        if (warehouseList.children.length === 1 && warehouseList.children[0].textContent.includes("倉庫行")) {
            warehouseList.innerHTML = "";
            if (warehouseListHeader) warehouseListHeader.style.display = "flex";
        }

        const row = document.createElement("div");
        row.className = "warehouse-row";
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.marginBottom = "8px";
        row.style.alignItems = "center";
        const codeVal = (data.code || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        const nameVal = (data.name || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        const qtyVal = Number.isFinite(data.qty) ? data.qty : 0;
        row.innerHTML = `
            <input type="text" class="form-control warehouse-code" placeholder="例: 本社" title="倉庫コード" value="${codeVal}" style="width:100px; min-width:100px;">
            <input type="text" class="form-control warehouse-name" placeholder="例: 本社倉庫" title="倉庫名" value="${nameVal}" style="flex:1; min-width:140px;">
            <input type="number" class="form-control warehouse-qty" placeholder="0" title="数量" value="${qtyVal}" style="width:100px; min-width:80px;">
            <button type="button" class="btn-danger warehouse-remove" title="この行を削除" style="background:#dc3545; color:white; border:none; padding:4px 10px;">×</button>
        `;

        row.querySelector(".warehouse-remove").addEventListener("click", () => {
            row.remove();
            if (warehouseList.querySelectorAll(".warehouse-row").length === 0) {
                resetWarehouseList();
            }
        });

        warehouseList.appendChild(row);
    }

    if (addWarehouseRowBtn) {
        addWarehouseRowBtn.addEventListener("click", () => addWarehouseRow());
    }

    function collectWarehousesFromForm() {
        if (!warehouseList) return [];
        const rows = [...warehouseList.querySelectorAll(".warehouse-row")];
        return rows.map(row => ({
            code: row.querySelector(".warehouse-code").value.trim() || "default",
            name: row.querySelector(".warehouse-name").value.trim() || "標準倉庫",
            qty: parseInt(row.querySelector(".warehouse-qty").value || "0", 10) || 0
        })).filter(item => item.qty !== 0 || item.code);
    }

    async function fetchStockByCode(code) {
        const response = await fetch(`/api/admin/stocks/${encodeURIComponent(code)}`);
        if (response.status === 404) {
            throw new Error("在庫データが見つかりません");
        }
        if (!response.ok) {
            throw new Error("在庫データの取得に失敗しました");
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || "在庫データの取得に失敗しました");
        }
        return data.stock;
    }

    if (loadStockBtn) {
        loadStockBtn.addEventListener("click", async () => {
            const code = manualCodeInput ? manualCodeInput.value.trim() : "";
            if (!code) {
                toastWarning("商品コードを入力してください");
                return;
            }
            loadStockBtn.disabled = true;
            if (manualStockStatus) manualStockStatus.textContent = "読み込み中...";
            try {
                const stock = await fetchStockByCode(code);
                if (manualTotalInput) manualTotalInput.value = stock.totalQty || 0;
                if (manualReservedInput) manualReservedInput.value = stock.reservedQty || 0;
                if (manualPublishSelect) manualPublishSelect.value = stock.publish === false ? "false" : "true";
                if (manualHiddenInput) manualHiddenInput.value = stock.hiddenMessage || "";
                if (manualLockCheckbox) manualLockCheckbox.checked = !!stock.manualLock;
                resetWarehouseList();
                if (Array.isArray(stock.warehouses) && stock.warehouses.length > 0) {
                    stock.warehouses.forEach(addWarehouseRow);
                }
                if (manualStockStatus) manualStockStatus.textContent = "在庫データを読み込みました";
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫データの取得に失敗しました");
                if (manualStockStatus) manualStockStatus.textContent = error.message || "取得に失敗しました";
            } finally {
                loadStockBtn.disabled = false;
            }
        });
    }

    if (stockManualForm) {
        stockManualForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!manualCodeInput || !manualCodeInput.value.trim()) {
                toastWarning("商品コードを入力してください");
                return;
            }

            const payload = {
                productCode: manualCodeInput.value.trim(),
                totalQty: parseInt(manualTotalInput ? manualTotalInput.value : "0", 10) || 0,
                reservedQty: parseInt(manualReservedInput ? manualReservedInput.value : "0", 10) || 0,
                publish: manualPublishSelect ? (manualPublishSelect.value === "true") : true,
                hiddenMessage: manualHiddenInput ? manualHiddenInput.value.trim() : "",
                manualLock: manualLockCheckbox ? manualLockCheckbox.checked : false,
                warehouses: collectWarehousesFromForm()
            };

            if (manualStockStatus) manualStockStatus.textContent = "保存中...";
            try {
                const response = await fetch("/api/admin/stocks/manual-adjust", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    toastSuccess("在庫を保存しました");
                    manualStockStatus.textContent = "保存しました";
                    loadStockHistory();
                } else {
                    throw new Error(data.message || "保存に失敗しました");
                }
            } catch (error) {
                console.error(error);
                toastError(error.message || "在庫の保存に失敗しました");
                if (manualStockStatus) manualStockStatus.textContent = "保存に失敗しました";
            }
        });
    }

    // 初期化
    resetWarehouseList();
});