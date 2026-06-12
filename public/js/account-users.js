document.addEventListener("DOMContentLoaded", async function () {
    const section = document.getElementById("account-users-section");
    const denied = document.getElementById("au-denied");
    const content = document.getElementById("au-content");
    const listEl = document.getElementById("au-list");
    const navLink = document.getElementById("account-users-link");

    if (!section && !listEl) return;

    function esc(s) {
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    }

    function notifyOk(msg) {
        if (typeof toastSuccess === "function") toastSuccess(msg);
        else alert(msg);
    }

    function notifyNg(msg) {
        if (typeof toastError === "function") toastError(msg);
        else alert(msg);
    }

    async function loadProfile() {
        const res = await fetch("/api/account/profile", { credentials: "include" });
        if (res.status === 401) {
            window.location.href = "index.html";
            return null;
        }
        return res.json();
    }

    async function loadUsers() {
        const res = await fetch("/api/account/users", { credentials: "include" });
        if (res.status === 403) return null;
        if (!res.ok) throw new Error("load failed");
        return res.json();
    }

    let currentUserId = null;

    function renderUsers(users) {
        if (!listEl) return;
        if (!users.length) {
            listEl.innerHTML = "<p class=\"au-empty\">登録されているユーザーはいません。下のフォームから追加できます。</p>";
            return;
        }
        let html = "<table class=\"account-users-table\"><thead><tr>"
            + "<th>メール</th><th>表示名</th><th>権限</th><th>状態</th>"
            + "</tr></thead><tbody>";
        users.forEach(function (u) {
            const uid = esc(u.userId);
            const roleVal = u.role === "admin" ? "admin" : "user";
            const activeVal = u.active === false ? "false" : "true";
            const isSelf = currentUserId && u.userId === currentUserId;
            html += "<tr data-user-id=\"" + uid + "\">";
            html += "<td>" + esc(u.email) + "</td>";
            html += "<td>" + esc(u.displayName) + "</td>";
            html += "<td><select class=\"au-role-select\" data-id=\"" + uid + "\" aria-label=\"権限\">"
                + "<option value=\"user\"" + (roleVal === "user" ? " selected" : "") + ">一般</option>"
                + "<option value=\"admin\"" + (roleVal === "admin" ? " selected" : "") + ">管理者</option>"
                + "</select></td>";
            html += "<td>";
            if (isSelf) {
                html += "<span>有効</span>";
            } else {
                html += "<select class=\"au-active-select\" data-id=\"" + uid + "\" aria-label=\"状態\">"
                    + "<option value=\"true\"" + (activeVal === "true" ? " selected" : "") + ">有効</option>"
                    + "<option value=\"false\"" + (activeVal === "false" ? " selected" : "") + ">無効</option>"
                    + "</select>";
            }
            html += "</td></tr>";
        });
        html += "</tbody></table>";
        listEl.innerHTML = html;

        listEl.querySelectorAll(".au-role-select").forEach(function (sel) {
            sel.dataset.prev = sel.value;
            sel.addEventListener("change", async function () {
                const userId = this.dataset.id;
                const role = this.value;
                const prev = this.dataset.prev;
                try {
                    const r = await fetch("/api/account/users/" + encodeURIComponent(userId), {
                        method: "PUT",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ role })
                    });
                    const d = await r.json();
                    if (d.success) {
                        this.dataset.prev = role;
                        notifyOk("権限を更新しました");
                    } else {
                        this.value = prev;
                        notifyNg(d.message || "更新に失敗しました");
                    }
                } catch (e) {
                    this.value = prev;
                    notifyNg("通信エラー");
                }
            });
        });

        listEl.querySelectorAll(".au-active-select").forEach(function (sel) {
            sel.dataset.prev = sel.value;
            sel.addEventListener("change", async function () {
                const userId = this.dataset.id;
                const active = this.value === "true";
                const prev = this.dataset.prev;
                if (!active && !confirm("このユーザーを無効化しますか？")) {
                    this.value = prev;
                    return;
                }
                try {
                    const r = await fetch("/api/account/users/" + encodeURIComponent(userId), {
                        method: "PUT",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ active })
                    });
                    const d = await r.json();
                    if (d.success) {
                        this.dataset.prev = this.value;
                        notifyOk(active ? "ユーザーを有効化しました" : "ユーザーを無効化しました");
                        refresh();
                    } else {
                        this.value = prev;
                        notifyNg(d.message || "更新に失敗しました");
                    }
                } catch (e) {
                    this.value = prev;
                    notifyNg("通信エラー");
                }
            });
        });
    }

    async function refresh() {
        const data = await loadUsers();
        if (data && data.success) renderUsers(data.users || []);
    }

    const profile = await loadProfile();
    if (!profile || !profile.success) return;

    const canManageUsers = !!profile.isCustomerUserAdmin
        || (!!profile.isAdmin && !!profile.proxyByAdmin);

    if (!canManageUsers) {
        if (denied) denied.hidden = false;
        if (section) section.hidden = false;
        if (navLink) navLink.style.display = "none";
        return;
    }

    if (section) section.hidden = false;
    if (content) content.hidden = false;
    if (navLink) navLink.style.display = "block";
    currentUserId = profile.userId || null;
    await refresh();

    const addBtn = document.getElementById("au-add-btn");
    if (addBtn) {
        addBtn.addEventListener("click", async function () {
            const emailEl = document.getElementById("au-email");
            const nameEl = document.getElementById("au-display-name");
            const roleEl = document.getElementById("au-role");
            const passEl = document.getElementById("au-password");
            const payload = {
                email: emailEl ? emailEl.value.trim() : "",
                displayName: nameEl ? nameEl.value.trim() : "",
                role: roleEl ? roleEl.value : "user",
                password: passEl ? passEl.value : ""
            };
            if (!payload.email) {
                notifyNg("メールアドレスを入力してください");
                return;
            }
            if (!payload.password || payload.password.length < 4) {
                notifyNg("初期パスワードは4文字以上で入力してください");
                return;
            }
            addBtn.disabled = true;
            try {
                const res = await fetch("/api/account/users", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const d = await res.json();
                if (d.success) {
                    notifyOk(d.message || "ユーザーを追加しました");
                    if (emailEl) emailEl.value = "";
                    if (nameEl) nameEl.value = "";
                    if (passEl) passEl.value = "";
                    await refresh();
                } else notifyNg(d.message || "追加に失敗しました");
            } catch (e) {
                notifyNg("通信エラーが発生しました");
            } finally {
                addBtn.disabled = false;
            }
        });
    }

    if (window.location.hash === "#account-users" && section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
});
