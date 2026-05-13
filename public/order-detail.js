document.addEventListener("DOMContentLoaded", async function () {
    const main = document.getElementById("order-detail-main");
    const meta = document.getElementById("order-detail-meta");

    function formatOrderDateYmdSlash(orderDate) {
        const d = new Date(orderDate);
        if (Number.isNaN(d.getTime())) return "—";
        const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
        const x = new Date(jstMs);
        const y = x.getUTCFullYear();
        const m = String(x.getUTCMonth() + 1).padStart(2, "0");
        const day = String(x.getUTCDate()).padStart(2, "0");
        return y + "/" + m + "/" + day;
    }

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");

    if (!orderId) {
        if (main) main.innerHTML = "<p class=\"history-error\">注文IDが指定されていません。</p>";
        return;
    }

    if (typeof window.buildCustomerOrderDetailHtml !== "function") {
        if (main) main.innerHTML = "<p class=\"history-error\">表示モジュールの読み込みに失敗しました。</p>";
        return;
    }

    try {
        const res = await fetch("/order/" + encodeURIComponent(orderId));

        if (res.status === 401) {
            alert("セッションが切れました。ログインし直してください。");
            window.location.href = "/";
            return;
        }

        const data = await res.json();

        if (!data.success || !data.order) {
            if (main) {
                main.innerHTML = "<p class=\"history-error\">" +
                    (data.message ? String(data.message).replace(/</g, "&lt;") : "注文を表示できません。") +
                    "</p>";
            }
            return;
        }

        const order = data.order;
        const dateStr = formatOrderDateYmdSlash(order.orderDate);
        const statusText = order.status || "未発送";

        if (meta) {
            meta.textContent = "注文ID " + String(order.orderId) + " · " + dateStr + " · " + statusText;
        }
        document.title = "注文詳細 " + String(order.orderId) + " - WEB受注システム";

        if (main) {
            main.innerHTML = window.buildCustomerOrderDetailHtml(order);
            const reorderBtn = main.querySelector(".btn-reorder");
            if (reorderBtn && typeof window.customerOrderQuickReorder === "function") {
                reorderBtn.addEventListener("click", function (e) {
                    e.preventDefault();
                    window.customerOrderQuickReorder(order);
                });
            }
        }
    } catch (e) {
        console.error(e);
        if (main) main.innerHTML = "<p class=\"history-error\">通信エラーが発生しました。</p>";
    }
});
