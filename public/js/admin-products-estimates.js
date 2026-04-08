/**
 * 見積・特価管理：インポート・メーカー名による見積一括削除（admin-estimates.html）
 * admin-common.js の後、admin-estimates.js の前に読み込む
 */
(function () {
    function init() {
        const estimateFileInput = document.querySelector("#estimate-file-input");
        const estimateUploadBtn = document.querySelector("#estimate-upload-btn");
        const deleteManufacturerInput = document.querySelector("#delete-manufacturer-input");
        const deleteManufacturerBtn = document.querySelector("#delete-manufacturer-btn");

        if (estimateUploadBtn && estimateFileInput) {
            estimateUploadBtn.addEventListener("click", async function () {
                const file = estimateFileInput.files[0];
                if (!file) {
                    toastWarning("ファイルを選択してください");
                    return;
                }

                estimateUploadBtn.disabled = true;
                estimateUploadBtn.textContent = "送信中...";

                const formData = new FormData();
                formData.append("estimateFile", file);

                try {
                    const response = await adminApiFetch("/api/admin/import-estimates", {
                        method: "POST",
                        body: formData
                    });

                    const data = await response.json();
                    if (data.success) {
                        toastSuccess(data.message, 4000);
                        estimateFileInput.value = "";
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

        if (deleteManufacturerBtn && deleteManufacturerInput) {
            deleteManufacturerBtn.addEventListener("click", async function () {
                const manufacturer = deleteManufacturerInput.value.trim();
                if (!manufacturer) {
                    toastWarning("メーカー名を入力してください");
                    return;
                }

                const confirmMsg = `【⚠️ 削除確認】\n\n商品名に「${manufacturer}」を含む見積データをすべて削除します。\n（大文字/小文字は区別しません）\n\nこの操作は取り消せません。\n本当に削除しますか？`;
                if (!confirm(confirmMsg)) return;

                const doubleCheck = prompt(`削除を実行するには「${manufacturer}」と入力してください：`);
                if (doubleCheck !== manufacturer) {
                    toastWarning("入力が一致しません。削除をキャンセルしました。");
                    return;
                }

                deleteManufacturerBtn.disabled = true;
                deleteManufacturerBtn.textContent = "削除中...";

                try {
                    const response = await adminApiFetch("/api/admin/delete-estimates-by-manufacturer", {
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
    }

    window.AdminProductsEstimates = { init };
})();
