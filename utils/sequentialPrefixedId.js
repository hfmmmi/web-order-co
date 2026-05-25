"use strict";

/**
 * 申請日時の古い順に PREFIX-0001, PREFIX-0002 … を割り当てる
 */

function recordTime(record, dateField) {
    const t = new Date(record[dateField]).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function formatPrefixedSequentialId(prefix, index) {
    const p = String(prefix).toUpperCase();
    const n = Math.max(1, parseInt(index, 10) || 1);
    return `${p}-${String(n).padStart(4, "0")}`;
}

function parsePrefixedSequentialNumber(id, prefix) {
    const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = String(id == null ? "" : id).match(new RegExp(`^${escaped}-(\\d+)$`, "i"));
    return m ? parseInt(m[1], 10) : null;
}

function buildPrefixedDisplayIdMap(records, options) {
    const prefix = options.prefix;
    const dateField = options.dateField || "timestamp";
    const idField = options.idField || "ticketId";
    const list = Array.isArray(records) ? records : [];
    const sorted = [...list].sort((a, b) => {
        const d = recordTime(a, dateField) - recordTime(b, dateField);
        if (d !== 0) return d;
        return String(a[idField]).localeCompare(String(b[idField]));
    });
    const map = Object.create(null);
    sorted.forEach((rec, index) => {
        map[String(rec[idField])] = formatPrefixedSequentialId(prefix, index + 1);
    });
    return map;
}

function nextPrefixedSequentialId(records, options) {
    const prefix = options.prefix;
    const list = Array.isArray(records) ? records : [];
    const displayMap = buildPrefixedDisplayIdMap(list, options);
    let max = 0;
    Object.values(displayMap).forEach((id) => {
        const n = parsePrefixedSequentialNumber(id, prefix);
        if (n != null && n > max) max = n;
    });
    for (const r of list) {
        const n = parsePrefixedSequentialNumber(r[options.idField || "ticketId"], prefix);
        if (n != null && n > max) max = n;
    }
    return formatPrefixedSequentialId(prefix, max + 1);
}

function attachPrefixedDisplayIds(records, options) {
    const list = Array.isArray(records) ? records : [];
    const idField = options.idField || "ticketId";
    const map = buildPrefixedDisplayIdMap(list, options);
    return list.map((r) => ({
        ...r,
        displayId: map[String(r[idField])] || String(r[idField])
    }));
}

module.exports = {
    formatPrefixedSequentialId,
    parsePrefixedSequentialNumber,
    buildPrefixedDisplayIdMap,
    nextPrefixedSequentialId,
    attachPrefixedDisplayIds
};
