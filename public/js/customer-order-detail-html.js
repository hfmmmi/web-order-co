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

    function formatDetailDateYmdSlash(dateVal) {
        if (dateVal == null || dateVal === "") return "—";
        const raw = String(dateVal).trim();
        const slashMatch = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (slashMatch) {
            const y = slashMatch[1];
            const m = String(slashMatch[2]).padStart(2, "0");
            const day = String(slashMatch[3]).padStart(2, "0");
            return `${y}/${m}/${day}`;
        }
        const d = new Date(dateVal);
        if (Number.isNaN(d.getTime())) return esc(raw);
        const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
        const x = new Date(jstMs);
        const y = x.getUTCFullYear();
        const m = String(x.getUTCMonth() + 1).padStart(2, "0");
        const day = String(x.getUTCDate()).padStart(2, "0");
        return `${y}/${m}/${day}`;
    }

    const DETAIL_BLOCK_STYLE =
        "background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px; margin-bottom:10px; font-size:0.875rem; line-height:1.55; color:#374151;";

    function detailLabelLine(label, valueHtml) {
        return `<div><span style="color:#6b7280;">${label}：</span>${valueHtml}</div>`;
    }

    function formatShipItemsInline(items) {
        return (items || [])
            .map((i) => {
                const nm = esc(i.name || "");
                const qty = i.quantity != null ? i.quantity : "";
                return nm ? `${nm}×${qty}` : "";
            })
            .filter(Boolean)
            .join("、");
    }

    function formatShipItemsWithLineNumbers(items, itemIndexByCode) {
        return (items || [])
            .map((i) => {
                const nm = esc(i.name || "");
                const qty = i.quantity != null ? i.quantity : "";
                const lineNo = itemIndexByCode && i.code != null ? itemIndexByCode[i.code] : null;
                if (!nm) return "";
                const prefix = lineNo != null ? `<span style="font-weight:600;">${lineNo}.</span> ` : "";
                return `${prefix}${nm}×${qty}`;
            })
            .filter(Boolean)
            .join("、");
    }

    function shipmentIndexLabel(n) {
        const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
        if (n >= 1 && n <= circled.length) return circled[n - 1];
        return `(${n})`;
    }

    /** 個別配送または複数出荷で、配送ごとに商品を示す必要があるか */
    function needsSplitDeliveryItemLabels(order) {
        const shipments = order.shipments || [];
        if (shipments.length > 1) return true;
        return shipments.some((s) => s.deliveryMode === "individual");
    }

    function buildItemIndexByCode(order) {
        const map = {};
        (order.items || []).forEach((item, idx) => {
            if (item.code != null) map[item.code] = idx + 1;
        });
        return map;
    }

    function buildItemShipStatus(item, order) {
        let shippedCount = 0;
        if (order.shipments) {
            order.shipments.forEach((s) => {
                const found = (s.items || []).find((si) => si.code === item.code);
                if (found) shippedCount += found.quantity;
            });
        }
        const total = item.quantity || 0;
        const remaining = total - shippedCount;
        if (remaining === 0 && shippedCount > 0) return "発送済";
        if (shippedCount > 0) return `一部（残${remaining}）`;
        return "未発送";
    }

    /**
     * @param {object} order
     * @returns {string}
     */
    function buildCustomerOrderDetailHtml(order) {
        const statusText = order.status || "未発送";
        const info = order.deliveryInfo || {};
        const safeAddress = esc(info.address || info.adress || "登録住所通り");

        let shipperHtml = "";
        if (info.shipper && info.shipper.name) {
            shipperHtml = detailLabelLine("荷主", esc(info.shipper.name));
        }

        const estimateHtml = info.estimateMessage
            ? detailLabelLine("納期目安", esc(info.estimateMessage))
            : "";

        const recipientName = esc(info.name || "（名称なし）");

        let deliveryHTML = `
        <div style="${DETAIL_BLOCK_STYLE}">
            ${detailLabelLine("納品先", `${recipientName} 様 / ${safeAddress}`)}
            ${shipperHtml}
            ${estimateHtml}
        </div>
    `;

        const splitDeliveryLabels = needsSplitDeliveryItemLabels(order);
        const itemIndexByCode = splitDeliveryLabels ? buildItemIndexByCode(order) : {};
        const shipmentCount = (order.shipments && order.shipments.length) || 0;

        let trackingHtml = "";
        if (order.shipments && order.shipments.length > 0) {
            let historyItems = "";
            order.shipments.forEach((ship, shipIdx) => {
                const shipDate = formatDetailDateYmdSlash(ship.shippedDate);
                let deliveryDateText = ship.deliveryDate
                    ? formatDetailDateYmdSlash(ship.deliveryDate)
                    : "指定なし";
                if (ship.deliveryDateUnknown) deliveryDateText += "（日時未定）";

                const dc = esc(ship.deliveryCompany || "—");
                const tn = esc(ship.trackingNumber || "反映待ち");

                const showItemsForShip =
                    splitDeliveryLabels &&
                    (shipmentCount > 1 ||
                        ship.deliveryMode === "individual" ||
                        (ship.items && ship.items.length > 0));
                const itemsStr = showItemsForShip
                    ? formatShipItemsWithLineNumbers(ship.items, itemIndexByCode)
                    : "";
                const packageLabel =
                    shipmentCount > 1
                        ? `<span style="font-weight:700;margin-right:4px;">${shipmentIndexLabel(shipIdx + 1)}</span>`
                        : "";
                const itemsLine = itemsStr
                    ? `<div style="color:#6b7280;font-size:0.8125rem;margin-top:3px;padding-left:${shipmentCount > 1 ? "1.15em" : "0"};">${itemsStr}</div>`
                    : "";

                historyItems += `
                <div style="margin-bottom:${shipIdx < shipmentCount - 1 ? "10px" : "8px"}; color:#111827;">
                    ${packageLabel}出荷：${shipDate} → 納品予定日：${deliveryDateText}　 ${dc} ${tn}
                    ${itemsLine}
                </div>
            `;
            });
            const deliveryIntro =
                shipmentCount > 1
                    ? `<div style="font-size:0.8125rem;color:#6b7280;margin-bottom:8px;">お届けは ${shipmentCount} 件に分かれています。</div>`
                    : splitDeliveryLabels
                      ? '<div style="font-size:0.8125rem;color:#6b7280;margin-bottom:8px;">商品ごとに配送業者・伝票が異なる場合があります</div>'
                      : "";
            trackingHtml = `
            <div style="${DETAIL_BLOCK_STYLE}">
                <div style="margin-bottom:6px;"><span style="color:#6b7280; font-weight:600;">配送：</span></div>
                ${deliveryIntro}
                ${historyItems}
            </div>
        `;
        } else if (statusText === "発送済") {
            const company = esc(order.deliveryCompany || "—");
            const number = esc(order.trackingNumber || "反映待ち");
            trackingHtml = `
            <div style="${DETAIL_BLOCK_STYLE}">
                ${detailLabelLine("配送", `${company} ${number}`)}
            </div>
        `;
        }

        let tableHTML = `
        <div style="${DETAIL_BLOCK_STYLE} padding:0; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
            <thead>
                <tr style="border-bottom:1px solid #d1d5db; color:#6b7280; font-size:0.8125rem;">
                    ${splitDeliveryLabels ? '<th style="padding:8px 6px;text-align:center;width:2rem;font-weight:600;">No.</th>' : ""}
                    <th style="padding:8px 10px; text-align:left; font-weight:600;">商品：</th>
                    <th style="padding:8px 10px; text-align:center; width:72px; font-weight:600;">状況：</th>
                    <th style="padding:8px 10px; text-align:right; width:72px; font-weight:600;">小計：</th>
                </tr>
            </thead>
            <tbody>
    `;

        (order.items || []).forEach((item, itemIdx) => {
            const price = item.price || 0;
            const subtotal = price * item.quantity;
            const itemName = esc(item.name || "名称不明");
            const statusLabel = esc(buildItemShipStatus(item, order));
            const qtyNote = item.quantity > 1 ? ` <span style="color:#6b7280;">×${item.quantity}</span>` : "";
            const noCell = splitDeliveryLabels
                ? `<td style="padding:8px 6px;text-align:center;color:#6b7280;font-weight:600;font-size:0.8125rem;">${itemIdx + 1}</td>`
                : "";

            tableHTML += `
            <tr style="border-bottom:1px solid #e5e7eb;">
                ${noCell}
                <td style="padding:8px;">${itemName}${qtyNote}</td>
                <td style="padding:8px; text-align:center; color:#6b7280; font-size:0.8125rem;">${statusLabel}</td>
                <td style="padding:8px; text-align:right;">¥${subtotal.toLocaleString()}</td>
            </tr>
        `;
        });
        tableHTML += `</tbody></table></div>`;

        const actionHtml = `
        <div style="margin-top:4px; text-align:right;">
            <button type="button" class="btn-reorder" data-order-id="${esc(String(order.orderId != null ? order.orderId : ""))}">
                この内容で再注文
            </button>
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
