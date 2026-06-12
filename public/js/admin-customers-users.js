document.addEventListener("DOMContentLoaded", function () {
    const cmTabs = document.getElementById("cm-tabs");
    const cmTabCompany = document.getElementById("cm-tab-company");
    const cmTabUsers = document.getElementById("cm-tab-users");
    const cmPanelCompany = document.getElementById("cm-panel-company");
    const cmPanelUsers = document.getElementById("cm-panel-users");
    const cmUsersCompanyLabel = document.getElementById("cm-users-company-label");
    const cmUsersListWrap = document.getElementById("cm-users-list-wrap");
    const cmUserEmail = document.getElementById("cm-user-email");
    const cmUserDisplayName = document.getElementById("cm-user-display-name");
    const cmUserRole = document.getElementById("cm-user-role");
    const cmUserPassword = document.getElementById("cm-user-password");
    const cmUserAddBtn = document.getElementById("cm-user-add-btn");
    const cmId = document.getElementById("cm-id");
    const cmName = document.getElementById("cm-name");
    const customerUserCsvInput = document.getElementById("customer-user-csv-file-input");
    const btnCustomerUserTemplate = document.getElementById("btn-customer-user-template");
    const btnCustomerUserUpload = document.getElementById("btn-customer-user-upload");

    let editingCustomerId = null;

    function esc(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function showCompanyTab() {
        if (cmTabCompany) cmTabCompany.classList.add("is-current");
        if (cmTabUsers) cmTabUsers.classList.remove("is-current");
        if (cmPanelCompany) cmPanelCompany.style.display = "block";
        if (cmPanelUsers) cmPanelUsers.style.display = "none";
    }

    function showUsersTab() {
        if (cmTabCompany) cmTabCompany.classList.remove("is-current");
        if (cmTabUsers) cmTabUsers.classList.add("is-current");
        if (cmPanelCompany) cmPanelCompany.style.display = "none";
        if (cmPanelUsers) cmPanelUsers.style.display = "block";
    }

    window.AdminCustomersUsers = {
        onOpenModal(mode, data) {
            editingCustomerId = mode === "edit" ? data.id : null;
            if (cmTabs) cmTabs.style.display = mode === "edit" ? "flex" : "none";
            showCompanyTab();
            if (mode === "edit" && editingCustomerId) {
                if (cmUsersCompanyLabel) {
                    cmUsersCompanyLabel.textContent = `${data.id} ${data.name || ""} のログインユーザー`;
                }
                loadUsers(editingCustomerId);
            }
        },
        openUsersTab(customerId, customerName) {
            editingCustomerId = customerId;
            if (cmTabs) cmTabs.style.display = "flex";
            if (cmUsersCompanyLabel) {
                cmUsersCompanyLabel.textContent = `${customerId} ${customerName || ""} のログインユーザー`;
            }
            showUsersTab();
            loadUsers(customerId);
        }
    };

    if (cmTabCompany) cmTabCompany.addEventListener("click", showCompanyTab);
    if (cmTabUsers) cmTabUsers.addEventListener("click", function () {
        if (!editingCustomerId && cmId) editingCustomerId = cmId.value.trim();
        showUsersTab();
        if (editingCustomerId) loadUsers(editingCustomerId);
    });

    async function loadUsers(customerId) {
        if (!cmUsersListWrap || !customerId) return;
        cmUsersListWrap.innerHTML = "<p>読込中…</p>";
        try {
            const res = await adminApiFetch("/api/admin/customers/" + encodeURIComponent(customerId) + "/users");
            const data = await res.json();
            if (!data.success) {
                cmUsersListWrap.innerHTML = "<p>取得に失敗しました</p>";
                return;
            }
            if (!data.users.length) {
                cmUsersListWrap.innerHTML = "<p>ユーザーが未登録です。下のフォームまたは「ユーザー一括登録」で追加してください。</p>";
                return;
            }
            let html = "<table class='cust-table cu-users-table' style='width:100%;'><thead><tr><th>メール</th><th>表示名</th><th>権限</th><th>状態</th><th>操作</th></tr></thead><tbody>";
            data.users.forEach(function (u) {
                const uid = esc(u.userId);
                const roleVal = u.role === "admin" ? "admin" : "user";
                const activeVal = u.active === false ? "false" : "true";
                html += "<tr data-user-id=\"" + uid + "\">";
                html += "<td>" + esc(u.email) + "</td>";
                html += "<td>" + esc(u.displayName || "-") + "</td>";
                html += "<td><select class=\"cu-role-select\" data-id=\"" + uid + "\" aria-label=\"権限\">"
                    + "<option value=\"user\"" + (roleVal === "user" ? " selected" : "") + ">一般</option>"
                    + "<option value=\"admin\"" + (roleVal === "admin" ? " selected" : "") + ">管理者</option>"
                    + "</select></td>";
                html += "<td><select class=\"cu-active-select\" data-id=\"" + uid + "\" aria-label=\"状態\">"
                    + "<option value=\"true\"" + (activeVal === "true" ? " selected" : "") + ">有効</option>"
                    + "<option value=\"false\"" + (activeVal === "false" ? " selected" : "") + ">無効</option>"
                    + "</select></td>";
                html += "<td style='white-space:nowrap;'>";
                if (u.active !== false) {
                    html += "<button type='button' class='btn-cu-invite' data-id='" + uid + "' data-email='" + esc(u.email) + "'>招待</button>";
                } else {
                    html += "<span style=\"color:#9ca3af;font-size:0.8125rem;\">—</span>";
                }
                html += "</td></tr>";
            });
            html += "</tbody></table>";
            cmUsersListWrap.innerHTML = html;

            cmUsersListWrap.querySelectorAll(".cu-role-select").forEach(function (sel) {
                sel.dataset.prev = sel.value;
                sel.addEventListener("change", async function () {
                    const userId = this.dataset.id;
                    const role = this.value;
                    const prev = this.dataset.prev;
                    try {
                        const r = await adminApiFetch("/api/admin/customer-users/" + encodeURIComponent(userId), {
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

            cmUsersListWrap.querySelectorAll(".cu-active-select").forEach(function (sel) {
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
                        const r = await adminApiFetch("/api/admin/customer-users/" + encodeURIComponent(userId), {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active })
                        });
                        const d = await r.json();
                        if (d.success) {
                            this.dataset.prev = this.value;
                            toastSuccess(active ? "ユーザーを有効化しました" : "ユーザーを無効化しました");
                            loadUsers(editingCustomerId);
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

            cmUsersListWrap.querySelectorAll(".btn-cu-invite").forEach(function (btn) {
                btn.addEventListener("click", async function () {
                    const userId = this.dataset.id;
                    const email = this.dataset.email;
                    if (!confirm(email + " 宛に招待メールを送信しますか？\n（パスワードはリセットされます）")) return;
                    try {
                        const r = await adminApiFetch("/api/admin/customer-users/invite", {
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
            cmUsersListWrap.innerHTML = "<p>取得に失敗しました</p>";
        }
    }

    if (cmUserAddBtn) {
        cmUserAddBtn.addEventListener("click", async function () {
            const customerId = editingCustomerId || (cmId ? cmId.value.trim() : "");
            if (!customerId) {
                toastWarning("先に企業情報を保存するか、編集モードで開いてください");
                return;
            }
            const payload = {
                customerId,
                email: cmUserEmail ? cmUserEmail.value.trim() : "",
                displayName: cmUserDisplayName ? cmUserDisplayName.value.trim() : "",
                role: cmUserRole ? cmUserRole.value : "user",
                password: cmUserPassword ? cmUserPassword.value : ""
            };
            if (!payload.email || !payload.password) {
                toastWarning("メールと初期パスワードを入力してください");
                return;
            }
            try {
                const res = await adminApiFetch("/api/admin/customer-users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const d = await res.json();
                if (d.success) {
                    toastSuccess(d.message);
                    if (cmUserEmail) cmUserEmail.value = "";
                    if (cmUserDisplayName) cmUserDisplayName.value = "";
                    if (cmUserPassword) cmUserPassword.value = "";
                    loadUsers(customerId);
                } else toastError(d.message || "失敗");
            } catch (e) {
                toastError("通信エラー");
            }
        });
    }

    if (btnCustomerUserTemplate) {
        btnCustomerUserTemplate.addEventListener("click", function () {
            window.location.href = "/api/admin/customer-users/template";
        });
    }

    if (btnCustomerUserUpload && customerUserCsvInput) {
        btnCustomerUserUpload.addEventListener("click", function () {
            customerUserCsvInput.click();
        });
        customerUserCsvInput.addEventListener("change", function () {
            if (!this.files || !this.files[0]) return;
            const file = this.files[0];
            const reader = new FileReader();
            reader.onload = async function () {
                const base64 = reader.result.split(",")[1];
                try {
                    const res = await adminApiFetch("/api/upload-customer-user-data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileData: base64 })
                    });
                    const d = await res.json();
                    if (d.success) toastSuccess(d.message);
                    else toastError(d.message || "取込失敗");
                } catch (e) {
                    toastError("通信エラー");
                }
                customerUserCsvInput.value = "";
            };
            reader.readAsDataURL(file);
        });
    }
});
