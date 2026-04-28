// 価格表一覧（/my-pricelist-data）を別タブで表形式表示
(function () {
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatYen(n) {
        const x = Number(n);
        if (Number.isNaN(x)) return "—";
        return "¥" + x.toLocaleString("ja-JP");
    }

    document.addEventListener("DOMContentLoaded", function () {
        const status = document.getElementById("pricelist-status");
        const table = document.getElementById("pricelist-table");
        const tbody = document.getElementById("pricelist-table-body");
        const countEl = document.getElementById("pricelist-count");
        const closeTabBtn = document.getElementById("close-tab-btn");

        if (!status || !table || !tbody) return;

        if (closeTabBtn) {
            closeTabBtn.addEventListener("click", function () {
                window.close();
                // スクリプトで閉じられないケース（手動で開いたタブ）向けフォールバック
                setTimeout(function () {
                    if (!window.closed) window.location.href = "products.html";
                }, 100);
            });
        }

        fetch("/my-pricelist-data", { credentials: "same-origin" })
            .then(function (res) {
                if (res.status === 401) {
                    window.location.href = "/login.html";
                    return null;
                }
                if (!res.ok) throw new Error("load failed");
                return res.json();
            })
            .then(function (data) {
                if (!data) return;
                const rows = Array.isArray(data.rows) ? data.rows : [];
                countEl.textContent = String(rows.length);

                if (rows.length === 0) {
                    status.textContent = "表示できる価格行がありません（最終価格が0の商品は含まれません）。";
                    return;
                }

                tbody.innerHTML = rows
                    .map(function (r) {
                        return (
                            "<tr>" +
                            "<td>" + esc(r.productCode) + "</td>" +
                            "<td>" + esc(r.name) + "</td>" +
                            "<td>" + esc(r.manufacturer) + "</td>" +
                            "<td>" + esc(r.category) + "</td>" +
                            '<td style="text-align:right;">' + esc(formatYen(r.price)) + "</td>" +
                            "</tr>"
                        );
                    })
                    .join("");

                status.style.display = "none";
                table.style.display = "table";
            })
            .catch(function () {
                status.textContent = "価格表の読み込みに失敗しました。しばらくしてから再度お試しください。";
            });
    });
})();
