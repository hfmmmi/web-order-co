/**
 * announcements.js
 * お知らせページの表示
 */

document.addEventListener("DOMContentLoaded", function () {
    fetch("/api/settings/public")
        .then(function (r) {
            if (!r.ok) return { announcements: [] };
            return r.json();
        })
        .then(function (data) {
            const all = (data && data.announcements) || [];
            const list = all.filter(function (a) {
                const cat = a.category || "general";
                return cat === "general";
            });
            const container = document.getElementById("announcements-list");
            if (!container) return;

            // features.announcements が false の場合は非表示（通常はこのページ自体にアクセスできない想定）
            if (list.length === 0) {
                container.innerHTML = '<div class="announcements-empty">現在、お知らせはありません。</div>';
                return;
            }

            container.innerHTML = list.map(function (ann) {
                const typeClass = "type-" + (ann.type || "info");
                const linkHtml = ann.linkUrl
                    ? '<p class="meta"><a href="' + escapeHtml(ann.linkUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(ann.linkText || "詳細を見る") + '</a></p>'
                    : "";
                return (
                    '<div class="announcement-card ' + typeClass + '">' +
                    '<h3>' + escapeHtml(ann.title || "（タイトルなし）") + '</h3>' +
                    '<div class="body">' + escapeHtml(ann.body || "") + '</div>' +
                    linkHtml +
                    "</div>"
                );
            }).join("");
        })
        .catch(function () {
            const container = document.getElementById("announcements-list");
            if (container) container.innerHTML = '<div class="announcements-empty">お知らせの取得に失敗しました。</div>';
        });
});

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
