// public/js/cart.js
// カート画面のUI操作ロジック
// [Updated] 注文確定時に商品詳細（名前・価格・コード）を確実に結合して送信するよう修正

let loadedCartData = []; // ここにサーバーから取得した詳細データが入る
/** @type {object|null} 見積PDF用（/api/settings/public の publicBranding） */
let cachedPublicBranding = null;

document.addEventListener("DOMContentLoaded", function () {
    const cartDataString = sessionStorage.getItem("cart");

    // 1. 初期表示
    if (cartDataString) {
        fetchCartDetails(JSON.parse(cartDataString));
    } else {
        document.querySelector("#cart-list-body").innerHTML = "<tr><td colspan='6'>カートに商品がありません</td></tr>";
    }

    // カート最下部のお知らせ・見積用ブランディング（システム設定）
    loadCartPublicSettings();

    async function loadCartPublicSettings() {
        const container = document.getElementById("cart-shipping-notice-container");
        try {
            const res = await fetch("/api/settings/public", { credentials: "same-origin" });
            if (!res.ok) return;
            const data = await res.json();
            cachedPublicBranding = data.publicBranding && typeof data.publicBranding === "object" ? data.publicBranding : {};
            if (!container) return;
            const text = (data.cartShippingNotice && String(data.cartShippingNotice).trim()) ? data.cartShippingNotice.trim() : "";
            if (text) {
                container.textContent = text;
                container.style.whiteSpace = "pre-wrap";
                container.style.display = "";
            } else {
                container.textContent = "";
                container.style.display = "none";
            }
        } catch (e) {
            if (container) container.style.display = "none";
        }
    }

    // 2. サーバーから詳細取得 & テーブル描画
    async function fetchCartDetails(cart) {
        try {
            // ★修正: /api を削除 (/cart-details)
            const res = await fetch("/cart-details", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cart: cart })
            });
            
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            const data = await res.json();
            if (data.success) {
                loadedCartData = data.cartDetails;
                renderCartTable(loadedCartData);
            } else {
                console.error("データ取得エラー:", data.message);
                document.querySelector("#cart-list-body").innerHTML = "<tr><td colspan='6'>商品情報の取得に失敗しました</td></tr>";
            }
        } catch (e) { 
            console.error("通信エラー:", e);
            document.querySelector("#cart-list-body").innerHTML = "<tr><td colspan='6'>通信エラーが発生しました</td></tr>";
        }
    }

    function renderCartTable(details) {
        const tbody = document.querySelector("#cart-list-body");
        const totalSpan = document.querySelector("#cart-total-price");
        if (!tbody || !totalSpan) return;

        let html = "";
        let total = 0;

        details.forEach(item => {
            const sub = item.price * item.quantity;
            total += sub;
            // 表示用コード: item.code がなければ item.productCode を使用
            const displayCode = item.code || item.productCode || "";
            
            html += `
            <tr>
                <td>${displayCode}</td>
                <td>${item.name}</td>
                <td>¥${item.price.toLocaleString()}</td>
                <td>${item.quantity}</td>
                <td>¥${sub.toLocaleString()}</td>
                <td><button type="button" class="btn-remove" data-code="${displayCode}" style="background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;">削除</button></td>
            </tr>`;
        });

        tbody.innerHTML = html;
        totalSpan.textContent = total.toLocaleString();

        // 削除ボタンのイベント設定
        tbody.querySelectorAll(".btn-remove").forEach(btn => {
            btn.addEventListener("click", function() {
                removeFromCart(this.dataset.code);
            });
        });

        // 警告・備考欄調整ロジック
        updateCartWarnings(details);
    }

    function removeFromCart(code) {
        if(!confirm("カートから削除しますか？")) return;
        
        let cart = JSON.parse(sessionStorage.getItem("cart") || "[]");
        // 削除対象の特定: code または productCode で一致判定
        cart = cart.filter(item => (item.productCode !== code && item.code !== code));
        sessionStorage.setItem("cart", JSON.stringify(cart));
        
        // 再描画
        location.reload();
    }

    function updateCartWarnings(details) {
        const oldWarning = document.querySelector("#dynamic-cart-warning");
        if (oldWarning) oldWarning.remove();

        const noteInput = document.querySelector("#note");
        if (noteInput) noteInput.placeholder = "その他、ご要望などございましたらご記入ください";

        const hasReturn = details.some(item => item.stockStatus && (item.stockStatus.includes("リターン") || item.stockStatus.includes("セミ")));

        if (hasReturn) {
            const warningDiv = document.createElement("div");
            warningDiv.id = "dynamic-cart-warning";
            warningDiv.style.cssText = "background:#f9fafb; color:#374151; padding:15px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:8px;";
            warningDiv.innerHTML = `
                <h4 style="margin:0 0 10px 0; color:#111827; font-size:1rem;">回収（リターン）に関するお願い</h4>
                <ul style="margin:0; padding-left:20px; color:#374151;">
                    <li><strong>回収希望日</strong>をご指定ください。</li>
                    <li><strong>回収先が納品先と異なる場合</strong>は、その住所をご記入ください。</li>
                </ul>
            `;
            const table = document.querySelector("table");
            if (table) table.parentNode.insertBefore(warningDiv, table);

            if (noteInput) {
                noteInput.placeholder = "回収希望日・回収先（納品先と異なる場合は住所・電話番号）をご記入ください";
                noteInput.style.backgroundColor = "#fff";
                noteInput.style.border = "1px solid #d1d5db";
            }
        } else {
            if (noteInput) {
                noteInput.style.backgroundColor = "";
                noteInput.style.border = "";
            }
        }
    }

    // 3. 住所検索関連イベント
    setupAddressSearch("#zip-search-btn", "#zip-code", "#address");
    setupAddressSearch("#shipper-zip-search-btn", "#shipper-zip-code", "#shipper-address");

    function setupAddressSearch(btnSelector, zipSelector, addressSelector) {
        const btn = document.querySelector(btnSelector);
        if (btn) {
            btn.addEventListener("click", async () => {
                const zipInput = document.querySelector(zipSelector);
                const zip = zipInput.value.replace("-", "");
                if (zip.length < 7) { toastWarning("郵便番号は7桁で入力してください"); return; }
                try {
                    const res = await fetch(`/zip-lookup?zipcode=${encodeURIComponent(zip)}`, { credentials: "same-origin" });
                    const data = await res.json();
                    if (data.status === 200 && data.results) {
                        const r = data.results[0];
                        document.querySelector(addressSelector).value = r.address1 + r.address2 + r.address3;
                        toastSuccess("住所を反映しました");
                    } else { toastWarning("住所が見つかりませんでした"); }
                } catch (e) { toastError("住所検索エラー"); }
            });
        }
    }

    // 4. 日付選択ロジック
    const dateModeSelect = document.querySelector("#delivery-date-mode");
    const dateInput = document.querySelector("#delivery-date");
    if (dateModeSelect && dateInput) {
        dateModeSelect.addEventListener("change", (e) => {
            if (e.target.value === "specify") {
                dateInput.style.display = "block";
                dateInput.focus();
                try { if (typeof dateInput.showPicker === "function") dateInput.showPicker(); } catch (err) {}
            } else {
                dateInput.style.display = "none";
                dateInput.value = "";
            }
        });
    }

    // 5. 履歴検索モーダル (共通処理化)
    setupHistoryModal("#open-history-modal-btn", "#history-modal", "#close-modal-btn", 
        "#history-list-container", "#history-search-input", "/delivery-history", 
        (item) => {
            document.querySelector("#zip-code").value = item.zip || "";
            document.querySelector("#address").value = item.address || "";
            document.querySelector("#recipient-name").value = item.name || "";
            document.querySelector("#tel-number").value = item.tel || "";
        }
    );

    setupHistoryModal("#open-shipper-history-modal-btn", "#shipper-history-modal", "#close-shipper-modal-btn", 
        "#shipper-history-list-container", "#shipper-history-search-input", "/shipper-history",
        (item) => {
            document.querySelector("#shipper-zip-code").value = item.zip || "";
            document.querySelector("#shipper-address").value = item.address || "";
            document.querySelector("#shipper-name").value = item.name || "";
            document.querySelector("#shipper-tel").value = item.tel || "";
        }
    );

    function setupHistoryModal(openBtnSel, modalSel, closeBtnSel, containerSel, searchInputSel, apiUrl, onClickItem) {
        const openBtn = document.querySelector(openBtnSel);
        const modal = document.querySelector(modalSel);
        const closeBtn = document.querySelector(closeBtnSel);
        const container = document.querySelector(containerSel);
        const searchInput = document.querySelector(searchInputSel);

        async function doSearch(keyword = "") {
            container.innerHTML = "<p style='padding:10px; color:#666;'>検索中...</p>";
            try {
                const res = await fetch(`${apiUrl}?keyword=${encodeURIComponent(keyword)}`);
                const data = await res.json();
                if (data.success) {
                    renderList(data.list);
                } else {
                    container.innerHTML = "<p style='padding:10px; color:red;'>取得失敗</p>";
                }
            } catch (e) {
                console.error(e);
                container.innerHTML = "<p style='padding:10px; color:red;'>通信エラー</p>";
            }
        }

        function renderList(list) {
            container.innerHTML = "";
            if (!list || list.length === 0) {
                container.innerHTML = "<p style='padding:10px; color:#888;'>一致する履歴がありません</p>";
                return;
            }
            list.forEach(item => {
                const div = document.createElement("div");
                div.className = "history-item";
                const nameDisp = item.name ? `<span style="font-weight:bold;">${item.name}</span>` : "<span style='color:#ccc;'>(宛名なし)</span>";
                div.innerHTML = `
                    <div style="font-size:0.95rem;">${item.zip ? "〒" + item.zip : ""} ${item.address}</div>
                    <div style="font-size:0.95rem; margin-top:4px;">${nameDisp}</div>
                    <div style="font-size:0.85rem; color:#555; margin-top:2px;">${item.tel || ""}</div>
                `;
                div.addEventListener("click", () => {
                    onClickItem(item);
                    modal.classList.remove("active");
                });
                container.appendChild(div);
            });
        }

        if (openBtn && modal) {
            openBtn.addEventListener("click", () => {
                modal.classList.add("active");
                searchInput.value = "";
                searchInput.focus();
                doSearch("");
            });
            closeBtn.addEventListener("click", () => modal.classList.remove("active"));
            let debounceTimer;
            searchInput.addEventListener("input", (e) => {
                const keyword = e.target.value;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => doSearch(keyword), 300);
            });
        }
    }

    // ---------------------------------------------------------
    // ★ 6. 見積書発行
    // ---------------------------------------------------------
    const estimateBtn = document.querySelector("#estimate-btn");
    if (estimateBtn) {
        estimateBtn.addEventListener("click", () => {
            const customerInfo = {
                name: document.querySelector("#recipient-name").value || "お客様",
                address: document.querySelector("#address").value || "",
                zip: document.querySelector("#zip-code").value || "",
                tel: document.querySelector("#tel-number").value || "",
                deliveryDate: document.querySelector("#delivery-date").value
            };

            if (typeof EstimatePdfGenerator !== "undefined") {
                const generator = new EstimatePdfGenerator();
                generator.generate(loadedCartData, customerInfo, cachedPublicBranding || {});
            } else {
                toastError("見積書生成モジュールが読み込まれていません");
            }
        });
    }

    // 7. 注文確定処理
    const orderButton = document.querySelector("#place-order-btn");
    if (orderButton) {
        orderButton.addEventListener("click", async () => {
            const dateMode = document.querySelector("#delivery-date-mode").value;
            let dDate = (dateMode === "specify") ? document.querySelector("#delivery-date").value : "最短";

            const zip = document.querySelector("#zip-code").value;
            const tel = document.querySelector("#tel-number").value;
            const addr = document.querySelector("#address").value;
            const name = document.querySelector("#recipient-name").value;
            const note = document.querySelector("#note").value;

            const shipperZip = document.querySelector("#shipper-zip-code").value;
            const shipperAddr = document.querySelector("#shipper-address").value;
            const shipperName = document.querySelector("#shipper-name").value;
            const shipperTel = document.querySelector("#shipper-tel").value;
            const clientOrderNumber = document.querySelector("#client-order-number").value;

            if (!zip || !tel || !addr || !name) {
                toastWarning("必須項目（郵便番号・電話・住所・宛名）をすべて入力してください");
                return;
            }

            // ★重要: sessionStorage の生データ(IDのみ)ではなく、
            // loadedCartData (サーバーから取得済みの詳細データ) を送信する
            // これにより商品名や価格の欠落を防止する
            if (!loadedCartData || loadedCartData.length === 0) {
                toastError("カート情報が読み込まれていません。画面をリロードしてください。");
                return;
            }

            // 送信データの整形: サーバーが期待する形式に合わせる
            const payloadCart = loadedCartData.map(item => {
                // キー名の揺らぎを吸収して安全なオブジェクトを作成
                const safeCode = item.code || item.productCode || "";
                return {
                    code: safeCode,           // サーバーは 'code' を期待
                    productCode: safeCode,    // 念のため両方
                    name: item.name || "名称不明",
                    price: item.price || 0,
                    quantity: item.quantity
                };
            });

            orderButton.disabled = true;
            orderButton.innerText = "処理中...";

            try {
                // ★修正: /api を削除 (/place-order)
                const response = await fetch("/place-order", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        cart: payloadCart, // 詳細データを送信
                        deliveryInfo: {
                            date: dDate, zip: zip, tel: tel, address: addr, name: name,
                            note: note + ` (宛名: ${name}, TEL: ${tel})`,
                            clientOrderNumber: clientOrderNumber,
                            shipper: { zip: shipperZip, address: shipperAddr, name: shipperName, tel: shipperTel }
                        }
                    })
                });

                const result = await response.json();
                if (result.success) {
                    toastSuccess("注文が完了しました！", 2000);
                    sessionStorage.removeItem("cart");
                    // 少し待ってから遷移（トースト表示を確認できるように）
                    setTimeout(() => { window.location.href = "home.html"; }, 1500);
                } else {
                    toastError("注文失敗: " + result.message);
                    orderButton.disabled = false;
                    orderButton.innerText = "注文を確定する";
                }
            } catch (e) {
                toastError("通信エラーが発生しました");
                orderButton.disabled = false;
                orderButton.innerText = "注文を確定する";
            }
        });
    }
});