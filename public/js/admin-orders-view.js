// public/js/admin-orders-view.js
// 【役割】注文画面のHTML生成・DOM構築を担当する専門職人
(function(window) {
    console.log("🎨 Order View Module Loaded");

    const OrderView = {};

    /**
     * 候補リストのoption生成
     */
    OrderView.generateSplitCandidates = function(orders, custCandidatesList, prodCandidatesList) {
        const custSet = new Set();
        const prodSet = new Set();

        orders.forEach(order => {
            const cId = order.customerId || "ID不明";
            const cName = order.customerName || "名称不明";
            custSet.add(`(${cId}) ${cName}`);
            
            if (order.items) {
                order.items.forEach(item => {
                    prodSet.add(`(${item.code}) ${item.name}`);
                });
            }
        });

        const CANDIDATE_LIMIT = 20;

        if (custCandidatesList) {
            custCandidatesList.innerHTML = "";
            Array.from(custSet).sort().slice(0, CANDIDATE_LIMIT).forEach(val => {
                const option = document.createElement("option");
                option.value = val;
                custCandidatesList.appendChild(option);
            });
        }

        if (prodCandidatesList) {
            prodCandidatesList.innerHTML = "";
            Array.from(prodSet).sort().slice(0, CANDIDATE_LIMIT).forEach(val => {
                const option = document.createElement("option");
                option.value = val;
                prodCandidatesList.appendChild(option);
            });
        }
    };

    /**
     * 注文カードのHTML文字列を生成 (Summary & Detail)
     */
    OrderView.generateOrderCardHTML = function(order) {
        const orderDate = new Date(order.orderDate).toLocaleString("ja-JP");
        const totalAmount = order.totalAmount || 0;
        const info = order.deliveryInfo || {};
        
        let statusColor = "#dc3545"; 
        if (order.status === "発送済") statusColor = "#28a745"; 
        else if (order.status === "一部発送") statusColor = "#fd7e14"; 

        // 連携ステータス表示
        let exportBadge = `<span class="badge-unexported">未連携</span>`;
        if (order.exported_at) {
            const expDate = new Date(order.exported_at);
            const expStr = `${expDate.getMonth()+1}/${expDate.getDate()} ${expDate.getHours()}:${String(expDate.getMinutes()).padStart(2,'0')}`;
            exportBadge = `<span class="badge-exported">連携済 (${expStr})</span>`;
        }

        let itemSummary = "商品なし";
        if (order.items && order.items.length > 0) {
            const firstItem = order.items[0];
            const extraCount = order.items.length - 1;
            itemSummary = extraCount > 0 ? `${firstItem.name} <span style="color:#666;">(+他${extraCount}点)</span>` : firstItem.name;
        }

        const deliveryName = info.name || "（宛名なし）";
        const cName = order.customerName || "名称不明";
        let headerInfo = `<span style="font-weight:bold; font-size:1.05rem;">➡ ${deliveryName} 様</span>`;
        headerInfo += ` <span style="font-size:0.85rem; color:#666;">(請求: ${cName})</span>`;

        if (info.clientOrderNumber) headerInfo = `<span style="color:#007bff; font-weight:bold;">[No:${info.clientOrderNumber}]</span> ` + headerInfo;
        if (info.shipper && info.shipper.name) headerInfo += ` <span style="color:#28a745; font-size:0.9em;">(荷主:${info.shipper.name})</span>`;

        let historyHTML = "";
        if (order.shipments && order.shipments.length > 0) {
            historyHTML += `<div style="margin-top:10px; padding:10px; background:#e2e6ea; border-radius:4px; border-left:4px solid #17a2b8;">`;
            historyHTML += `<h5 style="margin:0 0 5px 0; color:#495057;">🚚 過去の出荷履歴 (修正可)</h5>`;
            order.shipments.forEach((ship, idx) => {
                const dateStr = new Date(ship.shippedDate).toLocaleDateString();
                const safeCompany = ship.deliveryCompany || "";
                const safeNumber = ship.trackingNumber || "";
                let shipDelivDate = ship.deliveryDate || "";
                const shipDateUnknown = ship.deliveryDateUnknown === true;
                let shipDateDisplay = shipDelivDate;
                if(shipDateUnknown) shipDateDisplay = `<span style="color:red; font-weight:bold;">確約不可</span>`;
                let dateValueForInput = "";
                if(shipDelivDate && /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(shipDelivDate)) {
                    dateValueForInput = shipDelivDate.replace(/\//g, "-");
                }

                historyHTML += `
                <div class="shipment-row" data-shipment-id="${ship.shipmentId}" style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #ccc;">
                    <div class="view-mode" style="display:block;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <strong>[便${idx+1}] ${dateStr}</strong>
                                <span style="margin-left:5px;">${safeCompany} (No.${safeNumber})</span>
                                <div style="font-size:0.85rem; color:#007bff; margin-top:2px;">
                                    納品指定: ${shipDateDisplay || "指定なし"}
                                </div>
                            </div>
                            <button class="btn-edit-shipment" data-shipment-id="${ship.shipmentId}" 
                                style="font-size:0.8rem; padding:2px 8px; background:#ffc107; border:none; border-radius:3px; cursor:pointer;">
                                修正
                            </button>
                        </div>
                        <div style="font-size:0.9rem; color:#666;">
                            ${ship.items.map(i => `・${i.name} x${i.quantity}`).join(" ")}
                        </div>
                    </div>
                    <div class="edit-mode" style="display:none; background:#fff; padding:10px; border:1px solid #ffc107; border-radius:3px;">
                        <div style="font-size:0.8rem; font-weight:bold; color:#d39e00; margin-bottom:5px;">⚠️ 履歴データの修正</div>
                        <div style="margin-bottom:8px;">
                            <label style="font-size:0.8rem; display:block;">納品予定日修正:</label>
                            <div style="display:flex; align-items:center; gap:5px;">
                                <input type="date" class="edit-date" value="${dateValueForInput}" style="padding:4px;">
                                <label style="font-size:0.8rem;"><input type="checkbox" class="edit-date-unknown" ${shipDateUnknown ? "checked" : ""}> 確約不可</label>
                            </div>
                        </div>
                        <div style="display:flex; gap:5px; margin-bottom:5px;">
                            <input type="text" class="edit-company" value="${safeCompany}" placeholder="配送業者" style="width:40%; padding:4px;">
                            <input type="text" class="edit-number" value="${safeNumber}" placeholder="送り状番号" style="width:60%; padding:4px;">
                        </div>
                        <div style="text-align:right;">
                            <button class="btn-cancel-edit" data-shipment-id="${ship.shipmentId}" style="font-size:0.8rem; padding:3px 8px; background:#6c757d; color:white; border:none; border-radius:3px; cursor:pointer; margin-right:5px;">キャンセル</button>
                            <button class="btn-save-shipment" data-shipment-id="${ship.shipmentId}" style="font-size:0.8rem; padding:3px 8px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">保存</button>
                        </div>
                    </div>
                </div>`;
            });
            historyHTML += `</div>`;
        }

        let tableHTML = `
            <table style="width:100%; margin-top:10px; border-collapse:collapse; font-size: 0.95rem;">
                <thead style="background:#f1f1f1;">
                    <tr>
                        <th style="padding:8px; text-align:left;">商品名</th>
                        <th style="padding:8px; text-align:right;">総数量</th>
                        <th style="padding:8px; text-align:right;">金額</th>
                    </tr>
                </thead>
                <tbody>`;
        order.items.forEach(item => {
            const sub = (item.price || 0) * item.quantity;
            tableHTML += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${item.name}</td>
                    <td style="padding:8px; text-align:right;">${item.quantity}</td>
                    <td style="padding:8px; text-align:right;">¥${sub.toLocaleString()}</td>
                </tr>`;
        });
        tableHTML += `</tbody></table>`;

        const summaryHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex-grow: 1;">
                <div style="margin-bottom: 5px;">
                    <span style="background-color: ${statusColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; margin-right: 8px;">
                        ${order.status || "未発送"}
                    </span>
                    <strong style="margin-right: 10px;">ID: ${order.orderId}</strong>
                    <span style="color: #666; font-size: 0.9rem;">${orderDate}</span>
                </div>
                <div style="margin-bottom: 5px;">${headerInfo}</div>
                <div style="margin-bottom: 5px;">${exportBadge}</div>
                <div style="color: #555;">${itemSummary}</div>
            </div>
            <div style="text-align: right; min-width: 120px;">
                <div style="font-weight: bold; font-size: 1.2rem; margin-bottom: 8px;">¥${totalAmount.toLocaleString()}</div>
                <button class="btn-toggle-detail" style="padding: 6px 12px; background-color: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    詳細 ▼
                </button>
            </div>
        </div>`;

        let dateDisplay = info.date || "指定なし";
        if(info.dateUnknown) dateDisplay = `<span style="color:#dc3545; font-weight:bold;">⚠ 確約不可</span>`;

        let resetBtnHtml = "";
        if(order.exported_at) {
            resetBtnHtml = `<div style="text-align:right; margin-bottom:10px;">
                <button class="btn-reset-export" style="font-size:0.75rem; padding:4px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px; cursor:pointer;">
                    ↩ 連携状態をリセット(未連携に戻す)
                </button>
            </div>`;
        }

        const detailContent = `
            <div style="margin:10px 0; padding:15px; background:#f8f9fa; border-radius: 5px;">
                ${resetBtnHtml}
                <div><strong>納品先:</strong> ${info.name || ""} 様 / ${info.address || ""}</div>
                <div><strong>納品日:</strong> ${dateDisplay}</div>
                <div><strong>備考:</strong> ${info.note || "なし"}</div>
            </div>
            ${historyHTML}
            ${tableHTML}
        `;

        return { summary: summaryHTML, detailContent: detailContent };
    };

    /**
     * 出荷操作エリアのDOM生成 (イベントもここで紐付け)
     * @param {Object} order - 注文データ
     * @param {Object} actions - コールバック関数群 { updateDeliveryEstimate, registerBatch }
     */
    OrderView.createOperationArea = function(order, actions) {
        const operationArea = document.createElement("div");
        operationArea.style.marginTop = "15px";
        operationArea.style.padding = "15px";
        operationArea.style.backgroundColor = "#f1f3f5";
        operationArea.style.borderRadius = "5px";
        operationArea.style.border = "1px solid #dee2e6";

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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid #007bff; padding-bottom:5px;">
                <h4 style="margin:0; font-size:1rem;">🚛 出荷オペレーション</h4>
                <label style="font-size:0.9rem; font-weight:bold; cursor:pointer; color:#007bff;">
                    <input type="checkbox" class="check-individual-mode"> 個別配送モード(便を分ける)
                </label>
            </div>
            <div class="estimate-message-area" style="display:flex; align-items:flex-end; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                <div style="flex-grow:1; min-width:200px;">
                    <label style="font-size:0.8rem; font-weight:bold; display:block;">📅 納期目安（顧客に表示）</label>
                    <input type="text" class="input-estimate-message" value="${(savedEstimate || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}" 
                        placeholder="例: 納期確認中 / メーカー取り寄せ2週間程度 / メーカー欠品中納期未定 / CANON直送のため納期確認中" 
                        style="width:100%; padding:6px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
                </div>
                <button class="btn-update-estimate" style="background:#17a2b8; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer; font-weight:bold; white-space:nowrap;">
                    納期目安の更新
                </button>
            </div>
            <div class="global-input-area" style="display:flex; gap:15px; flex-wrap:wrap; margin-bottom:15px;">
                <div class="date-input-group" style="background:#fff; padding:8px; border-radius:4px; border:1px solid #ccc;">
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
            <div class="shipment-qty-area" style="background:#fff; padding:10px; border:1px solid #ddd; margin-bottom:15px;">
                <p style="margin:0 0 5px 0; font-weight:bold; font-size:0.9rem;">📦 出荷する数量を入力</p>
                <table style="width:100%; font-size:0.9rem; border-collapse:collapse;">
                    <thead style="background:#f8f9fa;">
                        <tr>
                            <th style="text-align:left; padding:5px;">商品名</th>
                            <th style="text-align:center; padding:5px;">注文数</th>
                            <th style="text-align:center; padding:5px;">済</th>
                            <th style="text-align:center; padding:5px; color:#d63384;">残数</th>
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
                            <tr class="item-row" data-code="${item.code}" style="${isDone ? 'opacity:0.5; background:#eee;' : ''}">
                                <td style="padding:5px;">
                                    ${item.name}<br><span style="font-size:0.8em; color:#666;">${item.code}</span>
                                    <div class="individual-inputs" style="display:none; margin-top:5px; padding:5px; background:#e2e6ea; border-radius:3px;">
                                        <input type="text" class="ind-company" placeholder="配送業者" value="${defaultCompany}" style="width:45%; padding:2px; font-size:0.8rem;">
                                        <input type="text" class="ind-number" placeholder="送り状番号" value="${defaultNumber}" style="width:50%; padding:2px; font-size:0.8rem;">
                                    </div>
                                </td>
                                <td style="padding:5px; text-align:center;">${item.quantity}</td>
                                <td style="padding:5px; text-align:center;">${shippedCount}</td>
                                <td style="padding:5px; text-align:center; font-weight:bold; color:#d63384;">${remaining}</td>
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
                <button class="btn-register-shipment" style="background:#28a745; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    出荷確定 (WEB反映のみ)
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

        return operationArea;
    };

    // グローバル公開
    window.OrderView = OrderView;

})(window);