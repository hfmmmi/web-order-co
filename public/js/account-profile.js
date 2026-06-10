// 顧客: アカウント設定（GET/PUT /api/account/profile）
(function () {
    function toast(msg, type) {
        if (type === "success" && window.toastSuccess) window.toastSuccess(msg);
        else if (type === "error" && window.toastError) window.toastError(msg);
        else if (window.toastWarning) window.toastWarning(msg);
        else alert(msg);
    }

    document.addEventListener("DOMContentLoaded", function () {
        const loadStatus = document.getElementById("profile-load-status");
        const mainEl = document.getElementById("profile-main");
        const form = document.getElementById("profile-form");
        const userIdInput = document.getElementById("profile-user-id");
        const customerNameInput = document.getElementById("profile-customer-name");
        const contactNameGroup = document.getElementById("profile-contact-name-group");
        const contactNameInput = document.getElementById("profile-contact-name");
        const emailGroup = document.getElementById("profile-email-group");
        const emailInput = document.getElementById("profile-email");
        const currentPasswordInput = document.getElementById("profile-current-password");
        const newPasswordInput = document.getElementById("profile-new-password");
        const saveBtn = document.getElementById("profile-save-btn");
        const accountNote = document.getElementById("profile-account-note");

        if (!loadStatus || !mainEl || !form) return;

        let accountType = "company";

        function applyProfile(data) {
            accountType = data.accountType || "company";
            if (userIdInput) {
                userIdInput.value = data.userId || data.customerId || "";
            }
            if (customerNameInput) {
                customerNameInput.value = data.customerName || "";
            }

            if (accountType === "staff") {
                if (contactNameGroup) contactNameGroup.style.display = "";
                if (contactNameInput) contactNameInput.value = data.contactName || "";
                if (emailGroup) emailGroup.style.display = "";
                if (emailInput) {
                    emailInput.value = data.email || "";
                    emailInput.readOnly = false;
                }
                if (accountNote) {
                    accountNote.textContent =
                        "担当者アカウントでログインしています。担当者名・メールアドレス・パスワードを変更できます。";
                    accountNote.hidden = false;
                }
            } else {
                if (contactNameGroup) contactNameGroup.style.display = "none";
                if (emailGroup) emailGroup.style.display = "none";
                if (accountNote) {
                    accountNote.textContent =
                        "パスワード変更のみ可能です。担当者追加は管理者にお問い合わせください。";
                    accountNote.hidden = false;
                }
            }
        }

        async function loadProfile() {
            try {
                const res = await fetch("/api/account/profile", { credentials: "include" });
                if (res.status === 401) {
                    window.location.href = "index.html";
                    return;
                }
                const data = await res.json();
                if (!data.success) {
                    loadStatus.textContent = data.message || "読み込みに失敗しました";
                    return;
                }
                applyProfile(data);
                loadStatus.style.display = "none";
                mainEl.style.display = "";
            } catch (e) {
                console.error(e);
                loadStatus.textContent = "読み込みに失敗しました";
            }
        }

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            const currentPassword = currentPasswordInput ? currentPasswordInput.value : "";
            if (!currentPassword) {
                toast("現在のパスワードを入力してください", "warn");
                return;
            }

            const payload = { currentPassword };
            const newPassword = newPasswordInput ? newPasswordInput.value : "";
            if (newPassword) payload.password = newPassword;

            if (accountType === "staff") {
                if (contactNameInput) payload.contactName = contactNameInput.value.trim();
                if (emailInput) payload.email = emailInput.value.trim();
            } else if (!newPassword) {
                toast("新しいパスワードを入力してください", "warn");
                return;
            }

            if (saveBtn) saveBtn.disabled = true;
            try {
                const res = await fetch("/api/account/profile", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    toast(data.message || "保存に失敗しました", "error");
                    return;
                }
                toast(data.message || "保存しました", "success");
                if (currentPasswordInput) currentPasswordInput.value = "";
                if (newPasswordInput) newPasswordInput.value = "";
                if (accountType === "staff" && data.contactName !== undefined && contactNameInput) {
                    contactNameInput.value = data.contactName;
                }
            } catch (err) {
                console.error(err);
                toast("保存に失敗しました", "error");
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        });

        loadProfile();
    });
})();
