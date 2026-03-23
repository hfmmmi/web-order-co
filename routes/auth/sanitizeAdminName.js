/** 管理者表示名のサニタイズ（長さ・文字種制限で XSS 等を防止） */
function sanitizeAdminName(name) {
    if (name == null || typeof name !== "string") return "";
    let s = name.trim().slice(0, 100);
    return s.replace(/[<>"'&]/g, "");
}

module.exports = { sanitizeAdminName };
