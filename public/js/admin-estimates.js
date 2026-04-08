// 見積・特価管理ページ（admin-estimates.html）
document.addEventListener("DOMContentLoaded", function () {
    if (window.AdminProductsEstimates && typeof window.AdminProductsEstimates.init === "function") {
        window.AdminProductsEstimates.init();
    }
    if (window.AdminProductsDeleteBatch && typeof window.AdminProductsDeleteBatch.init === "function") {
        window.AdminProductsDeleteBatch.init();
    }
});
