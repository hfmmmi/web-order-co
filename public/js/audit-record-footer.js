// 登録・更新者フッター（入力者：名前　最終更新：YYYY/MM/DD HH:mm:ss）
(function (global) {
    function esc(str) {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatAuditDateTime(value) {
        if (value == null || value === "") return "—";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return esc(String(value));
        const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
        const x = new Date(jstMs);
        const y = x.getUTCFullYear();
        const m = String(x.getUTCMonth() + 1).padStart(2, "0");
        const day = String(x.getUTCDate()).padStart(2, "0");
        const hh = String(x.getUTCHours()).padStart(2, "0");
        const mm = String(x.getUTCMinutes()).padStart(2, "0");
        const ss = String(x.getUTCSeconds()).padStart(2, "0");
        return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
    }

    function resolveAuditDisplay(record, options) {
        const opts = options || {};
        const fallbacks = opts.fallbackDateFields || ["orderDate", "timestamp", "requestDate"];
        const fallbackBy =
            opts.fallbackBy ||
            (record && record.customerName ? String(record.customerName) : "") ||
            "—";
        const by =
            (record && (record.updatedBy || record.createdBy)) ||
            fallbackBy ||
            "—";
        let at = record && (record.updatedAt || record.createdAt);
        if (!at && record) {
            for (let i = 0; i < fallbacks.length; i++) {
                if (record[fallbacks[i]]) {
                    at = record[fallbacks[i]];
                    break;
                }
            }
        }
        return { updatedBy: by, updatedAt: at || null };
    }

    function buildAuditRecordFooterHtml(record, options) {
        const { updatedBy, updatedAt } = resolveAuditDisplay(record, options);
        const dateStr = formatAuditDateTime(updatedAt);
        return (
            '<p class="audit-record-footer">入力者：' +
            esc(updatedBy) +
            "　最終更新：" +
            dateStr +
            "</p>"
        );
    }

    function renderAuditRecordFooter(container, record, options) {
        let el = container;
        if (typeof el === "string") {
            el = document.getElementById(el);
        }
        if (!el) return;
        const html = buildAuditRecordFooterHtml(record, options);
        if (el.classList && el.classList.contains("audit-record-footer")) {
            el.outerHTML = html;
            return;
        }
        el.innerHTML = html;
        const footer = el.querySelector(".audit-record-footer");
        if (footer) footer.hidden = false;
    }

    function setAuditRecordFooterElement(el, record, options) {
        if (!el) return;
        const { updatedBy, updatedAt } = resolveAuditDisplay(record, options);
        const hasData =
            (updatedBy && updatedBy !== "—") ||
            (updatedAt != null && updatedAt !== "");
        if (!hasData) {
            el.hidden = true;
            el.textContent = "";
            return;
        }
        el.hidden = false;
        el.textContent =
            "入力者：" + updatedBy + "　最終更新：" + formatAuditDateTime(updatedAt);
    }

    global.AuditRecordFooter = {
        formatAuditDateTime,
        resolveAuditDisplay,
        buildAuditRecordFooterHtml,
        renderAuditRecordFooter,
        setAuditRecordFooterElement
    };
})(typeof window !== "undefined" ? window : global);
