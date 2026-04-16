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
        const dcTrim = String(defaultCompany).trim();
        let checkSagawa = "";
        let checkSeino = "";
        let checkYamato = "";
        let checkOther = "";
        let otherCarrierValueAttr = "";
        if (dcTrim === "佐川急便" || dcTrim === "佐川") checkSagawa = " checked";
        else if (dcTrim === "西濃運輸") checkSeino = " checked";
        else if (dcTrim === "ヤマト運輸") checkYamato = " checked";
        else if (dcTrim) {
            checkOther = " checked";
            otherCarrierValueAttr = ` value="${escapeAttr(dcTrim)}"`;
        }

        let indOpt0 = "";
        let indOptSagawa = "";
        let indOptSeino = "";
        let indOptYamato = "";
        let indOptOther = "";
        if (!dcTrim) indOpt0 = " selected";
        else if (dcTrim === "佐川急便" || dcTrim === "佐川") indOptSagawa = " selected";
        else if (dcTrim === "西濃運輸") indOptSeino = " selected";
        else if (dcTrim === "ヤマト運輸") indOptYamato = " selected";
        else indOptOther = " selected";
        const indOtherDisplay = indOptOther ? "inline-block" : "none";
        const indOtherDisabledAttr = indOptOther ? "" : " disabled";
        const indOtherValueAttr = indOptOther ? ` value="${escapeAttr(dcTrim)}"` : "";

        operationArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid #e5e7eb; padding-bottom:8px;">
                <h4 style="margin:0; font-size:1rem; color:#111827;">出荷オペレーション</h4>
                <label style="font-size:0.9rem; font-weight:bold; cursor:pointer; color:#3b82f6;">
                    <input type="checkbox" class="check-individual-mode"> 個別配送モード(便を分ける)
                </label>
            </div>
            <div class="estimate-message-area" style="display:flex; align-items:flex-end; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                <div style="flex-grow:1; min-width:200px;">
                    <label style="font-size:0.8rem; font-weight:bold; display:block;">納期目安 <span style="color:#111827;">( 確認中 / お取り寄せ中 など )</span></label>
                    <input type="text" class="input-estimate-message" value="${(savedEstimate || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}" 
                        style="width:100%; padding:6px; box-sizing:border-box; border:1px solid #e5e7eb; border-radius:8px;">
                </div>
                <button class="btn-update-estimate" type="button" style="background:transparent; color:#111827; border:1px solid #d1d5db; padding:8px 15px; border-radius:8px; cursor:pointer; font-weight:bold; white-space:nowrap;">
                    納期目安の更新
                </button>
            </div>
            <div class="global-input-area" style="display:flex; flex-wrap:nowrap; align-items:flex-end; gap:12px; margin-bottom:15px; overflow-x:auto; min-width:0;">
                <div class="date-input-group" style="display:flex; flex-direction:row; align-items:center; flex-wrap:nowrap; gap:8px; flex-shrink:0; background:#fff; padding:6px 10px; border-radius:8px; border:1px solid #e5e7eb;">
                    <span style="font-size:0.8rem; font-weight:bold; white-space:nowrap; line-height:1.2;">納品予定日</span>
                    <input type="date" class="input-delivery-date" value="${dateValueForInput}" style="padding:2px 4px; margin:0; vertical-align:middle; width:auto; min-width:9.5rem; max-width:11rem; box-sizing:border-box; font-size:0.85rem;">
                    <label style="font-size:0.8rem; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; margin:0;">
                        <input type="checkbox" class="check-date-unknown" ${isDateUnknown ? "checked" : ""}> 確約不可
                    </label>
                </div>
                <div class="shipping-info-group" style="display:flex; flex-direction:row; flex-wrap:nowrap; gap:12px; flex:1; min-width:0; align-items:flex-end;">
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; font-weight:bold; display:block; margin-bottom:4px;">配送業者</label>
                        <div class="bulk-carrier-fields" style="display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center;">
                            <label style="font-size:0.8rem; cursor:pointer; white-space:nowrap;"><input type="checkbox" class="bulk-carrier-check check-carrier-sagawa"${checkSagawa}> 佐川急便</label>
                            <label style="font-size:0.8rem; cursor:pointer; white-space:nowrap;"><input type="checkbox" class="bulk-carrier-check check-carrier-seino"${checkSeino}> 西濃運輸</label>
                            <label style="font-size:0.8rem; cursor:pointer; white-space:nowrap;"><input type="checkbox" class="bulk-carrier-check check-carrier-yamato"${checkYamato}> ヤマト運輸</label>
                            <label style="font-size:0.8rem; cursor:pointer; white-space:nowrap;"><input type="checkbox" class="bulk-carrier-check check-carrier-other"${checkOther}> その他</label>
                            <input type="text" class="input-carrier-other" style="min-width:100px; flex:1; max-width:240px; padding:4px 6px; font-size:0.8rem; box-sizing:border-box; border:1px solid #e5e7eb; border-radius:6px;"${otherCarrierValueAttr}>
                        </div>
                    </div>
                    <div style="flex:0 1 220px; min-width:140px; max-width:280px;">
                        <label style="font-size:0.8rem; font-weight:bold; display:block; margin-bottom:4px;">送り状番号</label>
                        <input type="text" class="input-number" value="${defaultNumber}" style="width:100%; padding:6px; box-sizing:border-box;">
                    </div>
                </div>
            </div>
            <div class="shipment-qty-area" style="background:#fff; padding:10px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:15px;">
                <p style="margin:0 0 5px 0; font-weight:bold; font-size:0.9rem;">出荷する数量を入力</p>
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
                                    ${item.name}
                                    <div class="individual-inputs" style="display:none; margin-top:5px; padding:5px; background:#f1f5f9; border-radius:6px;">
                                        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
                                            <select class="ind-company-select" style="font-size:0.8rem; min-width:8.5rem; padding:2px 4px; box-sizing:border-box;">
                                                <option value=""${indOpt0}>配送業者</option>
                                                <option value="佐川急便"${indOptSagawa}>佐川急便</option>
                                                <option value="西濃運輸"${indOptSeino}>西濃運輸</option>
                                                <option value="ヤマト運輸"${indOptYamato}>ヤマト運輸</option>
                                                <option value="その他"${indOptOther}>その他</option>
                                            </select>
                                            <input type="text" class="ind-company-other" style="display:${indOtherDisplay}; flex:1; min-width:70px; max-width:180px; padding:2px 4px; font-size:0.8rem; box-sizing:border-box; border:1px solid #e5e7eb; border-radius:4px;"${indOtherDisabledAttr}${indOtherValueAttr}>
                                            <input type="text" class="ind-number" placeholder="送り状番号" value="${defaultNumber}" style="min-width:100px; flex:1; max-width:200px; padding:2px 4px; font-size:0.8rem; box-sizing:border-box;">
                                        </div>
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
            <div class="order-actions-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:12px; padding-top:14px; border-top:1px dashed #e5e7eb;">
                <div class="order-delete-area" style="display:flex; align-items:center; flex-wrap:wrap; gap:10px;">
                    ${order.exported_at ? `<button type="button" class="btn-reset-export" style="background:transparent; color:#111827; border:1px solid #d1d5db; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.85rem;">未連携に</button>` : ""}
                    <button type="button" class="btn-delete-order" style="background:transparent; color:#111827; border:1px solid #d1d5db; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.85rem;">
                        削除
                    </button>
                </div>
                <button type="button" class="btn-register-shipment" style="background:#a1d8e6; color:#111827; border:none; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
                    出荷確定
                </button>
            </div>
        `;

        const dateInput = operationArea.querySelector(".input-delivery-date");
        const dateUnknownCheck = operationArea.querySelector(".check-date-unknown");
        const individualModeCheck = operationArea.querySelector(".check-individual-mode");
        const shippingInfoGroup = operationArea.querySelector(".shipping-info-group");
        const itemRows = operationArea.querySelectorAll(".item-row");

        function syncIndCompanyOtherForRow(row) {
            const sel = row.querySelector(".ind-company-select");
            const oth = row.querySelector(".ind-company-other");
            if (!sel || !oth) return;
            if (sel.value === "その他") {
                oth.style.display = "inline-block";
                oth.disabled = false;
            } else {
                oth.style.display = "none";
                oth.disabled = true;
                oth.value = "";
            }
        }

        itemRows.forEach(row => {
            const sel = row.querySelector(".ind-company-select");
            if (sel) {
                syncIndCompanyOtherForRow(row);
                sel.addEventListener("change", function() {
                    syncIndCompanyOtherForRow(row);
                });
            }
        });

        function syncBulkOtherInputEnabled() {
            const otherCb = operationArea.querySelector(".check-carrier-other");
            const otherIn = operationArea.querySelector(".input-carrier-other");
            if (otherIn && otherCb) otherIn.disabled = !otherCb.checked;
        }
        syncBulkOtherInputEnabled();

        operationArea.querySelectorAll(".bulk-carrier-check").forEach(cb => {
            cb.addEventListener("change", function() {
                if (this.checked) {
                    operationArea.querySelectorAll(".bulk-carrier-check").forEach(x => {
                        if (x !== this) x.checked = false;
                    });
                }
                syncBulkOtherInputEnabled();
            });
        });

        dateUnknownCheck.addEventListener("change", () => {
            if(dateUnknownCheck.checked) dateInput.value = ""; 
        });
        dateInput.addEventListener("input", () => {
            if(dateInput.value) dateUnknownCheck.checked = false; 
        });

        individualModeCheck.addEventListener("change", function() {
            const isInd = this.checked;
            if(isInd) {
                operationArea.querySelectorAll(".bulk-carrier-check").forEach(c => { c.disabled = true; });
                const otherIn = operationArea.querySelector(".input-carrier-other");
                if (otherIn) otherIn.disabled = true;
                shippingInfoGroup.querySelector(".input-number").disabled = true;
                shippingInfoGroup.style.opacity = "0.4";
                itemRows.forEach(row => {
                    const inputs = row.querySelector(".individual-inputs");
                    if(inputs) inputs.style.display = "block";
                    syncIndCompanyOtherForRow(row);
                });
            } else {
                operationArea.querySelectorAll(".bulk-carrier-check").forEach(c => { c.disabled = false; });
                syncBulkOtherInputEnabled();
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
                    const sel = row.querySelector(".ind-company-select");
                    let indCompany = "";
                    if (sel) {
                        if (sel.value === "その他") {
                            const o = row.querySelector(".ind-company-other");
                            indCompany = o ? o.value.trim() : "";
                        } else {
                            indCompany = sel.value.trim();
                        }
                    }
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
                let gCompany = "";
                if (operationArea.querySelector(".check-carrier-sagawa").checked) gCompany = "佐川急便";
                else if (operationArea.querySelector(".check-carrier-seino").checked) gCompany = "西濃運輸";
                else if (operationArea.querySelector(".check-carrier-yamato").checked) gCompany = "ヤマト運輸";
                else if (operationArea.querySelector(".check-carrier-other").checked) {
                    gCompany = operationArea.querySelector(".input-carrier-other").value.trim();
                }
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