// public/js/utils/estimatePdf.js
// 見積書PDF（印刷画面）生成ロジック
// ※ cart.js から呼び出されます。発行元情報は /api/settings/public の publicBranding を渡してください。

class EstimatePdfGenerator {
    /**
     * @param {object} [fallbackBranding] 取得失敗時の最低限の表示用（通常は未使用）
     */
    constructor(fallbackBranding) {
        this.fallbackBranding = fallbackBranding || {};
    }

    /**
     * @param {Array} cartItems - カートの商品配列
     * @param {Object} customerInfo - 顧客/配送先情報 {name, address, zip, tel, deliveryDate}
     * @param {Object} [publicBranding] - settings.publicBranding（会社名・住所等）
     */
    generate(cartItems, customerInfo, publicBranding) {
        const pb = Object.assign({}, this.fallbackBranding, publicBranding || {});
        const contactLabel = pb.estimateContactLabel || pb.tanto || "担当者";
        const subjectLine = pb.estimateSubjectLine || "商品購入の件";
        const paymentTerms = pb.estimatePaymentTerms || "貴社規定通り";
        const validPeriod = pb.estimateValidPeriod || "発行より1ヶ月";
        const footerNotes =
            pb.estimateFooterNotes ||
            "※消費税は別途申し受けます。<br>\n※本見積書はシステムによる自動発行です。";

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}.${mm}.${dd}`;
        const estNo = `EST-${yyyy}${mm}${dd}-${Math.floor(Math.random() * 900) + 100}`;

        const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryDateStr = customerInfo.deliveryDate ? customerInfo.deliveryDate : "別途相談";

        const itemsHtml = cartItems.map(item => {
            const sub = item.price * item.quantity;
            return `
            <tr>
                <td style="text-align:left; padding:8px;">
                    <div>${this._escapeHtml(item.name)}</div>
                    <div style="font-size:0.8em; color:#666;">${this._escapeHtml(item.code)}</div>
                </td>
                <td style="text-align:center;">${item.quantity}</td>
                <td style="text-align:right;">${item.price.toLocaleString()}</td>
                <td style="text-align:right;">${sub.toLocaleString()}</td>
            </tr>`;
        }).join("");

        const popup = window.open("", "_blank", "width=850,height=1000");

        popup.document.write(`
        <html>
        <head>
            <title>御見積書 - ${estNo}</title>
            <style>
                body { font-family: "Hiragino Sans", "Meiryo", sans-serif; padding: 40px; color: #333; max-width: 210mm; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; margin-bottom: 40px; align-items: flex-start; }
                .title { text-align: center; font-size: 24px; letter-spacing: 5px; border-bottom: 2px solid #333; margin-bottom: 30px; padding-bottom: 10px; font-weight:bold; }
                
                .customer-info { width: 55%; font-size: 14px; line-height: 1.6; }
                .customer-name { font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ccc; display:inline-block; padding-bottom:2px; }
                
                .company-info { width: 40%; text-align: right; font-size: 13px; line-height: 1.5; }
                .company-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
                .logo-area { font-size: 20px; font-weight: bold; color: #555; margin-bottom: 10px; font-family: serif; }

                .meta-table { margin-left: auto; border-collapse: collapse; margin-bottom: 10px; font-size:12px; }
                .meta-table td { padding: 2px 5px; }

                .summary-area { margin: 20px 0; border-top: 2px solid #333; border-bottom: 2px solid #333; padding: 10px 0; display:flex; justify-content:space-between; align-items:center;}
                .total-price { font-size: 24px; font-weight: bold; }

                table.details { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                table.details th { background: #f0f0f0; border: 1px solid #333; padding: 8px; text-align: center; }
                table.details td { border: 1px solid #333; padding: 8px; }

                .footer { margin-top: 40px; font-size: 12px; border: 1px solid #ccc; padding: 10px; }
                
                @media print {
                    body { padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="title">御 見 積 書</div>

            <div class="header">
                <div class="customer-info">
                    ${customerInfo.zip ? "〒" + this._escapeHtml(customerInfo.zip) + "<br>" : ""}
                    ${this._escapeHtml(customerInfo.address)}<br>
                    ${customerInfo.tel ? "TEL: " + this._escapeHtml(customerInfo.tel) + "<br>" : ""}
                    <br>
                    <div class="customer-name">${this._escapeHtml(customerInfo.name)} 御中</div>
                    <br><br>
                    <div>件名: ${this._escapeHtml(subjectLine)}</div>
                    <div>納期: ${this._escapeHtml(deliveryDateStr)}</div>
                    <div>支払条件: ${this._escapeHtml(paymentTerms)}</div>
                    <div>有効期限: ${this._escapeHtml(validPeriod)}</div>
                    <div>納入先: ${this._escapeHtml(customerInfo.address)}</div>
                </div>

                <div class="company-info">
                    <table class="meta-table">
                        <tr><td>発行日:</td><td>${dateStr}</td></tr>
                        <tr><td>見積No:</td><td>${estNo}</td></tr>
                        <tr><td>担当:</td><td>${this._escapeHtml(contactLabel)}</td></tr>
                    </table>

                    <div class="logo-area">${this._escapeHtml(pb.logoText || "")}</div>
                    <div class="company-name">${this._escapeHtml(pb.companyName || "")}</div>
                    <div>〒${this._escapeHtml(pb.zip || "")}</div>
                    <div>${this._escapeHtml(pb.address || "")}</div>
                    <div>TEL:${this._escapeHtml(pb.tel || "")} FAX:${this._escapeHtml(pb.fax || "")}</div>
                </div>
            </div>

            <div class="summary-area">
                <span style="font-size:16px;">お見積合計金額</span>
                <span class="total-price">¥${totalAmount.toLocaleString()} -</span>
                <span style="font-size:12px;">(税抜)</span>
            </div>

            <table class="details">
                <thead>
                    <tr>
                        <th>品 名 / 規格</th>
                        <th style="width:50px;">数量</th>
                        <th style="width:100px;">単価</th>
                        <th style="width:100px;">金額(税抜)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                    <tr>
                        <td colspan="2" style="border:none;"></td>
                        <td style="background:#f9f9f9; font-weight:bold;">合計 (税抜)</td>
                        <td style="text-align:right; font-weight:bold;">${totalAmount.toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>

            <div class="footer">
                <strong>【備考】</strong><br>
                ${footerNotes}
            </div>
            
            <script>
                window.onload = function() { window.print(); }
            <\/script>
        </body>
        </html>
        `);
        popup.document.close();
    }

    _escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
