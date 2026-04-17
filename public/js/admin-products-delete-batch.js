/**
 * 見積・特価管理：商品コードリストによる見積一括削除（admin-estimates.html）
 * admin-products-estimates.js の後、admin-estimates.js の前に読み込む
 */
(function () {
    let deleteProductCodes = [];

    function renderDeleteProductList() {
        const deleteProductListContainer = document.querySelector("#delete-product-list");
        const deleteProductCountSpan = document.querySelector("#delete-product-count");
        if (!deleteProductListContainer) return;
        deleteProductListContainer.innerHTML = "";

        if (deleteProductCountSpan) {
            deleteProductCountSpan.textContent = deleteProductCodes.length;
        }

        if (deleteProductCodes.length === 0) {
            deleteProductListContainer.innerHTML = "<span style='color:#9ca3af;'>削除する商品コードを追加してください</span>";
            return;
        }

        deleteProductCodes.forEach((code, index) => {
            const item = document.createElement("span");
            item.className = "blocked-item";
            item.style.background = "#f3f4f6";
            item.style.color = "#374151";
            item.style.border = "1px solid #e5e7eb";
            item.innerHTML = `${code} <span title="リストから除外" style="margin-left:8px; cursor:pointer; color:#6b7280;">×</span>`;

            item.querySelector("span").addEventListener("click", function () {
                deleteProductCodes.splice(index, 1);
                renderDeleteProductList();
            });

            deleteProductListContainer.appendChild(item);
        });
    }

    function init() {
        const deleteProductInput = document.querySelector("#delete-product-input");
        const addDeleteProductBtn = document.querySelector("#add-delete-product-btn");
        const deleteProductCsvInput = document.querySelector("#delete-product-csv-input");
        const importDeleteProductBtn = document.querySelector("#import-delete-product-btn");
        const clearDeleteProductBtn = document.querySelector("#clear-delete-product-btn");
        const execDeleteProductBtn = document.querySelector("#exec-delete-product-btn");

        if (addDeleteProductBtn && deleteProductInput) {
            addDeleteProductBtn.addEventListener("click", function () {
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
                deleteProductInput.value = "";
            });
        }

        if (importDeleteProductBtn && deleteProductCsvInput) {
            importDeleteProductBtn.addEventListener("click", function () {
                const file = deleteProductCsvInput.files[0];
                if (!file) {
                    toastWarning("CSVファイルを選択してください");
                    return;
                }

                const reader = new FileReader();
                reader.onload = function (e) {
                    const text = e.target.result;
                    const lines = text.split(/\r?\n/);

                    let addedCount = 0;
                    let skippedCount = 0;

                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;

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
                    deleteProductCsvInput.value = "";
                };

                reader.onerror = function () {
                    toastError("ファイル読み込みエラーが発生しました");
                };

                reader.readAsText(file, "UTF-8");
            });
        }

        if (clearDeleteProductBtn) {
            clearDeleteProductBtn.addEventListener("click", function () {
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

        if (execDeleteProductBtn) {
            execDeleteProductBtn.addEventListener("click", async function () {
                if (deleteProductCodes.length === 0) {
                    toastWarning("削除する商品コードがリストにありません");
                    return;
                }

                const confirmMsg = `【削除確認】\n\n${deleteProductCodes.length}件の商品コードの見積データを削除します。\n\nこの操作は取り消せません。\n本当に削除しますか？`;
                if (!confirm(confirmMsg)) return;

                execDeleteProductBtn.disabled = true;
                execDeleteProductBtn.textContent = "削除中...";

                try {
                    const response = await adminApiFetch("/api/admin/delete-estimates-by-products", {
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
                    execDeleteProductBtn.textContent = "見積を削除実行";
                }
            });
        }
    }

    window.AdminProductsDeleteBatch = { init, renderDeleteProductList };
})();
