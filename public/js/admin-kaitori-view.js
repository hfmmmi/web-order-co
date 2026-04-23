// public/js/admin-kaitori-view.js
// 買取査定画面の「表示（View）」を担当するクラス
// ※ DOM操作はすべてここに集約し、ロジックから分離する

/** 申請日時: YYYY/MM/DD HH:mm（秒なし・ローカル） */
function formatKaitoriRequestDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${mo}/${da} ${h}:${mi}`;
}

class KaitoriView {
    constructor() {
        /** 価格表カテゴリ設定の「メーカー別シート」に使う区分（新規マスタの区分初期値） */
        this.primaryProductCategoryForBadge = "純正";

        // テーブル・モーダル等の要素参照
        this.listBody = document.getElementById("kaitori-list-body");
        this.masterBody = document.getElementById("kaitori-master-body");
        
        // 依頼詳細モーダル要素
        this.reqModal = document.getElementById("kaitori-modal");
        this.mReqId = document.getElementById("m-req-id");
        this.mCustName = document.getElementById("m-cust-name");
        this.mDate = document.getElementById("m-date");
        this.mItemList = document.getElementById("m-item-list");
        this.mTotal = document.getElementById("m-total");
        this.mStatusSelect = document.getElementById("m-status-select");
        this.mAdminNote = document.getElementById("m-admin-note");
        this.mCustomerNote = document.getElementById("m-customer-note"); // 存在確認済

        // マスタ編集モーダル要素
        this.masterModal = document.getElementById("kaitori-master-modal");
    }

    setPrimaryProductCategory(cat) {
        if (cat && String(cat).trim()) {
            this.primaryProductCategoryForBadge = String(cat).trim();
        }
    }

    // =========================================
    // 1. 査定依頼リスト描画
    // =========================================
    renderRequestList(list) {
        this.listBody.innerHTML = "";
        if (!list || list.length === 0) {
            this.listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">該当するデータはありません</td></tr>';
            return;
        }

        list.forEach(req => {
            const totalAmount = req.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
            const itemCount = req.items.reduce((sum, item) => sum + (item.qty || 0), 0);
            const dateStr = formatKaitoriRequestDateTime(req.requestDate);
            
            let status = req.status && req.status.trim() !== "" ? req.status : "未対応";

            const tr = document.createElement("tr");
            tr.style.cursor = "pointer";
            tr.className = "kaitori-row";

            let statusCellHtml;
            if (status === "キャンセル(返却)") {
                statusCellHtml = `<td>キャンセル/ 返却</td>`;
            } else if (status === "キャンセル(廃棄)") {
                statusCellHtml = `<td>キャンセル/ 廃棄</td>`;
            } else {
                let badgeClass = "badge-secondary";
                let badgeStyle = "";

                if (status === "未対応") {
                    badgeClass = "badge-danger";
                    badgeStyle = "background-color: #dc3545 !important; color: white !important; font-weight: bold;";
                } else if (status === "査定中") {
                    badgeClass = "badge-info";
                    badgeStyle =
                        "color: #111827 !important; background-color: #d6e7f1 !important; border: 1px solid #b0cde5 !important; font-weight: 600;";
                } else if (status === "保留" || status === "成立") {
                    badgeClass = "badge-info";
                    badgeStyle =
                        "color: #111827 !important; background-color: #fff !important; border: 1px solid #e5e7eb !important;";
                }

                statusCellHtml = `<td><span class="badge ${badgeClass}" style="${badgeStyle}">${status}</span></td>`;
            }

            tr.innerHTML = `
                <td>${req.requestId}</td>
                <td>${dateStr}</td>
                <td>${req.customerName || "不明"}</td>
                ${statusCellHtml}
                <td style="text-align:right;">${itemCount} 点</td>
                <td style="text-align:right; font-weight:bold;">¥${totalAmount.toLocaleString()}</td>
            `;

            // クリックイベントはController側で登録するため、行自体にデータを持たせるか、Callbackを呼ぶ設計にする
            // ここではシンプルに、dataset IDを持たせる
            tr.dataset.id = req.requestId;
            this.listBody.appendChild(tr);
        });
    }

    // =========================================
    // 2. 詳細モーダル操作
    // =========================================
    openRequestModal(req, onCalculate, onDeleteItem) {
        this.mReqId.textContent = req.requestId;
        this.mCustName.textContent = req.customerName;
        this.mDate.textContent = formatKaitoriRequestDateTime(req.requestDate);
        
        let status = req.status && req.status.trim() !== "" ? req.status : "未対応";
        this.setupStatusOptions();
        this.mStatusSelect.value = status;
        
        this.mAdminNote.value = req.internalMemo || req.adminNote || "";
        // JS側で動的に追加したCustomerNote要素への対応
        if(this.mCustomerNote) this.mCustomerNote.value = req.customerNote || "";

        this.renderEditableItems(req, onCalculate, onDeleteItem);
        this.updateTotalDisplay(req);
        
        this.reqModal.style.display = "flex";
    }

    closeRequestModal() {
        this.reqModal.style.display = "none";
    }

    setupStatusOptions() {
        this.mStatusSelect.innerHTML = `
            <option value="未対応">未対応</option>
            <option value="査定中">査定中</option>
            <option value="保留">保留</option>
            <option disabled>──────────</option>
            <option value="成立">成立</option>
            <option value="キャンセル">キャンセル</option>
            <option value="キャンセル(返却)">キャンセル/ 返却</option>
            <option value="キャンセル(廃棄)">キャンセル/ 廃棄</option>
        `;
    }

    renderEditableItems(req, onCalculate, onDeleteItem) {
        this.mItemList.innerHTML = "";
        
        // ヘッダー
        const thRow = document.createElement("tr");
        thRow.innerHTML = `
            <th style="text-align:left;">商品名</th>
            <th style="width:80px;">単価</th>
            <th style="width:60px;">数量</th>
            <th style="width:80px;">小計</th>
            <th style="width:40px;"></th>
        `;
        this.mItemList.appendChild(thRow);

        const itemsWithIndex = req.items.map((item, index) => ({ item, index }));
        const hyogoGroup = itemsWithIndex.filter(x => x.item.destination === "兵庫");
        const osakaGroup = itemsWithIndex.filter(x => x.item.destination !== "兵庫");

        // 兵庫グループ描画
        if (hyogoGroup.length > 0) {
            const hRow = document.createElement("tr");
            hRow.innerHTML = `<td colspan="5" style="background:#eef2ff; font-weight:600; color:#4338ca; padding:10px 12px; font-size:0.9rem;">⚓ 兵庫納品分 (${hyogoGroup.length}件)</td>`;
            this.mItemList.appendChild(hRow);
            hyogoGroup.forEach(x => this.mItemList.appendChild(this._createEditableRow(x.item, x.index, onCalculate, onDeleteItem)));
        }

        // 大阪グループ描画
        if (osakaGroup.length > 0) {
            const oRow = document.createElement("tr");
            oRow.innerHTML = `<td colspan="5" style="background:#d9f0f5; font-weight:600; color:#1e4d59; padding:10px 12px; font-size:0.9rem;">🏢 大阪納品分 (${osakaGroup.length}件)</td>`;
            this.mItemList.appendChild(oRow);
            osakaGroup.forEach(x => this.mItemList.appendChild(this._createEditableRow(x.item, x.index, onCalculate, onDeleteItem)));
        }
        
        // 追加ボタン行
        const trAdd = document.createElement("tr");
        trAdd.innerHTML = `
            <td colspan="5" style="text-align:center; padding-top:10px;">
                <button type="button" class="btn-add-item-osaka" style="cursor:pointer; margin-right:10px; background:#d6e7f1; border:1px solid #b0cde5; color:#1e293b; padding:6px 10px; border-radius:8px;">＋ 大阪へ追加</button>
                <button type="button" class="btn-add-item-hyogo" style="cursor:pointer; background:#eef2ff; border:1px solid #6366f1; color:#4338ca; padding:6px 10px; border-radius:8px;">＋ 兵庫へ追加</button>
            </td>`;
        this.mItemList.appendChild(trAdd);
    }

    _createEditableRow(item, index, onCalculate, onDeleteItem) {
        const tr = document.createElement("tr");
        
        const tdName = document.createElement("td");
        const inputName = document.createElement("input");
        inputName.type = "text";
        inputName.value = item.name;
        inputName.style.width = "95%";
        inputName.onchange = (e) => onCalculate(index, "name", e.target.value);
        tdName.appendChild(inputName);

        const tdPrice = document.createElement("td");
        const inputPrice = document.createElement("input");
        inputPrice.type = "number";
        inputPrice.value = item.price;
        inputPrice.style.width = "70px";
        inputPrice.onchange = (e) => onCalculate(index, "price", e.target.value);
        tdPrice.appendChild(inputPrice);

        const tdQty = document.createElement("td");
        const inputQty = document.createElement("input");
        inputQty.type = "number";
        inputQty.value = item.qty;
        inputQty.style.width = "50px";
        inputQty.onchange = (e) => onCalculate(index, "qty", e.target.value);
        tdQty.appendChild(inputQty);

        const tdSub = document.createElement("td");
        tdSub.style.textAlign = "right";
        tdSub.textContent = (item.price * item.qty).toLocaleString();

        const tdDel = document.createElement("td");
        const btnDel = document.createElement("button");
        btnDel.textContent = "×";
        btnDel.style.color = "red";
        btnDel.style.cursor = "pointer";
        btnDel.onclick = () => onDeleteItem(index);
        tdDel.appendChild(btnDel);

        tr.appendChild(tdName);
        tr.appendChild(tdPrice);
        tr.appendChild(tdQty);
        tr.appendChild(tdSub);
        tr.appendChild(tdDel);

        return tr;
    }

    updateTotalDisplay(req) {
        const total = req.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        this.mTotal.textContent = "¥" + total.toLocaleString();
    }

    // =========================================
    // 3. マスタ管理描画
    // =========================================
    renderMasterList(list) {
        this.masterBody.innerHTML = "";
        if(!list || list.length === 0) {
            this.masterBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">該当なし</td></tr>';
            return;
        }

        list.forEach(item => {
            const tr = document.createElement("tr");
            tr.className = "kaitori-master-row";
            tr.innerHTML = `
                <td>${item.id}</td>
                <td>${item.maker}</td>
                <td>${item.name}</td>
                <td>${item.type}</td>
                <td style="text-align:right; font-weight:bold;">¥${item.price.toLocaleString()}</td>
                <td>${item.destination || "大阪"}</td>
                <td class="kaitori-td-center">
                    <button type="button" class="btn-edit-master" data-id="${item.id}">編集</button>
                </td>
            `;
            this.masterBody.appendChild(tr);
        });
    }

    openMasterModal(item = null) {
        document.getElementById("km-modal-title").textContent = item ? "マスタ編集" : "新規追加";
        document.getElementById("km-id").value = item ? item.id : "";
        document.getElementById("km-maker").value = item ? item.maker : "";
        document.getElementById("km-name").value = item ? item.name : "";
        document.getElementById("km-type").value = item ? item.type : this.primaryProductCategoryForBadge;
        document.getElementById("km-price").value = item ? item.price : 0;
        document.getElementById("km-destination").value = item ? item.destination : "大阪";
        const delBtn = document.getElementById("km-btn-delete");
        if (delBtn) delBtn.style.display = item ? "block" : "none";
        this.masterModal.style.display = "flex";
    }

    closeMasterModal() {
        this.masterModal.style.display = "none";
    }
}