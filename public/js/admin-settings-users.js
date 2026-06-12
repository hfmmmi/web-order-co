document.addEventListener("DOMContentLoaded", function () {
    const listWrap = document.getElementById("admin-users-list-wrap");
    const addBtn = document.getElementById("au-admin-add-btn");
    const emailEl = document.getElementById("au-admin-email");
    const nameEl = document.getElementById("au-admin-display-name");
    const passEl = document.getElementById("au-admin-password");
    const roleEl = document.getElementById("au-admin-role");
    const btnTemplate = document.getElementById("btn-admin-user-template");
    const btnUpload = document.getElementById("btn-admin-user-upload");
    const fileInput = document.getElementById("admin-user-csv-file-input");

    let currentAdminUserId = null;

    function esc(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function roleLabel(role) {
        return role === "admin" ? "管理者" : "一般";
    }

    async function loadCurrentProfile() {
        try {
            const res = await adminApiFetch("/api/admin/account");
            if (!res.ok) return;
            const data = await res.json();
            currentAdminUserId = data.userId || null;
            const emailInput = document.getElementById("admin-account-email");
            const nameInput = document.getElementById("admin-account-name");
            const roleInput = document.getElementById("admin-account-role");
            const passInput = document.getElementById("admin-account-password");
            const hintEl = document.getElementById("admin-account-password-hint");
            if (emailInput) emailInput.value = data.email || "";
            if (nameInput) nameInput.value = data.displayName || "";
            if (roleInput) roleInput.value = roleLabel(data.role);
            if (passInput) passInput.value = "";
            if (hintEl) {
                hintEl.textContent = data.passwordSet
                    ? "パスワード設定済み。変更する場合のみ入力してください。"
                    : "パスワードを入力してください（4文字以上）。";
            }
        } catch (e) {
            console.error("loadCurrentProfile:", e);
        }
    }

    async function loadUsers() {
        if (!listWrap) return;
        listWrap.innerHTML = "<p>読込中…</p>";
        try {
            const res = await adminApiFetch("/api/admin/admin-users");
            const data = await res.json();
            if (!data.success || !data.users.length) {
                listWrap.innerHTML = "<p>管理者ユーザーが未登録です。下のフォームまたは一括登録で追加してください。</p>";
                return;
            }
            let html = "<table class='cust-table au-admin-users-table' style='width:100%;'><thead><tr>"
                + "<th>メール</th><th>表示名</th><th>権限</th><th>状態</th><th>操作</th>"
                + "</tr></thead><tbody>";
            data.users.forEach(function (u) {
                const uid = esc(u.userId);
                const activeVal = u.active === false ? "false" : "true";
                const roleVal = u.role === "admin" ? "admin" : "user";
                const isSelf = currentAdminUserId && u.userId === currentAdminUserId;
                html += "<tr data-user-id=\"" + uid + "\">";
                html += "<td>" + esc(u.email) + "</td>";
                html += "<td>" + esc(u.displayName || "-") + "</td>";
                html += "<td>";
                if (isSelf) {
                    html += esc(roleLabel(roleVal));
                } else {
                    html += "<select class=\"au-role-select\" data-id=\"" + uid + "\" aria-label=\"権限\">"
                        + "<option value=\"user\"" + (roleVal === "user" ? " selected" : "") + ">一般</option>"
                        + "<option value=\"admin\"" + (roleVal === "admin" ? " selected" : "") + ">管理者</option>"
                        + "</select>";
                }
                html += "</td>";
                html += "<td>";
                if (isSelf) {
                    html += "<span>有効</span>";
                } else {
                    html += "<select class=\"au-active-select\" data-id=\"" + uid + "\" aria-label=\"状態\">"
                        + "<option value=\"true\"" + (activeVal === "true" ? " selected" : "") + ">有効</option>"
                        + "<option value=\"false\"" + (activeVal === "false" ? " selected" : "") + ">無効</option>"
                        + "</select>";
                }
                html += "</td><td style='white-space:nowrap;'>";
                if (u.active !== false) {
                    html += "<button type='button' class='btn-au-invite' data-id='" + uid + "' data-email='" + esc(u.email) + "'>招待</button>";
                } else {
                    html += "<span style=\"color:#9ca3af;font-size:0.8125rem;\">—</span>";
                }
                html += "</td></tr>";
            });
            html += "</tbody></table>";
            listWrap.innerHTML = html;

            listWrap.querySelectorAll(".au-role-select").forEach(function (sel) {
                sel.dataset.prev = sel.value;
                sel.addEventListener("change", async function () {
                    const userId = this.dataset.id;
                    const role = this.value;
                    const prev = this.dataset.prev;
                    try {
                        const r = await adminApiFetch("/api/admin/admin-users/" + encodeURIComponent(userId), {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ role })
                        });
                        const d = await r.json();
                        if (d.success) {
                            this.dataset.prev = role;
                            toastSuccess("権限を更新しました");
                        } else {
                            this.value = prev;
                            toastError(d.message || "更新に失敗しました");
                        }
                    } catch (e) {
                        this.value = prev;
                        toastError("通信エラー");
                    }
                });
            });

            listWrap.querySelectorAll(".au-active-select").forEach(function (sel) {
                sel.dataset.prev = sel.value;
                sel.addEventListener("change", async function () {
                    const userId = this.dataset.id;
                    const active = this.value === "true";
                    const prev = this.dataset.prev;
                    if (!active && !confirm("この管理者ユーザーを無効化しますか？")) {
                        this.value = prev;
                        return;
                    }
                    try {
                        const r = await adminApiFetch("/api/admin/admin-users/" + encodeURIComponent(userId), {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active })
                        });
                        const d = await r.json();
                        if (d.success) {
                            this.dataset.prev = this.value;
                            toastSuccess(active ? "ユーザーを有効化しました" : "ユーザーを無効化しました");
                            loadUsers();
                        } else {
                            this.value = prev;
                            toastError(d.message || "更新に失敗しました");
                        }
                    } catch (e) {
                        this.value = prev;
                        toastError("通信エラー");
                    }
                });
            });

            listWrap.querySelectorAll(".btn-au-invite").forEach(function (btn) {
                btn.addEventListener("click", async function () {
                    const userId = this.dataset.id;
                    const email = this.dataset.email;
                    if (!confirm(email + " 宛に招待メールを送信しますか？\n（パスワードはリセットされます）")) return;
                    try {
                        const r = await adminApiFetch("/api/admin/admin-users/invite", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId })
                        });
                        const d = await r.json();
                        if (d.success) toastSuccess(d.message || "送信しました");
                        else toastError(d.message || "失敗しました");
                    } catch (e) {
                        toastError("通信エラー");
                    }
                });
            });
        } catch (e) {
            listWrap.innerHTML = "<p>取得に失敗しました</p>";
        }
    }

    async function refreshAll() {
        await loadCurrentProfile();
        await loadUsers();
    }

    window.AdminSettingsUsers = {
        refreshAll,
        persistSelfAccountFromForm: async function () {
            const emailInput = document.getElementById("admin-account-email");
            if (!emailInput) return;
            const nameInput = document.getElementById("admin-account-name");
            const passInput = document.getElementById("admin-account-password");
            const body = {
                email: emailInput.value.trim(),
                displayName: nameInput ? nameInput.value.trim() : ""
            };
            if (passInput && passInput.value.trim()) body.password = passInput.value;
            const res = await adminApiFetch("/api/admin/account", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "管理者アカウントの保存に失敗しました");
            if (passInput) passInput.value = "";
            await loadCurrentProfile();
        }
    };

    if (addBtn) {
        addBtn.addEventListener("click", async function () {
            const payload = {
                email: emailEl ? emailEl.value.trim() : "",
                displayName: nameEl ? nameEl.value.trim() : "",
                role: roleEl ? roleEl.value : "user",
                password: passEl ? passEl.value : ""
            };
            if (!payload.email || !payload.password) {
                toastWarning("メールと初期パスワードを入力してください");
                return;
            }
            try {
                const res = await adminApiFetch("/api/admin/admin-users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const d = await res.json();
                if (d.success) {
                    toastSuccess(d.message);
                    if (emailEl) emailEl.value = "";
                    if (nameEl) nameEl.value = "";
                    if (passEl) passEl.value = "";
                    if (roleEl) roleEl.value = "user";
                    loadUsers();
                } else toastError(d.message || "失敗");
            } catch (e) {
                toastError("通信エラー");
            }
        });
    }

    if (btnTemplate) {
        btnTemplate.addEventListener("click", function () {
            window.location.href = "/api/admin/admin-users/template";
        });
    }

    if (btnUpload && fileInput) {
        btnUpload.addEventListener("click", function () {
            fileInput.click();
        });
        fileInput.addEventListener("change", function () {
            if (!this.files || !this.files[0]) return;
            const file = this.files[0];
            const reader = new FileReader();
            reader.onload = async function () {
                const base64 = reader.result.split(",")[1];
                try {
                    const res = await adminApiFetch("/api/upload-admin-user-data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileData: base64 })
                    });
                    const d = await res.json();
                    if (d.success) {
                        toastSuccess(d.message);
                        refreshAll();
                    } else toastError(d.message || "取込失敗");
                } catch (e) {
                    toastError("通信エラー");
                }
                fileInput.value = "";
            };
            reader.readAsDataURL(file);
        });
    }

    document.addEventListener("admin-settings-ready", function () {
        refreshAll();
    });
});
