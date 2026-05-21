// 顧客: 既定納品先の編集（GET/PUT /api/account/delivery）と配送履歴の参照
(function () {
    function esc(s) {
        if (typeof escapeHtml !== "undefined") return escapeHtml(String(s == null ? "" : s));
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function toast(msg, type) {
        if (type === "success" && window.toastSuccess) window.toastSuccess(msg);
        else if (type === "error" && window.toastError) window.toastError(msg);
        else if (window.toastWarning) window.toastWarning(msg);
        else alert(msg);
    }

    document.addEventListener("DOMContentLoaded", function () {
        const loadStatus = document.getElementById("delivery-load-status");
        const mainEl = document.getElementById("delivery-main");
        const form = document.getElementById("delivery-form");
        const nameInput = document.getElementById("delivery-name");
        const zipInput = document.getElementById("delivery-zip");
        const addressInput = document.getElementById("delivery-address");
        const telInput = document.getElementById("delivery-tel");
        const saveBtn = document.getElementById("delivery-save-btn");
        const zipSearchBtn = document.getElementById("delivery-zip-search-btn");
        const historyList = document.getElementById("delivery-history-list");

        if (!loadStatus || !mainEl || !form) return;

        function fillForm(d) {
            if (nameInput) nameInput.value = d.deliveryName || d.name || "";
            if (zipInput) zipInput.value = (d.deliveryZip || d.zip || "").replace(/\D/g, "").slice(0, 7);
            if (addressInput) addressInput.value = d.deliveryAddress || d.address || "";
            if (telInput) telInput.value = d.deliveryTel || d.tel || "";
        }

        function collectPayload() {
            return {
                deliveryName: nameInput ? nameInput.value.trim() : "",
                deliveryZip: zipInput ? zipInput.value.replace(/\D/g, "").trim() : "",
                deliveryAddress: addressInput ? addressInput.value.trim() : "",
                deliveryTel: telInput ? telInput.value.trim() : ""
            };
        }

        if (zipSearchBtn && zipInput && addressInput) {
            zipSearchBtn.addEventListener("click", async function () {
                const zip = zipInput.value.replace(/\D/g, "");
                if (zip.length < 7) {
                    toast("郵便番号は7桁で入力してください", "warn");
                    return;
                }
                try {
                    const res = await fetch("/zip-lookup?zipcode=" + encodeURIComponent(zip), {
                        credentials: "same-origin"
                    });
                    const data = await res.json();
                    if (data.success && data.address) {
                        addressInput.value = data.address;
                    } else {
                        toast(data.message || "住所が見つかりませんでした", "warn");
                    }
                } catch (e) {
                    console.error(e);
                    toast("住所検索に失敗しました", "error");
                }
            });
        }

        function renderHistoryList(list) {
            if (!historyList) return;
            if (!list || list.length === 0) {
                historyList.innerHTML = '<p class="delivery-history-empty">過去の配送先はまだありません。</p>';
                return;
            }
            historyList.innerHTML = list
                .map(function (item, idx) {
                    const name = esc(item.name || "（宛名なし）");
                    const addr = esc(item.address || "");
                    const zip = esc(item.zip || "");
                    const tel = esc(item.tel || "");
                    const contactHtml = item.contactName
                        ? "<div>担当: " + esc(item.contactName) + "</div>"
                        : "";
                    const telHtml = tel ? "<div>TEL: " + tel + "</div>" : "";
                    return (
                        '<div class="delivery-history-item" data-idx="' +
                        idx +
                        '">' +
                        '<div class="delivery-history-item__body">' +
                        '<div class="delivery-history-item__name">' +
                        name +
                        " 様</div>" +
                        "<div>〒" +
                        (zip || "—") +
                        " " +
                        addr +
                        "</div>" +
                        telHtml +
                        contactHtml +
                        "</div>" +
                        '<button type="button" class="btn-apply-history">フォームに反映</button>' +
                        "</div>"
                    );
                })
                .join("");

            let historyData = list;
            historyList.querySelectorAll(".btn-apply-history").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    const row = btn.closest(".delivery-history-item");
                    const idx = row ? parseInt(row.getAttribute("data-idx"), 10) : -1;
                    const item = historyData[idx];
                    if (!item) return;
                    fillForm({
                        name: item.name,
                        zip: item.zip,
                        address: item.address,
                        tel: item.tel
                    });
                    toast("フォームに反映しました。必要なら編集して保存してください。", "warn");
                    if (nameInput) nameInput.focus();
                });
            });
        }

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            if (saveBtn) saveBtn.disabled = true;
            try {
                const res = await fetch("/api/account/delivery", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(collectPayload())
                });
                if (res.status === 401) {
                    window.location.href = "/login.html";
                    return;
                }
                const data = await res.json().catch(function () {
                    return {};
                });
                if (!res.ok || !data.success) {
                    toast(data.message || "保存に失敗しました", "error");
                    return;
                }
                toast(data.message || "納品先を保存しました", "success");
            } catch (err) {
                console.error(err);
                toast("保存に失敗しました", "error");
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        });

        Promise.all([
            fetch("/api/account/delivery", { credentials: "same-origin" }),
            fetch("/delivery-history", { credentials: "same-origin" })
        ])
            .then(async function (results) {
                const deliveryRes = results[0];
                const historyRes = results[1];

                if (deliveryRes.status === 401) {
                    window.location.href = "/login.html";
                    return;
                }
                if (!deliveryRes.ok) {
                    loadStatus.textContent = "納品先の読み込みに失敗しました。";
                    return;
                }

                const deliveryJson = await deliveryRes.json();
                if (deliveryJson.delivery) fillForm(deliveryJson.delivery);

                let historyListData = [];
                if (historyRes.ok) {
                    const historyJson = await historyRes.json();
                    if (historyJson.success && Array.isArray(historyJson.list)) {
                        historyListData = historyJson.list;
                    }
                }
                renderHistoryList(historyListData);

                loadStatus.style.display = "none";
                mainEl.style.display = "block";
            })
            .catch(function (err) {
                console.error(err);
                loadStatus.textContent = "読み込みに失敗しました。しばらくしてから再度お試しください。";
            });
    });
})();
