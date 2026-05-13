// 顧客向け注文詳細パネル用 HTML 生成（history.js / order-detail.js から共有）
(function (global) {
    function esc(str) {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /**
     * @param {object} order
     * @returns {string}
     */
    function buildCustomerOrderDetailHtml(order) {
        const statusText = order.status || "未発送";
        const info = order.deliveryInfo || {};
        const safeAddress = esc(info.address || info.adress || "登録住所通り");
        let dateDisplay = esc(info.date || "指定なし");
        if (info.dateUnknown) {
            dateDisplay += ` <span style="color:#dc3545; font-weight:bold; font-size:0.9em;">(※確約不可/出荷日のみ連絡)</span>`;
        }

        let shipperHtml = "";
        if (info.shipper && info.shipper.name) {
            const sn = esc(info.shipper.name);
            const sa = esc(info.shipper.address || "");
            const st = esc(info.shipper.tel || "--");
            shipperHtml = `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e7eb; font-size: 0.9rem;">
                <span style="font-weight:700; color: #374151;">荷主(依頼主):</span> ${sn}<br>
                <div style="margin-left: 4px; font-size: 0.85rem; color: #6b7280;">
                    ${sa} <span style="margin-left:6px;">(TEL: ${st})</span>
                </div>
            </div>
        `;
        }

        const estimateHtml = info.estimateMessage
            ? `<div style="margin-top: 12px; padding: 12px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 3px solid #D6E7F1; border-radius: 8px; font-size: 0.95rem; color: #374151;">
            <span style="font-weight:700;">納期目安:</span> ${esc(info.estimateMessage)}
        </div>`
            : "";

        const recipientName = esc(info.name || "（名称なし）");

        let deliveryHTML = `
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e5e7eb;">
            <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: #374151; font-weight: 700;">お届け先</h4>
            <div style="font-size: 0.95rem; line-height: 1.6; color: #374151;">
                <span style="font-weight:700;">納品日:</span> ${dateDisplay}<br>
                <span style="font-weight:700;">納品先:</span> ${recipientName} 様<br>
                <span style="font-weight:700;">住所:</span> ${safeAddress}
                ${shipperHtml}
                ${estimateHtml}
            </div>
        </div>
    `;

        let trackingHtml = "";
        if (order.shipments && order.shipments.length > 0) {
            let historyItems = "";
            order.shipments.forEach((ship, idx) => {
                const shipDate = new Date(ship.shippedDate).toLocaleDateString("ja-JP");
                const shipItemsStr = (ship.items || []).map(i => {
                    const nm = esc(i.name || "");
                    return `・${nm} (x${i.quantity})`;
                }).join("<br>");
                let shipDeliveryDate = esc(ship.deliveryDate || "指定なし");
                if (ship.deliveryDateUnknown) shipDeliveryDate += " (※日時確約不可)";

                const dc = esc(ship.deliveryCompany || "指定なし");
                const tn = esc(ship.trackingNumber || "反映待ち");

                historyItems += `
                <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-weight:700; color:#111827; margin-bottom:6px;">
                        第${idx + 1}回出荷 (${shipDate})
                    </div>
                    <div style="font-size:0.9rem; margin-left:2px; color:#374151;">
                        配送業者: <strong>${dc}</strong> / 伝票No: <strong>${tn}</strong><br>
                        納品予定: ${shipDeliveryDate}<br>
                        <div style="margin-top:8px; padding:8px 10px; background:#fff; border-radius:6px; border:1px solid #e5e7eb; font-size:0.85rem; color:#374151;">
                            ${shipItemsStr}
                        </div>
                    </div>
                </div>
            `;
            });
            trackingHtml = `
            <div style="background-color: #f9fafb; color: #374151; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; border-left: 3px solid #9ca3af; margin-bottom: 15px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:#111827; font-weight:700;">出荷・配送状況</h4>
                ${historyItems}
            </div>
        `;
        } else if (statusText === "発送済") {
            const company = esc(order.deliveryCompany || "指定なし");
            const number = esc(order.trackingNumber || "反映待ち");
            trackingHtml = `
            <div style="background-color: #f9fafb; color: #374151; padding: 14px; border-radius: 8px; border: 1px solid #e5e7eb; border-left: 3px solid #22c55e; margin-bottom: 15px;">
                <strong style="color:#111827;">発送完了</strong><br>
                配送業者: ${company} / 伝票番号: <strong style="font-size:1.05rem;">${number}</strong>
            </div>
        `;
        }

        let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 15px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <thead style="background-color: #f9fafb;">
                <tr>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">商品名</th>
                    <th style="padding: 10px; text-align: right; width: 60px; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">単価</th>
                    <th style="padding: 10px; text-align: center; width: 80px; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">出荷状況</th>
                    <th style="padding: 10px; text-align: right; width: 60px; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700;">小計</th>
                </tr>
            </thead>
            <tbody>
    `;

        (order.items || []).forEach((item, rowIdx) => {
            const price = item.price || 0;
            const subtotal = price * item.quantity;

            let shippedCount = 0;
            if (order.shipments) {
                order.shipments.forEach(s => {
                    const found = (s.items || []).find(si => si.code === item.code);
                    if (found) shippedCount += found.quantity;
                });
            }
            const remaining = item.quantity - shippedCount;

            let statusBadge = "";
            if (remaining === 0 && shippedCount > 0) {
                statusBadge = `<div style="font-size:0.8rem; color:#047857; font-weight:600;">完了(${item.quantity})</div>`;
            } else if (remaining > 0 && shippedCount > 0) {
                statusBadge = `
                <div style="font-size:0.8rem; color:#6b7280;">済: ${shippedCount}</div>
                <div style="font-weight:600; color:#9a3412; font-size:0.8rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:3px 6px; margin-top:4px;">
                    残: ${remaining}
                </div>`;
            } else if (shippedCount === 0) {
                statusBadge = `<div style="font-size:0.8rem; color:#6b7280;">注文数: ${item.quantity}</div>`;
            }

            const itemName = esc(item.name || "名称不明");
            const itemCode = esc(item.code || "");

            tableHTML += `
            <tr style="border-bottom: 1px solid #e5e7eb; background: ${rowIdx % 2 === 1 ? "#fafafa" : "#fff"};">
                <td style="padding: 10px;">
                    <div style="font-weight: 700; color:#111827;">${itemName}</div>
                    <div style="font-size: 0.8rem; color: #6b7280;">${itemCode}</div>
                </td>
                <td style="padding: 10px; text-align: right;">¥${price.toLocaleString()}</td>
                <td style="padding: 10px; text-align: center; vertical-align: middle;">
                    ${statusBadge}
                </td>
                <td style="padding: 10px; text-align: right;">¥${subtotal.toLocaleString()}</td>
            </tr>
        `;
        });
        tableHTML += `</tbody></table>`;

        const oidAttr = encodeURIComponent(String(order.orderId != null ? order.orderId : ""));
        const actionHtml = `
        <div style="margin-top: 15px; text-align: right; padding-top: 12px; border-top: 1px dashed #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <button type="button" class="btn-reorder" data-order-id="${esc(String(order.orderId != null ? order.orderId : ""))}">
                この内容で再注文
            </button>
            <a class="history-support-link" href="support.html?orderId=${oidAttr}">この注文について問い合わせる</a>
        </div>
    `;

        return deliveryHTML + trackingHtml + tableHTML + actionHtml;
    }

    function customerOrderQuickReorder(order) {
        if (!order.items || order.items.length === 0) {
            if (typeof toastWarning === "function") toastWarning("再注文できる商品がありません");
            return;
        }

        const itemNames = order.items.slice(0, 3).map(i => i.name || i.code).join("、");
        const moreText = order.items.length > 3 ? `...他${order.items.length - 3}点` : "";

        if (!confirm(`以下の商品をカートに追加します：\n\n${itemNames}${moreText}\n\nよろしいですか？`)) {
            return;
        }

        let cart = [];
        const savedCart = sessionStorage.getItem("cart");
        if (savedCart) {
            try {
                cart = JSON.parse(savedCart);
            } catch (e) {
                cart = [];
            }
        }

        order.items.forEach(item => {
            const code = item.code || item.productCode;
            if (!code) return;

            const existingItem = cart.find(c => (c.productCode === code || c.code === code));

            if (existingItem) {
                existingItem.quantity += item.quantity;
            } else {
                cart.push({
                    productCode: code,
                    code: code,
                    name: item.name || "名称不明",
                    price: item.price || 0,
                    quantity: item.quantity
                });
            }
        });

        sessionStorage.setItem("cart", JSON.stringify(cart));

        if (typeof toastSuccess === "function") {
            toastSuccess(`${order.items.length}点の商品をカートに追加しました！`, 1500);
        }

        setTimeout(() => {
            window.location.href = "cart.html";
        }, 1000);
    }

    global.buildCustomerOrderDetailHtml = buildCustomerOrderDetailHtml;
    global.customerOrderQuickReorder = customerOrderQuickReorder;
})(typeof window !== "undefined" ? window : global);
