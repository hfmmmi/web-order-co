// public/js/admin-kaitori.js
// 買取査定画面の「司令塔（Controller）」
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
    let kaitoriSortKey = null;
    let kaitoriSortDirection = "asc";

    const KAITORI_STATUS_SORT_RANK = {
        "未対応": 0,
        "査定中": 1,
        "保留": 2,
        "成立": 3,
        "キャンセル(返却)": 4,
        "キャンセル(廃棄)": 5
    };

    function normalizeKaitoriListStatus(s) {
        return s && String(s).trim() !== "" ? String(s).trim() : "未対応";
    }

    function kaitoriListItemCount(req) {
        return (req.items || []).reduce(function (sum, item) {
            return sum + (item.qty || 0);
        }, 0);
    }

    function kaitoriListTotalAmount(req) {
        return (req.items || []).reduce(function (sum, item) {
            return sum + (item.subtotal || 0);
        }, 0);
    }

    // =========================================
    // 0. 初期化・イベントリスナー設定
    // =========================================

    // イベント委譲（Event Delegation）
    if (view.listBody) {
        view.listBody.addEventListener("click", (e) => {
            const idLink = e.target.closest(".kaitori-id-link");
            if (idLink && idLink.dataset.id) {
                e.preventDefault();
                e.stopPropagation();
                const req = allKaitoriRequests.find((r) => String(r.requestId) === idLink.dataset.id);
                if (req) {
                    openRequestModal(req);
                } else {
                    console.error("Data not found for ID:", idLink.dataset.id);
                }
                return;
            }

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

    if (view.masterBody) {
        view.masterBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".btn-edit-master");
            if (!btn || !btn.dataset.id) return;
            e.stopPropagation();
            const item = allMasterData.find((m) => String(m.id) === btn.dataset.id);
            if (item) view.openMasterModal(item);
        });
    }

    // タブ切り替え
    const tabRequests = document.querySelector("button[onclick*='requests']");
    const tabMaster = document.querySelector("button[onclick*='master']");
    if (tabRequests) tabRequests.addEventListener("click", loadKaitoriList);
    if (tabMaster) tabMaster.addEventListener("click", loadMasterList);

    // リフレッシュボタン
    // フィルタリングタブ
    setupFilterTabs();

    // 認証完了シグナル待ち
    document.addEventListener("admin-ready", function() {
        console.log("🚀 Kaitori: Auth Signal Received.");
        renderKaitoriTableHead();
        loadKaitoriList(); // 初期表示

        fetch("/api/admin/settings")
            .then((res) => (res.ok ? res.json() : {}))
            .then((data) => {
                const prim = data.dataFormats && data.dataFormats.priceListCategories
                    ? data.dataFormats.priceListCategories.manufacturerSplitCategory
                    : "";
                if (prim) view.setPrimaryProductCategory(prim);
            })
            .catch(() => {});
        
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

        const btnActive = createTabBtn("未完了", "btn-warning");
        const btnClosed = createTabBtn("履歴", "btn-secondary");

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

    function getKaitoriSortRawValue(req, key) {
        if (!req) return null;
        switch (key) {
            case "id":
                return typeof kaitoriDisplayId === "function" ? kaitoriDisplayId(req) : String(req.requestId || "");
            case "requestDate":
                return req.requestDate || "";
            case "customerName":
                return req.customerName || "";
            case "status":
                return normalizeKaitoriListStatus(req.status);
            case "itemCount":
                return kaitoriListItemCount(req);
            case "totalAmount":
                return kaitoriListTotalAmount(req);
            default:
                return null;
        }
    }

    function compareKaitoriSortValues(aVal, bVal, key) {
        if (aVal == null && bVal == null) return 0;
        if (aVal == null || aVal === "") return 1;
        if (bVal == null || bVal === "") return -1;

        if (key === "requestDate") {
            const ta = new Date(aVal).getTime();
            const tb = new Date(bVal).getTime();
            const na = Number.isNaN(ta) ? 0 : ta;
            const nb = Number.isNaN(tb) ? 0 : tb;
            return na - nb;
        }

        if (key === "id") {
            const na = Number(aVal);
            const nb = Number(bVal);
            if (!Number.isNaN(na) && !Number.isNaN(nb) && String(aVal).trim() !== "" && String(bVal).trim() !== "") {
                return na - nb;
            }
            return String(aVal).localeCompare(String(bVal), "ja", { numeric: true });
        }

        if (key === "status") {
            const ra = Object.prototype.hasOwnProperty.call(KAITORI_STATUS_SORT_RANK, aVal)
                ? KAITORI_STATUS_SORT_RANK[aVal]
                : 99;
            const rb = Object.prototype.hasOwnProperty.call(KAITORI_STATUS_SORT_RANK, bVal)
                ? KAITORI_STATUS_SORT_RANK[bVal]
                : 99;
            if (ra !== rb) return ra - rb;
            return String(aVal).localeCompare(String(bVal), "ja");
        }

        if (key === "itemCount" || key === "totalAmount") {
            return Number(aVal) - Number(bVal);
        }

        return String(aVal).localeCompare(String(bVal), "ja", { sensitivity: "base" });
    }

    function sortKaitoriRequests(list) {
        if (!kaitoriSortKey || !Array.isArray(list)) return list;
        const dir = kaitoriSortDirection === "desc" ? -1 : 1;
        const key = kaitoriSortKey;
        return [...list].sort(function (a, b) {
            const cmp = compareKaitoriSortValues(
                getKaitoriSortRawValue(a, key),
                getKaitoriSortRawValue(b, key),
                key
            );
            if (cmp !== 0) return cmp * dir;
            const idA = getKaitoriSortRawValue(a, "id");
            const idB = getKaitoriSortRawValue(b, "id");
            return compareKaitoriSortValues(idA, idB, "id") * dir;
        });
    }

    function handleKaitoriSortHeaderClick(key) {
        if (kaitoriSortKey === key) {
            kaitoriSortDirection = kaitoriSortDirection === "asc" ? "desc" : "asc";
        } else {
            kaitoriSortKey = key;
            kaitoriSortDirection = "asc";
        }
        renderKaitoriTableHead();
        renderListFiltered();
    }

    function createKaitoriSortHeaderCell(key, label, className) {
        const th = document.createElement("th");
        th.scope = "col";
        if (className) th.className = className;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "orders-sort-link";
        btn.textContent = label;

        if (kaitoriSortKey === key) {
            btn.classList.add("is-active");
            btn.setAttribute(
                "aria-sort",
                kaitoriSortDirection === "asc" ? "ascending" : "descending"
            );
            const indicator = document.createElement("span");
            indicator.className = "orders-sort-indicator";
            indicator.setAttribute("aria-hidden", "true");
            indicator.textContent = kaitoriSortDirection === "asc" ? " ▲" : " ▼";
            btn.appendChild(indicator);
        } else {
            btn.setAttribute("aria-sort", "none");
        }

        btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleKaitoriSortHeaderClick(key);
        });

        th.appendChild(btn);
        return th;
    }

    function renderKaitoriTableHead() {
        const headRow = document.getElementById("kaitori-table-head-row");
        if (!headRow) return;
        headRow.innerHTML = "";
        headRow.appendChild(createKaitoriSortHeaderCell("id", "ID", "kaitori-col-id"));
        headRow.appendChild(createKaitoriSortHeaderCell("requestDate", "申請日時"));
        headRow.appendChild(createKaitoriSortHeaderCell("customerName", "顧客名"));
        headRow.appendChild(createKaitoriSortHeaderCell("status", "状態"));
        headRow.appendChild(createKaitoriSortHeaderCell("itemCount", "点数", "kaitori-th-numeric"));
        headRow.appendChild(createKaitoriSortHeaderCell("totalAmount", "査定合計", "kaitori-th-numeric"));
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

        view.renderRequestList(sortKaitoriRequests(filtered));
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

    const masterSearchTextInput = document.getElementById("kaitori-master-search-text");
    const masterSearchBtn = document.getElementById("btn-kaitori-master-search");
    const clearMasterSearchBtn = document.getElementById("clear-kaitori-master-search");
    const masterResultInfoEl = document.getElementById("kaitori-master-result-info");
    const masterPaginationEl = document.getElementById("kaitori-master-pagination");

    let masterCurrentPage = 1;
    const MASTER_PAGE_SIZE = 25;

    function normalizeMasterSearchString(str) {
        if (!str) return "";
        return String(str)
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
            .toLowerCase();
    }

    function getFilteredMasterData() {
        const raw = masterSearchTextInput ? masterSearchTextInput.value : "";
        const q = normalizeMasterSearchString(raw.trim());
        if (!q) return allMasterData;
        return allMasterData.filter((m) => {
            const maker = normalizeMasterSearchString(m.maker || "");
            const name = normalizeMasterSearchString(m.name || "");
            const id = normalizeMasterSearchString(m.id != null ? String(m.id) : "");
            return maker.includes(q) || name.includes(q) || id.includes(q);
        });
    }

    function buildMasterPageNumberItems(totalPages, current) {
        if (totalPages <= 1) return [];
        const nums = new Set([1, totalPages, current]);
        for (let d = -2; d <= 2; d++) nums.add(current + d);
        const sorted = [...nums].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
        const out = [];
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push(null);
            out.push(sorted[i]);
        }
        return out;
    }

    function buildMasterPaginationNav(totalPages, currentPage) {
        const nav = document.createElement("nav");
        nav.className = "orders-pagination";
        nav.setAttribute("aria-label", "マスタ一覧ページ送り");

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "orders-pagination-btn orders-pagination-prev";
        prevBtn.textContent = "前へ";
        prevBtn.disabled = currentPage <= 1;
        prevBtn.addEventListener("click", () => {
            if (masterCurrentPage <= 1) return;
            masterCurrentPage--;
            renderMasterListPaged(false);
        });

        const pagesWrap = document.createElement("div");
        pagesWrap.className = "orders-pagination-pages";

        buildMasterPageNumberItems(totalPages, currentPage).forEach((entry) => {
            if (entry === null) {
                const ell = document.createElement("span");
                ell.className = "orders-pagination-ellipsis";
                ell.textContent = "…";
                ell.setAttribute("aria-hidden", "true");
                pagesWrap.appendChild(ell);
                return;
            }
            const p = entry;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "orders-pagination-btn orders-pagination-page";
            btn.textContent = String(p);
            if (p === currentPage) {
                btn.classList.add("is-current");
                btn.setAttribute("aria-current", "page");
            }
            btn.addEventListener("click", () => {
                masterCurrentPage = p;
                renderMasterListPaged(false);
            });
            pagesWrap.appendChild(btn);
        });

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "orders-pagination-btn orders-pagination-next";
        nextBtn.textContent = "次へ";
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.addEventListener("click", () => {
            if (masterCurrentPage >= totalPages) return;
            masterCurrentPage++;
            renderMasterListPaged(false);
        });

        nav.appendChild(prevBtn);
        nav.appendChild(pagesWrap);
        nav.appendChild(nextBtn);
        return nav;
    }

    function renderMasterListPaged(resetToFirstPage) {
        const filtered = getFilteredMasterData();
        if (resetToFirstPage) masterCurrentPage = 1;

        const totalPages = Math.max(1, Math.ceil(filtered.length / MASTER_PAGE_SIZE));
        if (masterCurrentPage > totalPages) masterCurrentPage = totalPages;
        const page = masterCurrentPage;
        const startIdx = (page - 1) * MASTER_PAGE_SIZE;
        const slice = filtered.slice(startIdx, startIdx + MASTER_PAGE_SIZE);
        const fromN = filtered.length === 0 ? 0 : startIdx + 1;
        const toN = startIdx + slice.length;

        if (masterResultInfoEl) {
            if (totalPages > 1) {
                masterResultInfoEl.innerHTML =
                    `該当：<strong>${filtered.length}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示`;
            } else {
                masterResultInfoEl.innerHTML = `該当：<strong>${filtered.length}</strong> 件`;
            }
        }

        if (masterPaginationEl) {
            masterPaginationEl.innerHTML = "";
            if (totalPages > 1) {
                masterPaginationEl.appendChild(buildMasterPaginationNav(totalPages, page));
            }
        }

        view.renderMasterList(slice);
    }

    function debounceMasterSearch(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    const debouncedMasterSearch = debounceMasterSearch(() => renderMasterListPaged(true), 300);

    if (masterSearchTextInput) {
        masterSearchTextInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                masterSearchBtn?.click();
            }
        });
        masterSearchTextInput.addEventListener("input", () => debouncedMasterSearch());
    }
    if (masterSearchBtn) masterSearchBtn.addEventListener("click", () => renderMasterListPaged(true));
    if (clearMasterSearchBtn && masterSearchTextInput) {
        clearMasterSearchBtn.addEventListener("click", () => {
            masterSearchTextInput.value = "";
            masterSearchTextInput.focus();
            masterSearchTextInput.dispatchEvent(new Event("input"));
        });
    }

    async function loadMasterList() {
        if (masterResultInfoEl) masterResultInfoEl.innerHTML = "";
        if (masterPaginationEl) masterPaginationEl.innerHTML = "";
        view.masterBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">読込中...</td></tr>';
        try {
            const res = await fetch("/kaitori-master");
            if (res.status === 401) return;
            allMasterData = await res.json();
            renderMasterListPaged(true);
        } catch (e) {
            if (masterResultInfoEl) masterResultInfoEl.innerHTML = "";
            if (masterPaginationEl) masterPaginationEl.innerHTML = "";
            view.masterBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">読込失敗</td></tr>';
        }
    }

    // 新規追加ボタン
    document.getElementById("btn-add-kaitori-item")?.addEventListener("click", () => view.openMasterModal(null));

    document.getElementById("km-status")?.addEventListener("change", () => view.syncMasterPriceFieldState());

    document.getElementById("km-btn-delete")?.addEventListener("click", () => {
        const id = document.getElementById("km-id").value;
        if (!id) return;
        deleteMasterItem(id);
    });

    // マスタ保存
    document.getElementById("km-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("km-id").value;
        const status = document.getElementById("km-status").value;
        const priceInput = document.getElementById("km-price");
        const payload = {
            id: id || undefined,
            maker: document.getElementById("km-maker").value,
            name: document.getElementById("km-name").value,
            type: document.getElementById("km-type").value,
            status,
            price: parseInt(priceInput.value, 10) || 0,
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
            const res = await fetch("/admin/kaitori-master/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                toastSuccess("削除しました");
                view.closeMasterModal();
            } else if (!res.ok) {
                toastError(data.message || "削除に失敗しました");
            }
            loadMasterList();
        } catch (e) { toastError("通信エラー"); }
    }

    // CSV/Excel 一括取込（ファイル選択で即実行）
    const btnKaitoriMore = document.getElementById("btn-kaitori-more");
    const kaitoriMoreMenu = document.getElementById("kaitori-more-menu");

    function setKaitoriMoreMenuOpen(open) {
        if (!kaitoriMoreMenu) return;
        if (open) {
            kaitoriMoreMenu.classList.add("is-open");
            kaitoriMoreMenu.setAttribute("aria-hidden", "false");
            if (btnKaitoriMore) btnKaitoriMore.setAttribute("aria-expanded", "true");
        } else {
            kaitoriMoreMenu.classList.remove("is-open");
            kaitoriMoreMenu.setAttribute("aria-hidden", "true");
            if (btnKaitoriMore) btnKaitoriMore.setAttribute("aria-expanded", "false");
        }
    }

    if (btnKaitoriMore && kaitoriMoreMenu) {
        btnKaitoriMore.addEventListener("click", function (e) {
            e.stopPropagation();
            setKaitoriMoreMenuOpen(!kaitoriMoreMenu.classList.contains("is-open"));
        });
    }

    document.addEventListener("click", function () {
        setKaitoriMoreMenuOpen(false);
    });

    document.getElementById("btn-kaitori-download-list")?.addEventListener("click", (e) => {
        e.stopPropagation();
        setKaitoriMoreMenuOpen(false);
        window.location.href = "/admin/kaitori-master/export";
    });

    document.getElementById("btn-kaitori-upload-list")?.addEventListener("click", (e) => {
        e.stopPropagation();
        setKaitoriMoreMenuOpen(false);
        document.getElementById("kaitori-file-input")?.click();
    });

    document.getElementById("kaitori-file-input")?.addEventListener("change", async () => {
        const fileInput = document.getElementById("kaitori-file-input");
        const file = fileInput?.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("excelFile", file);
        try {
            const res = await fetch("/api/admin/kaitori/parse-excel", {
                method: "POST",
                credentials: "include",
                body: formData
            });
            const result = await res.json();
            if (!result.success) {
                toastError(result.message || "ファイルの読み込みに失敗しました");
                fileInput.value = "";
                return;
            }
            const rawData = result.data || [];
            if (rawData.length === 0) {
                toastWarning("データがありません");
                fileInput.value = "";
                return;
            }

            const masterData = rawData.map((row, idx) => {
                const rawStatus = row["ステータス"] || row["Status"] || "買取中";
                const status = rawStatus === "買取終了" ? "買取終了" : "買取中";
                return {
                    id: row["ID"] || `K-IMP-${Date.now()}-${idx}`,
                    maker: row["メーカー"] || row["Maker"] || "",
                    name: row["商品名"] || row["Name"] || "",
                    type: row["区分"] || row["Type"] || "その他",
                    status,
                    price: row["買取単価"] || row["Price"] || 0,
                    destination: row["納品先"] || row["買取先"] || row["Destination"] || "大阪"
                };
            });
            await sendImportData(masterData);
        } catch (err) {
            console.error(err);
            toastError("ファイル読込失敗。形式を確認してください。");
        } finally {
            fileInput.value = "";
        }
    });

    async function sendImportData(data) {
        if (!confirm(`${data.length}件のデータをインポートしますか？\n既存のマスタは上書きされます。`)) return;
        try {
            const res = await fetch("/admin/kaitori-master/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ masterData: data })
            });
            const result = await res.json();
            if (result.success) {
                toastSuccess(result.message, 4000);
                loadMasterList();
            } else {
                toastError("エラー: " + result.message);
            }
        } catch (err) { toastError("通信エラー"); }
    }
});