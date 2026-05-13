document.addEventListener("DOMContentLoaded", async function () {
    const statusEl = document.getElementById("admin-order-detail-status");
    const bodyEl = document.getElementById("admin-order-detail-body");
    const titleMeta = document.getElementById("admin-order-detail-meta");

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");

    if (!orderId) {
        if (statusEl) statusEl.textContent = "注文IDが指定されていません。";
        return;
    }

    if (!window.OrderView) {
        if (statusEl) statusEl.textContent = "表示モジュールの読み込みに失敗しました。";
        return;
    }

    try {
        const res = await adminApiFetch("/api/admin/order/" + encodeURIComponent(orderId));
        const data = await res.json();

        if (res.status === 401 || !data.success) {
            if (statusEl) statusEl.textContent = data.message || "注文を取得できませんでした。";
            return;
        }

        const order = data.order;
        if (!order) {
            if (statusEl) statusEl.textContent = "注文が見つかりません。";
            return;
        }

        const htmlData = window.OrderView.generateOrderCardHTML(order);
        const dateStr = window.OrderView.formatOrderDateYmdSlash(order.orderDate);
        const statusText = order.status || "未発送";
        const cust = order.customerName || "名称不明";

        if (titleMeta) {
            titleMeta.textContent =
                "注文ID " + String(order.orderId) + " · " + dateStr + " · " + statusText + " · " + cust;
        }
        document.title = "注文詳細 " + String(order.orderId) + " - WEB受注システム";

        if (statusEl) statusEl.style.display = "none";
        if (bodyEl) {
            bodyEl.style.display = "block";
            bodyEl.innerHTML =
                '<p style="margin:0 0 14px 0;font-size:0.9rem;color:#6b7280;">出荷操作・編集は「受注管理」一覧から行えます。</p>' +
                htmlData.detailContent;
        }
    } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = "通信エラーが発生しました。";
    }
});
