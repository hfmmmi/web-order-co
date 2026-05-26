// public/js/admin-settings-prices.js — 価格・掛率設定（admin-settings.html の価格タブ用）
document.addEventListener("DOMContentLoaded", function () {
    const priceCsvInput = document.querySelector("#price-csv-input");
    const priceCsvBtn = document.querySelector("#price-csv-btn");
    const godCustId = document.querySelector("#price-customer-id");
    const godProdCode = document.querySelector("#price-product-code");
    const godSuggestCust = document.querySelector("#suggest-customer");
    const godSuggestProd = document.querySelector("#suggest-product");
    const priceEditArea = document.querySelector("#price-edit-area");
    const currentPriceDisplay = document.querySelector("#current-price-display");
    const newSpecialPrice = document.querySelector("#new-special-price");
    const savePriceBtn = document.querySelector("#btn-save-price");
    const specialPriceTableBody = document.querySelector("#special-price-table-body");
    const pricelistRankSelect = document.getElementById("pricelist-rank-select");
    const pricelistDownloadLink = document.getElementById("pricelist-download-link");
    const pricelistExcelLink = document.getElementById("pricelist-excel-link");

    if (!godCustId && !specialPriceTableBody && !priceCsvBtn) return;

    document.addEventListener("admin-ready", function () {
        loadSpecialPrices();
        const params = new URLSearchParams(window.location.search);
        const prefillCustomerId = params.get("customerId");
        if (prefillCustomerId && godCustId) {
            godCustId.value = prefillCustomerId;
            godCustId.focus();
        }
    });

    function fillGodSuggestList(container, items, formatLabel, onSelect) {
        if (!container) return;
        container.innerHTML = "";
        if (!items || items.length === 0) {
            container.style.display = "none";
            return;
        }
        container.style.display = "block";
        items.forEach((item) => {
            const div = document.createElement("div");
            div.textContent = formatLabel(item);
            div.style.padding = "5px";
            div.style.cursor = "pointer";
            div.onmouseover = () => {
                div.style.background = "#eee";
            };
            div.onmouseout = () => {
                div.style.background = "white";
            };
            div.onclick = () => {
                onSelect(item);
                container.style.display = "none";
            };
            container.appendChild(div);
        });
    }

    async function uploadPriceCsv(fileInput) {
        const file = fileInput && fileInput.files[0];
        if (!file) {
            toastWarning("ファイルを選択してください");
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function (e) {
            const base64 = e.target.result.split(",")[1];
            try {
                const res = await adminApiFetch("/api/upload-price-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fileData: base64 })
                });
                const d = await res.json();
                if (d.success) {
                    toastSuccess(d.message, 4000);
                    fileInput.value = "";
                    loadSpecialPrices();
                } else {
                    toastError("失敗: " + d.message);
                }
            } catch (err) {
                toastError("通信エラー");
            }
        };
    }

    if (priceCsvBtn && priceCsvInput) {
        priceCsvBtn.addEventListener("click", () => uploadPriceCsv(priceCsvInput));
    }

    if (godCustId) {
        godCustId.addEventListener("input", async function () {
            const val = this.value;
            if (val.length < 2) {
                if (godSuggestCust) godSuggestCust.style.display = "none";
                return;
            }
            try {
                const res = await adminApiFetch(
                    `/api/admin/customers?keyword=${encodeURIComponent(val)}&page=1`
                );
                if (res.status === 401) return;
                const d = await res.json();
                const list = Array.isArray(d.customers) ? d.customers : [];
                fillGodSuggestList(
                    godSuggestCust,
                    list,
                    (c) => `${c.customerId} : ${c.customerName}`,
                    (c) => {
                        godCustId.value = c.customerId;
                        checkCurrentPrice();
                    }
                );
            } catch (e) {
                if (godSuggestCust) godSuggestCust.style.display = "none";
            }
        });
    }

    if (godProdCode) {
        godProdCode.addEventListener("input", async function () {
            const val = this.value;
            if (val.length < 2) {
                if (godSuggestProd) godSuggestProd.style.display = "none";
                return;
            }
            try {
                const res = await adminApiFetch("/api/admin/products");
                if (res.status === 401) return;
                const products = await res.json();
                const filtered = products
                    .filter((p) => p.productCode.includes(val) || p.name.includes(val))
                    .slice(0, 10);
                fillGodSuggestList(
                    godSuggestProd,
                    filtered,
                    (p) => `${p.productCode} : ${p.name}`,
                    (p) => {
                        godProdCode.value = p.productCode;
                        checkCurrentPrice();
                    }
                );
            } catch (e) {
                if (godSuggestProd) godSuggestProd.style.display = "none";
            }
        });
    }

    async function checkCurrentPrice() {
        if (!godCustId || !godProdCode || !priceEditArea || !currentPriceDisplay) return;
        const cId = godCustId.value;
        const pCode = godProdCode.value;
        if (!cId || !pCode) return;

        priceEditArea.style.display = "flex";
        currentPriceDisplay.textContent = "確認中...";

        try {
            const res = await adminApiFetch(`/api/get-price?customerId=${cId}&productCode=${pCode}`);
            const d = await res.json();
            if (d.success) {
                const prefix = d.isSpecial ? "特価" : "定価";
                currentPriceDisplay.textContent = `${prefix}: ${d.currentPrice}円`;
                currentPriceDisplay.style.color = d.isSpecial ? "red" : "black";
            } else {
                currentPriceDisplay.textContent = "---";
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (savePriceBtn) {
        savePriceBtn.addEventListener("click", async () => {
            const cId = godCustId && godCustId.value;
            const pCode = godProdCode && godProdCode.value;
            const price = newSpecialPrice && newSpecialPrice.value;
            if (!cId || !pCode || !price) {
                toastWarning("全項目を入力してください");
                return;
            }

            try {
                const res = await adminApiFetch("/api/update-single-price", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        targetCustomerId: cId,
                        targetProductCode: pCode,
                        newPrice: price
                    })
                });
                const d = await res.json();
                if (d.success) {
                    toastSuccess("特価を保存しました");
                    checkCurrentPrice();
                    loadSpecialPrices();
                    if (newSpecialPrice) newSpecialPrice.value = "";
                } else {
                    toastError("失敗: " + d.message);
                }
            } catch (e) {
                toastError("通信エラー");
            }
        });
    }

    document.addEventListener("click", (e) => {
        if (godSuggestCust && e.target !== godCustId) godSuggestCust.style.display = "none";
        if (godSuggestProd && e.target !== godProdCode) godSuggestProd.style.display = "none";
    });

    async function loadSpecialPrices() {
        if (!specialPriceTableBody) return;

        specialPriceTableBody.innerHTML =
            "<tr><td colspan='3' style='text-align:center'>データ読み込み中...</td></tr>";

        try {
            const res = await adminApiFetch("/api/admin/special-prices-list");
            if (res.status === 401) return;

            const list = await res.json();

            specialPriceTableBody.innerHTML = "";
            if (!list.length) {
                specialPriceTableBody.innerHTML =
                    "<tr><td colspan='3' style='text-align:center'>現在、個別特価の設定はありません</td></tr>";
                return;
            }

            list.forEach((item) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="padding:8px;">${item.customerName} <br><small style="color:#666">(${item.customerId})</small></td>
                    <td style="padding:8px;">${item.productName} <br><small style="color:#666">(${item.productCode})</small></td>
                    <td class="prices-col-price">${parseInt(item.specialPrice, 10).toLocaleString()} 円</td>
                `;
                specialPriceTableBody.appendChild(tr);
            });
        } catch (error) {
            console.error("特価リスト取得エラー", error);
            specialPriceTableBody.innerHTML =
                "<tr><td colspan='3' style='color:red; text-align:center'>読み込みエラーが発生しました</td></tr>";
        }
    }

    function updatePricelistDownloadHref() {
        if (!pricelistRankSelect) return;
        const rank = pricelistRankSelect.value;
        if (pricelistDownloadLink) {
            pricelistDownloadLink.href = "/api/admin/download-pricelist-by-rank/" + rank;
        }
        if (pricelistExcelLink) {
            pricelistExcelLink.href = "/api/admin/download-pricelist-excel-by-rank/" + rank;
        }
    }

    if (pricelistRankSelect) {
        pricelistRankSelect.addEventListener("change", updatePricelistDownloadHref);
        updatePricelistDownloadHref();
        adminApiFetch("/api/admin/rank-list", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => {
                if (!list.length) return;
                pricelistRankSelect.innerHTML = list
                    .map((item) => {
                        const id = item.id || "";
                        const label =
                            item.name === item.id ? item.id : item.id + " - " + item.name;
                        return `<option value="${id}">${label}</option>`;
                    })
                    .join("");
                updatePricelistDownloadHref();
            })
            .catch(() => {});
    }
});
