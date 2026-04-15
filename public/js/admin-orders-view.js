// public/js/admin-orders-view.js
// 【役割】注文画面のHTML生成・DOM構築を担当する専門職人
(function(window) {
    console.log("🎨 Order View Module Loaded");

    const OrderView = {};

    function escapeAttr(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");
    }

    /**
     * 注文日などを YYYY/MM/DD で表示（時刻なし）。一覧フィルタの JST 日付扱いに合わせる。
     */
    OrderView.formatOrderDateYmdSlash = function(orderDate) {
        const d = new Date(orderDate);
        if (Number.isNaN(d.getTime())) return "—";
        const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
        const x = new Date(jstMs);
        const y = x.getUTCFullYear();
        const m = String(x.getUTCMonth() + 1).padStart(2, "0");
        const day = String(x.getUTCDate()).padStart(2, "0");
        return y + "/" + m + "/" + day;
    };

    /**
     * 候補リストのoption生成（得意先・商品・注文IDを1つの datalist に統合）
     */
    OrderView.generateSearchCandidates = function(orders, suggestionsList) {
        const merged = new Set();

        orders.forEach(order => {
            const oid = order.orderId != null && String(order.orderId).trim() !== "" ? String(order.orderId) : null;
            if (oid) merged.add(oid);

            const cId = order.customerId || "ID不明";
            const cName = order.customerName || "名称不明";
            merged.add(`(${cId}) ${cName}`);

            if (order.items) {
                order.items.forEach(item => {
                    merged.add(`(${item.code}) ${item.name}`);
                });
            }
        });

        const CANDIDATE_LIMIT = 40;

        if (suggestionsList) {
            suggestionsList.innerHTML = "";
            Array.from(merged).sort().slice(0, CANDIDATE_LIMIT).forEach(val => {
                const option = document.createElement("option");
                option.value = val;
                suggestionsList.appendChild(option);
            });
        }
    };

    /**
     * 一覧行用セルHTMLと詳細パネル用HTMLを生成
     */
    OrderView.generateOrderCardHTML = function(order) {
        const orderDateStr = OrderView.formatOrderDateYmdSlash(order.orderDate);
        const totalAmount = order.totalAmount || 0;
        const info = order.deliveryInfo || {};
        
        let statusColor;
        let statusFg;
        let statusBorder;
        if (order.status === "発送済") {
            statusColor = "#ffffff";
            statusFg = "inherit";
            statusBorder = "#e5e7eb";
        } else if (order.status === "一部発送") {
            statusColor = "#ff7575";
            statusFg = "#ffffff";
            statusBorder = "#e86666";
        } else {
            statusColor = "#ff7575";
            statusFg = "#ffffff";
            statusBorder = "#e86666";
        }

        // 連携ステータス表示（一覧は記号のみ／title で補足）
        let exportBadge =
            '<span class="col-export-mark col-export-no" title="未連携" aria-label="未連携">✕</span>';
        if (order.exported_at) {
            exportBadge =
                '<span class="col-export-mark col-export-yes" title="連携済" aria-label="連携済">◯</span>';
        }

        const deliveryName = info.name || "（宛名なし）";
        const cName = order.customerName || "名称不明";
        const customerCellHtml = `<span>${cName}</span>`;

        const deliveryCellHtml = `<span>${deliveryName} 様</span>`;

        let tableHTML = `
            <table style="width:100%; margin-top:10px; border-collapse:collapse; font-size: 0.95rem;">
                <thead style="background:#f3f4f6;">
                    <tr>
                        <th style="padding:8px; text-align:left;">商品名</th>
                        <th style="padding:8px; text-align:right;">総数量</th>
                        <th style="padding:8px; text-align:right;">金額</th>
                    </tr>
                </thead>
                <tbody style="background:#f3f4f6;">`;
        let detailTotalQty = 0;
        let detailTotalAmount = 0;
        (order.items || []).forEach(item => {
            const qty = Number(item.quantity) || 0;
            const sub = (item.price || 0) * qty;
            detailTotalQty += qty;
            detailTotalAmount += sub;
            tableHTML += `
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px;">${item.name}</td>
                    <td style="padding:8px; text-align:right;">${qty}</td>
                    <td style="padding:8px; text-align:right;">¥${sub.toLocaleString()}</td>
                </tr>`;
        });
        tableHTML += `
                <tr style="border-top:2px solid #d1d5db; font-weight:600;">
                    <td style="padding:8px;">合計</td>
                    <td style="padding:8px; text-align:right;">${detailTotalQty}</td>
                    <td style="padding:8px; text-align:right;">¥${detailTotalAmount.toLocaleString()}</td>
                </tr>
                </tbody></table>`;

        const orderIdAttr = escapeAttr(order.orderId != null ? order.orderId : "");
        const summaryCellsHtml = `
            <td class="col-select">
                <input type="checkbox" class="order-row-select" data-order-id="${orderIdAttr}" title="選択" aria-label="この注文を選択">
            </td>
            <td class="col-date">${orderDateStr}</td>
            <td class="col-id"><strong>${order.orderId}</strong></td>
            <td class="col-status">
                <span style="background-color: ${statusColor}; color: ${statusFg}; border: 1px solid ${statusBorder}; padding: 2px 5px; border-radius: 3px; font-size: 0.6875rem; font-weight: 600; white-space: nowrap; line-height: 1.25;">
                    ${order.status || "未発送"}
                </span>
            </td>
            <td class="col-party">${customerCellHtml}</td>
            <td class="col-product">${deliveryCellHtml}</td>
            <td class="col-numeric"><strong>¥${totalAmount.toLocaleString()}</strong></td>
            <td class="col-export">${exportBadge}</td>
            <td class="col-action">
                <button type="button" class="btn-toggle-detail" style="box-sizing: border-box; padding: 4px 10px; background: #a1d8e6; color: #111827; border: 1px solid #a1d8e6; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; font-family: inherit; line-height: 1.25; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); display: inline-flex; align-items: center; justify-content: center;">
                    詳細 ▼
                </button>
            </td>`;

        let dateDisplay = info.date || "指定なし";
        if(info.dateUnknown) dateDisplay = `<span style="color:#ef4444; font-weight:bold;">⚠ 確約不可</span>`;

        const detailContent = `
            <div style="margin:10px 0; padding:15px; background:#f9fafb; border-radius: 8px; border:1px solid #e5e7eb;">
                <div style="display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px 20px; align-items:start;">
                    <div style="min-width:0;"><strong>納品先：</strong> ${info.name || ""} 様 / ${info.address || ""}</div>
                    <div style="white-space:nowrap;"><strong>納品日：</strong> ${dateDisplay}</div>
                </div>
            </div>
            ${tableHTML}
            <div style="margin:10px 0 0 0; padding:15px; background:#f9fafb; border-radius: 8px; border:1px solid #e5e7eb;">
                <div><strong>備考：</strong> ${info.note || "なし"}</div>
            </div>
        `;

        return { summaryCellsHtml: summaryCellsHtml, detailContent: detailContent };
    };

    /**
     * 出荷操作エリアのDOM生成 (イベントもここで紐付け)
     * @param {Object} order - 注文データ
     * @param {Object} actions - コールバック関数群 { updateDeliveryEstimate, registerBatch, deleteOrder }
     */
    OrderView.createOperationArea = function(order, actions) {
        const operationArea = document.createElement("div");
        operationArea.style.marginTop = "15px";
        operationArea.style.padding = "15px";
        operationArea.style.backgroundColor = "#f1f5f9";
        operationArea.style.borderRadius = "8px";
        operationArea.style.border = "1px solid #e5e7eb";

        const deliveryInfo = order.deliveryInfo || {};
        const savedDate = deliveryInfo.date || ""; 
        const isDateUnknown = deliveryInfo.dateUnknown === true;
        const savedEstimate = deliveryInfo.estimateMessage || "";
        let dateValueForInput = "";
        if(savedDate && /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(savedDate)) {
            dateValueForInput = savedDate.replace(/\//g, "-");
        }
        
        const defaultCompany = order.deliveryCompany || "";
        const defaultNumber = order.trackingNumber || "";

        operationArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid #e5e7eb; padding-bottom:8px;">
                <h4 style="margin:0; font-size:1rem; color:#111827;">🚛 出荷オペレーション</h4>
                <label style="font-size:0.9rem; font-weight:bold; cursor:pointer; color:#3b82f6;">
                    <input type="checkbox" class="check-individual-mode"> 個別配送モード(便を分ける)
                </label>
            </div>
            <div class="estimate-message-area" style="display:flex; align-items:flex-end; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                <div style="flex-grow:1; min-width:200px;">
                    <label style="font-size:0.8rem; font-weight:bold; display:block;">📅 納期目安（顧客に表示）</label>
                    <input type="text" class="input-estimate-message" value="${(savedEstimate || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}" 
                        placeholder="例: 納期確認中 / メーカー取り寄せ2週間程度 / メーカー欠品中納期未定 / CANON直送のため納期確認中" 
                        style="width:100%; padding:6px; box-sizing:border-box; border:1px solid #e5e7eb; border-radius:8px;">
                </div>
                <button class="btn-update-estimate" style="background:#38bdf8; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-weight:bold; white-space:nowrap;">
                    納期目安の更新
                </button>
            </div>
            <div class="global-input-area" style="display:flex; gap:15px; flex-wrap:wrap; margin-bottom:15px;">
                <div class="date-input-group" style="background:#fff; padding:8px; border-radius:8px; border:1px solid #e5e7eb;">
                    <label style="font-size:0.8rem; font-weight:bold; display:block;">納品予定日（一括設定）</label>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="date" class="input-delivery-date" value="${dateValueForInput}" style="padding:4px;">
                        <label style="font-size:0.8rem; cursor:pointer;">
                            <input type="checkbox" class="check-date-unknown" ${isDateUnknown ? "checked" : ""}> 確約不可
                        </label>
                    </div>
                </div>
                <div class="shipping-info-group" style="display:flex; gap:15px; flex-grow:1;">
                    <div style="flex-grow:1;">
                        <label style="font-size:0.8rem; font-weight:bold; display:block;">配送業者 (一括)</label>
                        <input type="text" class="input-company" value="${defaultCompany}" placeholder="例: ヤマト運輸" style="width:100%; padding:6px; box-sizing:border-box;">
                    </div>
                    <div style="flex-grow:1;">
                        <label style="font-size:0.8rem; font-weight:bold; display:block;">送り状番号 (一括)</label>
                        <input type="text" class="input-number" value="${defaultNumber}" placeholder="1234-5678-9012" style="width:100%; padding:6px; box-sizing:border-box;">
                    </div>
                </div>
            </div>
            <div class="shipment-qty-area" style="background:#fff; padding:10px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:15px;">
                <p style="margin:0 0 5px 0; font-weight:bold; font-size:0.9rem;">📦 出荷する数量を入力</p>
                <table style="width:100%; font-size:0.9rem; border-collapse:collapse;">
                    <thead style="background:#f3f4f6;">
                        <tr>
                            <th style="text-align:left; padding:5px;">商品名</th>
                            <th style="text-align:center; padding:5px;">注文数</th>
                            <th style="text-align:center; padding:5px;">済</th>
                            <th style="text-align:center; padding:5px; color:#ec4899;">残数</th>
                            <th style="text-align:left; padding:5px;">今回出荷</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${order.items.map((item, idx) => {
                            let shippedCount = 0;
                            if(order.shipments) {
                                order.shipments.forEach(s => {
                                    const found = s.items.find(si => si.code === item.code);
                                    if(found) shippedCount += found.quantity;
                                });
                            }
                            const remaining = item.quantity - shippedCount;
                            const isDone = remaining <= 0;
                            return `
                            <tr class="item-row" data-code="${item.code}" style="${isDone ? 'opacity:0.5; background:#f3f4f6;' : ''}">
                                <td style="padding:5px;">
                                    ${item.name}<br><span style="font-size:0.8em; color:#6b7280;">${item.code}</span>
                                    <div class="individual-inputs" style="display:none; margin-top:5px; padding:5px; background:#f1f5f9; border-radius:6px;">
                                        <input type="text" class="ind-company" placeholder="配送業者" value="${defaultCompany}" style="width:45%; padding:2px; font-size:0.8rem;">
                                        <input type="text" class="ind-number" placeholder="送り状番号" value="${defaultNumber}" style="width:50%; padding:2px; font-size:0.8rem;">
                                    </div>
                                </td>
                                <td style="padding:5px; text-align:center;">${item.quantity}</td>
                                <td style="padding:5px; text-align:center;">${shippedCount}</td>
                                <td style="padding:5px; text-align:center; font-weight:bold; color:#ec4899;">${remaining}</td>
                                <td style="padding:5px;">
                                    <input type="number" class="input-ship-qty" 
                                        data-idx="${idx}" data-code="${item.code}" data-name="${item.name}"
                                        value="${remaining}" min="0" max="${remaining}" ${isDone ? 'disabled' : ''}
                                        style="width:60px; padding:5px; font-weight:bold; text-align:right;">
                                </td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-register-shipment" style="background:#22c55e; color:white; border:none; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    出荷確定 (WEB反映のみ)
                </button>
            </div>
            <div class="order-delete-area" style="margin-top:16px; padding-top:14px; border-top:1px dashed #e5e7eb; display:flex; align-items:center; flex-wrap:wrap; gap:10px; justify-content:flex-end;">
                ${order.exported_at ? `<button type="button" class="btn-reset-export" style="background:#6b7280; color:#fff; border:none; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.85rem;">未連携に</button>` : ""}
                <button type="button" class="btn-delete-order" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.85rem;">
                    削除
                </button>
            </div>
        `;

        const dateInput = operationArea.querySelector(".input-delivery-date");
        const dateUnknownCheck = operationArea.querySelector(".check-date-unknown");
        const individualModeCheck = operationArea.querySelector(".check-individual-mode");
        const shippingInfoGroup = operationArea.querySelector(".shipping-info-group");
        const itemRows = operationArea.querySelectorAll(".item-row");

        dateUnknownCheck.addEventListener("change", () => {
            if(dateUnknownCheck.checked) dateInput.value = ""; 
        });
        dateInput.addEventListener("input", () => {
            if(dateInput.value) dateUnknownCheck.checked = false; 
        });

        individualModeCheck.addEventListener("change", function() {
            const isInd = this.checked;
            if(isInd) {
                shippingInfoGroup.querySelector(".input-company").disabled = true;
                shippingInfoGroup.querySelector(".input-number").disabled = true;
                shippingInfoGroup.style.opacity = "0.4";
                itemRows.forEach(row => {
                    const inputs = row.querySelector(".individual-inputs");
                    if(inputs) inputs.style.display = "block";
                });
            } else {
                shippingInfoGroup.querySelector(".input-company").disabled = false;
                shippingInfoGroup.querySelector(".input-number").disabled = false;
                shippingInfoGroup.style.opacity = "1";
                itemRows.forEach(row => {
                    const inputs = row.querySelector(".individual-inputs");
                    if(inputs) inputs.style.display = "none";
                });
            }
        });

        // 納期目安の更新ボタン
        operationArea.querySelector(".btn-update-estimate").addEventListener("click", function() {
            const text = operationArea.querySelector(".input-estimate-message").value.trim();
            if(actions.updateDeliveryEstimate) {
                actions.updateDeliveryEstimate(order.orderId, text);
            }
        });

        // 出荷確定ボタン
        operationArea.querySelector(".btn-register-shipment").addEventListener("click", function() {
            const isInd = individualModeCheck.checked;
            const d = dateInput.value;
            const du = dateUnknownCheck.checked;
            let formattedDate = d ? d.replace(/-/g, "/") : "";

            const shipItems = [];
            const inputs = operationArea.querySelectorAll(".input-ship-qty");
            
            inputs.forEach(input => {
                if(input.disabled) return;
                const qty = parseInt(input.value);
                if(qty > 0) {
                    const row = input.closest("tr");
                    const indCompany = row.querySelector(".ind-company").value;
                    const indNumber = row.querySelector(".ind-number").value;
                    shipItems.push({
                        code: input.dataset.code, name: input.dataset.name, quantity: qty,
                        company: isInd ? indCompany : null, number: isInd ? indNumber : null
                    });
                }
            });

            if(shipItems.length === 0) {
                toastWarning("出荷する商品の数量が0です");
                return;
            }

            if(!confirm(`【出荷登録】\n合計 ${shipItems.length} 明細を出荷として登録しますか？\n(お客様へのメール通知は行われません)`)) return;

            let finalPayload = [];
            if (!isInd) {
                const gCompany = operationArea.querySelector(".input-company").value;
                const gNumber = operationArea.querySelector(".input-number").value;
                finalPayload.push({
                    deliveryCompany: gCompany, trackingNumber: gNumber,
                    deliveryDate: formattedDate, deliveryDateUnknown: du,
                    items: shipItems.map(i => ({ code: i.code, name: i.name, quantity: i.quantity }))
                });
            } else {
                const groups = {};
                shipItems.forEach(item => {
                    const key = `${item.company || ""}::${item.number || ""}`;
                    if(!groups[key]) groups[key] = { company: item.company, number: item.number, items: [] };
                    groups[key].items.push({ code: item.code, name: item.name, quantity: item.quantity });
                });
                Object.values(groups).forEach(g => {
                    finalPayload.push({
                        deliveryCompany: g.company, trackingNumber: g.number,
                        deliveryDate: formattedDate, deliveryDateUnknown: du, items: g.items
                    });
                });
            }
            
            // ★コールバック実行
            if(actions.registerBatch) {
                actions.registerBatch(order.orderId, finalPayload);
            }
        });

        const btnDeleteOrder = operationArea.querySelector(".btn-delete-order");
        if (btnDeleteOrder && actions.deleteOrder) {
            btnDeleteOrder.addEventListener("click", function () {
                actions.deleteOrder(order.orderId, order);
            });
        }

        return operationArea;
    };

    // グローバル公開
    window.OrderView = OrderView;

})(window);