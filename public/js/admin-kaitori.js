// public/js/admin-kaitori.js
// 買取管理画面の「司令塔（Controller）」
// ※ Viewクラスを操作し、サーバーと通信を行う

document.addEventListener("DOMContentLoaded", function () {
    console.log("♻️ Kaitori Controller Loaded (v8.3 Fixed URL)");

    // Viewの召喚 (admin-kaitori-view.js が必須)
    const view = new KaitoriView();

    // 状態管理
    let allKaitoriRequests = [];
    let allMasterData = [];
    let currentReqData = null; // 編集中の依頼データ
    let currentFilterType = "active"; // active | closed

    // =========================================
    // 0. 初期化・イベントリスナー設定
    // =========================================

    // イベント委譲（Event Delegation）
    if (view.listBody) {
        view.listBody.addEventListener("click", (e) => {
            const row = e.target.closest(".kaitori-row");
            if (!row || !row.dataset.id) return;

            const req = allKaitoriRequests.find(r => String(r.requestId) === row.dataset.id);
            if (req) {
                openRequestModal(req);
            } else {
                console.error("Data not found for ID:", row.dataset.id);
            }
        });
    }

    // タブ切り替え
    const tabRequests = document.querySelector("button[onclick*='requests']");
    const tabMaster = document.querySelector("button[onclick*='master']");
    if (tabRequests) tabRequests.addEventListener("click", loadKaitoriList);
    if (tabMaster) tabMaster.addEventListener("click", loadMasterList);

    // リフレッシュボタン
    document.getElementById("btn-refresh-kaitori")?.addEventListener("click", loadKaitoriList);

    // フィルタリングタブ
    setupFilterTabs();

    // 認証完了シグナル待ち
    document.addEventListener("admin-ready", function() {
        console.log("🚀 Kaitori: Auth Signal Received.");
        loadKaitoriList(); // 初期表示
        
        // 裏でマスタも取得しておく (URL修正: /api削除)
        fetch("/kaitori-master")
            .then(res => res.status === 200 ? res.json() : [])
            .then(data => allMasterData = data)
            .catch(console.error);
    });

    // =========================================
    // 1. 査定依頼リスト管理
    // =========================================

    async function loadKaitoriList() {
        try {
            view.listBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">データ読込中...</td></tr>';
            // ★修正: /api を削除 (/admin/kaitori-list)
            const res = await fetch("/admin/kaitori-list");
            if (res.status === 401) return; // 認証エラーはadmin-commonが処理

            // 404チェック
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            allKaitoriRequests = await res.json();
            renderListFiltered();
        } catch (err) {
            console.error(err);
            view.listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">読込失敗</td></tr>';
        }
    }

    function setupFilterTabs() {
        const targetArea = document.getElementById("kaitori-req-search-area");
        if (!targetArea || document.getElementById("status-tab-container")) return;

        targetArea.innerHTML = "";
        const container = document.createElement("div");
        container.id = "status-tab-container";
        container.style.cssText = "display:flex; gap:10px; margin-bottom:10px;";

        const btnActive = createTabBtn("🔥 未完了アクション", "btn-warning");
        const btnClosed = createTabBtn("🏁 完了・履歴", "btn-secondary");

        btnActive.onclick = () => {
            currentFilterType = "active";
            updateTabStyle(btnActive, btnClosed);
            renderListFiltered();
        };
        btnClosed.onclick = () => {
            currentFilterType = "closed";
            updateTabStyle(btnClosed, btnActive);
            renderListFiltered();
        };

        container.appendChild(btnActive);
        container.appendChild(btnClosed);
        targetArea.appendChild(container);

        updateTabStyle(btnActive, btnClosed);
    }

    function createTabBtn(text, cls) {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.className = `btn ${cls}`;
        btn.style.flex = "1";
        return btn;
    }

    function updateTabStyle(active, inactive) {
        active.style.opacity = "1.0";
        active.style.fontWeight = "bold";
        active.style.border = "2px solid #333";
        inactive.style.opacity = "0.6";
        inactive.style.fontWeight = "normal";
        inactive.style.border = "1px solid #ccc";
    }

    function renderListFiltered() {
        const normalizeStatus = (s) => (s && s.trim() !== "") ? s : "未対応";
        let filtered = [];

        if (currentFilterType === "active") {
            filtered = allKaitoriRequests.filter(req => {
                const s = normalizeStatus(req.status);
                return !s.includes("成立") && !s.includes("キャンセル");
            });
        } else {
            filtered = allKaitoriRequests.filter(req => {
                const s = normalizeStatus(req.status);
                return s.includes("成立") || s.includes("キャンセル");
            });
        }
        
        view.renderRequestList(filtered);
    }

    // =========================================
    // 2. 詳細モーダル制御
    // =========================================

    function openRequestModal(req) {
        currentReqData = JSON.parse(JSON.stringify(req));
        
        view.openRequestModal(
            currentReqData,
            handleItemChange,
            handleItemDelete
        );

        setupAddItemEvents();
    }

    const handleItemChange = (index, field, value) => {
        const val = field === "name" ? value : (parseInt(value) || 0);
        currentReqData.items[index][field] = val;
        
        view.renderEditableItems(currentReqData, handleItemChange, handleItemDelete);
        view.updateTotalDisplay(currentReqData);
        setupAddItemEvents(); 
    };

    const handleItemDelete = (index) => {
        if (!confirm("削除しますか？")) return;
        currentReqData.items.splice(index, 1);
        view.renderEditableItems(currentReqData, handleItemChange, handleItemDelete);
        view.updateTotalDisplay(currentReqData);
        setupAddItemEvents();
    };

    function setupAddItemEvents() {
        document.querySelector(".btn-add-item-osaka")?.addEventListener("click", () => {
            currentReqData.items.push({ name: "追加商品(大阪)", price: 0, qty: 1, destination: "大阪" });
            refreshModalItems();
        });
        document.querySelector(".btn-add-item-hyogo")?.addEventListener("click", () => {
            currentReqData.items.push({ name: "追加商品(兵庫)", price: 0, qty: 1, destination: "兵庫" });
            refreshModalItems();
        });
    }

    function refreshModalItems() {
        view.renderEditableItems(currentReqData, handleItemChange, handleItemDelete);
        view.updateTotalDisplay(currentReqData);
        setupAddItemEvents();
    }

    // 更新保存ボタン
    document.getElementById("btn-update-status")?.addEventListener("click", async () => {
        if (!currentReqData || !confirm("内容を更新しますか？")) return;

        currentReqData.items.forEach(i => i.subtotal = i.price * i.qty);

        try {
            const payload = {
                requestId: currentReqData.requestId,
                status: view.mStatusSelect.value,
                internalMemo: view.mAdminNote.value,
                customerNote: view.mCustomerNote ? view.mCustomerNote.value : "",
                items: currentReqData.items
            };

            // ★修正: /api を削除 (/admin/kaitori-update)
            const res = await fetch("/admin/kaitori-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if ((await res.json()).success) {
                toastSuccess("更新しました");
                view.closeRequestModal();
                loadKaitoriList();
            }
        } catch (e) {
            toastError("通信エラー");
        }
    });

    // メール作成
    document.getElementById("btn-create-email-osaka")?.addEventListener("click", () => createEmail("大阪"));
    document.getElementById("btn-create-email-hyogo")?.addEventListener("click", () => createEmail("兵庫"));

    function createEmail(destination) {
        if (!currentReqData) return;
        
        const itemsWithDest = currentReqData.items.map(item => {
            const master = allMasterData.find(m => m.name === item.name) || {};
            return { ...item, destination: item.destination || master.destination || "大阪" };
        });

        let targetItems = [];
        let addressName = "";
        
        if (destination === "兵庫") {
            targetItems = itemsWithDest.filter(i => i.destination === "兵庫");
            addressName = "兵庫配送センター";
        } else {
            targetItems = itemsWithDest.filter(i => i.destination !== "兵庫");
            addressName = "大阪本社";
        }

        if (targetItems.length === 0) return toastInfo("この納品先の商品はありません");

        const subject = `使用済トナー回収依頼（${view.mCustName.textContent}様分） - ${destination}行`;
        let body = `エヌシーアイ販売株式会社\n${addressName} 御中\n\n`;
        body += "お世話になります。\n以下の使用済トナーの回収をお願いします。\n\n";
        targetItems.forEach(i => body += `${i.name}　${i.qty}本\n`);
        body += `\n回収場所：${view.mCustName.textContent}\n`;
        body += "\n宜しくお願いいたします。";

        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    // =========================================
    // 3. マスタ管理
    // =========================================

    async function loadMasterList() {
        view.masterBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">読込中...</td></tr>';
        try {
            // ★修正: /api を削除 (/kaitori-master)
            const res = await fetch("/kaitori-master");
            if (res.status === 401) return;
            allMasterData = await res.json();
            view.renderMasterList(allMasterData);
            
            document.querySelectorAll(".btn-edit-master").forEach(btn => {
                btn.addEventListener("click", () => {
                    const item = allMasterData.find(m => String(m.id) === btn.dataset.id);
                    view.openMasterModal(item);
                });
            });
            document.querySelectorAll(".btn-del-master").forEach(btn => {
                btn.addEventListener("click", () => deleteMasterItem(btn.dataset.id));
            });

        } catch (e) {
            view.masterBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">読込失敗</td></tr>';
        }
    }

    // 新規追加ボタン
    document.getElementById("btn-add-kaitori-item")?.addEventListener("click", () => view.openMasterModal(null));

    // マスタ保存
    document.getElementById("km-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("km-id").value;
        const payload = {
            id: id || undefined,
            maker: document.getElementById("km-maker").value,
            name: document.getElementById("km-name").value,
            type: document.getElementById("km-type").value,
            price: parseInt(document.getElementById("km-price").value),
            destination: document.getElementById("km-destination").value
        };
        // ★修正: /api を削除
        const url = id ? "/admin/kaitori-master/edit" : "/admin/kaitori-master/add";
        
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if ((await res.json()).success) {
                toastSuccess("保存しました");
                view.closeMasterModal();
                loadMasterList();
            }
        } catch (err) { toastError("通信エラー"); }
    });

    async function deleteMasterItem(id) {
        if (!confirm("本当に削除しますか？")) return;
        try {
            // ★修正: /api を削除
            await fetch("/admin/kaitori-master/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            loadMasterList();
        } catch (e) { toastError("通信エラー"); }
    }

    // Excel一括取込（サーバー側で解析・社外アップロード対応）
    document.getElementById("btn-import-kaitori-master")?.addEventListener("click", async () => {
        const fileInput = document.getElementById("kaitori-file-input");
        const file = fileInput.files[0];
        if (!file) return toastWarning("ファイルを選択してください");

        const formData = new FormData();
        formData.append("excelFile", file);
        try {
            const res = await fetch("/api/admin/kaitori/parse-excel", {
                method: "POST",
                credentials: "include",
                body: formData
            });
            const result = await res.json();
            if (!result.success) return toastError(result.message || "Excelの読み込みに失敗しました");
            const rawData = result.data || [];
            if (rawData.length === 0) return toastWarning("データがありません");

            const masterData = rawData.map((row, idx) => ({
                id: row["ID"] || `K-IMP-${Date.now()}-${idx}`,
                maker: row["メーカー"] || row["Maker"] || "",
                name: row["商品名"] || row["Name"] || "",
                type: row["区分"] || row["Type"] || "その他",
                price: row["買取単価"] || row["Price"] || 0,
                destination: row["納品先"] || row["買取先"] || row["Destination"] || "大阪"
            }));
            sendImportData(masterData);
        } catch (err) {
            console.error(err);
            toastError("ファイル読込失敗。形式を確認してください。");
        }
    });

    async function sendImportData(data) {
        if (!confirm(`${data.length}件のデータをインポートしますか？\n既存のマスタは上書きされます。`)) return;
        try {
            // ★修正: /api を削除
            const res = await fetch("/admin/kaitori-master/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ masterData: data })
            });
            const result = await res.json();
            if (result.success) {
                toastSuccess(result.message, 4000);
                loadMasterList();
                document.getElementById("kaitori-file-input").value = ""; 
            } else {
                toastError("エラー: " + result.message);
            }
        } catch (err) { toastError("通信エラー"); }
    }
});