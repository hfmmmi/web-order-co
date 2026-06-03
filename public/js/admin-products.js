// public/js/admin-products.js
// 管理画面：商品マスタの管理スクリプト（見積・特価管理は admin-estimates.html）

document.addEventListener("DOMContentLoaded", function () {
    console.log("📦 Product Manager Loaded (Extended Edition)");

    const productListContainer = document.querySelector("#admin-product-list");
    const productListSummary = document.getElementById("admin-product-list-summary");

    const csvFileInput = document.querySelector("#csv-file-input");
    const btnProductsMore = document.getElementById("btn-products-more");
    const productsMoreMenu = document.getElementById("products-more-menu");
    const btnProductUpload = document.getElementById("btn-product-upload");
    const btnProductExportDl = document.getElementById("btn-product-export-dl");
    const btnDeleteSelectedProducts = document.getElementById("btn-delete-selected-products");

    const selectedProductCodes = new Set();

    function setProductsMoreMenuOpen(open) {
        if (!productsMoreMenu) return;
        if (open) {
            productsMoreMenu.classList.add("is-open");
            productsMoreMenu.setAttribute("aria-hidden", "false");
            if (btnProductsMore) btnProductsMore.setAttribute("aria-expanded", "true");
        } else {
            productsMoreMenu.classList.remove("is-open");
            productsMoreMenu.setAttribute("aria-hidden", "true");
            if (btnProductsMore) btnProductsMore.setAttribute("aria-expanded", "false");
        }
    }

    if (btnProductUpload && csvFileInput) {
        btnProductUpload.addEventListener("click", function (e) {
            e.stopPropagation();
            setProductsMoreMenuOpen(false);
            csvFileInput.click();
        });
    }

    if (btnProductExportDl) {
        btnProductExportDl.addEventListener("click", function (e) {
            e.stopPropagation();
            setProductsMoreMenuOpen(false);
            window.location.href = "/api/admin/product-master/export";
        });
    }

    if (btnDeleteSelectedProducts) {
        btnDeleteSelectedProducts.addEventListener("click", async function (e) {
            e.stopPropagation();
            if (selectedProductCodes.size === 0) {
                toastWarning("チェックした商品がありません");
                return;
            }
            const codes = Array.from(selectedProductCodes);
            const preview = codes.slice(0, 8).join("\n");
            const extra = codes.length > 8 ? "\n… ほか " + (codes.length - 8) + " 件" : "";
            const confirmMsg =
                "【重要】チェックした " +
                codes.length +
                " 件の商品をマスタから完全に削除します。\n取り消せません。よろしいですか？\n\n" +
                preview +
                extra;
            if (!confirm(confirmMsg)) return;
            setProductsMoreMenuOpen(false);
            let ok = 0;
            let fail = 0;
            const failed = [];
            btnDeleteSelectedProducts.disabled = true;
            for (let i = 0; i < codes.length; i++) {
                const code = codes[i];
                try {
                    const response = await adminApiFetch("/api/delete-product", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ productCode: code })
                    });
                    const data = await response.json();
                    if (data.success) {
                        ok++;
                        selectedProductCodes.delete(code);
                    } else {
                        fail++;
                        failed.push(code + (data.message ? ": " + data.message : ""));
                    }
                } catch (err) {
                    fail++;
                    failed.push(code);
                    console.error(err);
                }
            }
            btnDeleteSelectedProducts.disabled = false;
            if (ok > 0) {
                toastSuccess(ok + " 件の商品を削除しました", 4000);
                await fetchProductList();
            }
            if (fail > 0) {
                toastError("削除に失敗: " + fail + " 件\n" + failed.slice(0, 5).join("\n"));
            }
        });
    }

    if (btnProductsMore && productsMoreMenu) {
        btnProductsMore.addEventListener("click", function (e) {
            e.stopPropagation();
            setProductsMoreMenuOpen(!productsMoreMenu.classList.contains("is-open"));
        });
    }

    document.addEventListener("click", function () {
        setProductsMoreMenuOpen(false);
    });

    let allProducts = [];
    /** @type {{ id: string, name: string }[]} */
    let rankListMeta = [];

    const PRODUCTS_PAGE_SIZE = 25;
    let lastFilteredProducts = [];
    let productsCurrentPage = 1;

    function escHtml(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    document.addEventListener("admin-ready", function () {
        console.log("🚀 Product Manager: Auth Signal Received. Starting fetch...");

        fetchProductList();
    });

    async function fetchProductList() {
        if (!productListContainer) return;

        productListContainer.innerHTML = "<p style='padding:10px;'>データを読み込んでいます...</p>";
        if (productListSummary) productListSummary.innerHTML = "";

        try {
            const [response, rankRes] = await Promise.all([
                adminApiFetch("/api/admin/products"),
                adminApiFetch("/api/admin/rank-list")
            ]);

            if (response.status === 401) {
                productListContainer.innerHTML = "<p>認証が必要です。</p>";
                return;
            }

            if (!response.ok) throw new Error("データ取得失敗");

            allProducts = await response.json();
            if (rankRes.ok) {
                rankListMeta = await rankRes.json();
            } else {
                rankListMeta = [];
            }

            setupSearchBox();

            renderProductList(allProducts);
        } catch (error) {
            console.error(error);
            productListContainer.innerHTML = "<p class='error'>商品データの読み込みに失敗しました。</p>";
        }
    }

    function setupSearchBox() {
        if (document.getElementById("admin-prod-dynamic-search")) return;

        const searchMount = document.getElementById("admin-product-search-mount");
        if (!searchMount) return;

        const searchIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        searchIcon.setAttribute("class", "admin-product-list-search-icon");
        searchIcon.setAttribute("viewBox", "0 0 24 24");
        searchIcon.setAttribute("width", "16");
        searchIcon.setAttribute("height", "16");
        searchIcon.setAttribute("aria-hidden", "true");
        const searchIconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        searchIconPath.setAttribute("fill", "currentColor");
        searchIconPath.setAttribute(
            "d",
            "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        );
        searchIcon.appendChild(searchIconPath);

        const searchInput = document.createElement("input");
        searchInput.id = "admin-prod-dynamic-search";
        searchInput.type = "text";
        searchInput.className = "admin-product-list-search-field";
        searchInput.placeholder = "";
        searchInput.setAttribute("aria-label", "商品検索");

        searchMount.appendChild(searchIcon);
        searchMount.appendChild(searchInput);

        searchInput.addEventListener("input", function (e) {
            const term = e.target.value.normalize("NFKC").toLowerCase();
            const filtered = allProducts.filter((p) => {
                const rankBits = Object.entries(p.mergedRankPrices || {}).map(
                    ([id, v]) => `${id}${v}`.toLowerCase()
                );
                const searchTarget = [
                    p.productCode,
                    p.name,
                    p.manufacturer,
                    p.category,
                    p.remarks,
                    ...rankBits
                ]
                    .map((val) => (val || "").toString().normalize("NFKC").toLowerCase())
                    .join(" ");

                return searchTarget.includes(term);
            });
            renderProductList(filtered);
        });
    }

    function buildProductPageNumberItems(totalPages, current) {
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

    function buildProductsPaginationNav(totalPages, currentPage) {
        const nav = document.createElement("nav");
        nav.className = "orders-pagination";
        nav.setAttribute("aria-label", "商品リストのページ送り");

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "orders-pagination-btn orders-pagination-prev";
        prevBtn.textContent = "前へ";
        prevBtn.disabled = currentPage <= 1;
        prevBtn.addEventListener("click", function () {
            if (productsCurrentPage <= 1) return;
            productsCurrentPage--;
            renderProductListPage();
        });

        const pagesWrap = document.createElement("div");
        pagesWrap.className = "orders-pagination-pages";

        buildProductPageNumberItems(totalPages, currentPage).forEach(function (entry) {
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
            btn.addEventListener("click", function () {
                productsCurrentPage = p;
                renderProductListPage();
            });
            pagesWrap.appendChild(btn);
        });

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "orders-pagination-btn orders-pagination-next";
        nextBtn.textContent = "次へ";
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.addEventListener("click", function () {
            if (productsCurrentPage >= totalPages) return;
            productsCurrentPage++;
            renderProductListPage();
        });

        nav.appendChild(prevBtn);
        nav.appendChild(pagesWrap);
        nav.appendChild(nextBtn);
        return nav;
    }

    /** 例: メーカー RICOH・カテゴリ「RICOH 純正」→ 表示「純正」 */
    function stripLeadingManufacturerFromCategory(manufacturer, category) {
        if (!category) return "";
        const c = String(category).trim();
        const m = manufacturer ? String(manufacturer).trim() : "";
        if (!m) return c;
        try {
            const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp("^" + escaped + "\\s+", "u");
            const stripped = c.replace(re, "").trim();
            return stripped || c;
        } catch {
            return c;
        }
    }

    function formatMergedRankLine(product) {
        const prices = product.mergedRankPrices || {};
        const keys = Object.keys(prices);
        if (keys.length === 0) return "";
        if (rankListMeta.length) {
            const parts = rankListMeta
                .map((r) => {
                    const v = prices[r.id];
                    if (v == null) return null;
                    return `${escHtml(r.name)}: ¥${Number(v).toLocaleString()}`;
                })
                .filter(Boolean);
            return parts.length ? parts.join(" · ") : "";
        }
        return keys
            .sort()
            .map((id) => `${escHtml(id)}: ¥${Number(prices[id]).toLocaleString()}`)
            .join(" · ");
    }

    function appendProductRow(parent, product) {
        const rankLine = formatMergedRankLine(product);
        const hasRank = rankLine.trim() !== "";

        const wrap = document.createElement("div");
        wrap.className =
            "product-item-admin-wrap" + (product.active === false ? " product-item-admin-wrap--inactive" : "");

        const row = document.createElement("div");
        row.className = "product-item-admin";
        row.style.padding = "8px 10px";
        row.style.boxSizing = "border-box";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "8px 10px";
        row.style.fontSize = "0.875rem";

        const categoryLabel = stripLeadingManufacturerFromCategory(product.manufacturer, product.category);
        const catTag = categoryLabel ? `<span class="badge badge-secondary">${escHtml(categoryLabel)}</span>` : "";
        const statusTag = product.active === false ? "<span style='color:red; font-weight:bold;'>[非表示]</span>" : "";
        const remarksRaw = product.remarks != null ? String(product.remarks).trim() : "";
        const remarksCell =
            remarksRaw !== ""
                ? `<span class="admin-product-col-remarks" title="${escHtml(remarksRaw)}"><span class="admin-product-remarks-label">備考:</span> ${escHtml(
                      remarksRaw
                  )}</span>`
                : `<span class="admin-product-col-remarks"></span>`;

        const rankBtnHtml = hasRank
            ? `<button type="button" class="btn-product-rank-toggle" aria-expanded="false">ランク</button>`
            : "";
        const codeRaw = product.productCode != null ? String(product.productCode) : "";
        const selectCellHtml =
            codeRaw.trim() !== ""
                ? `<label class="admin-product-col-select"><input type="checkbox" class="admin-product-select-cb" data-product-code="${escHtml(
                      codeRaw
                  )}" aria-label="${escHtml(codeRaw)} を選択"></label>`
                : `<span class="admin-product-col-select" aria-hidden="true"></span>`;
        const editHref =
            codeRaw.trim() !== ""
                ? "admin-products-new.html?edit=" + encodeURIComponent(codeRaw)
                : "";
        const codeCellHtml =
            editHref !== ""
                ? `<a href="${editHref}" class="admin-product-col-code admin-product-code-edit-link">${escHtml(
                      codeRaw
                  )}</a>`
                : `<span class="admin-product-col-code">${escHtml(codeRaw)}</span>`;

        row.innerHTML = `
                <div class="admin-product-row-grid">
                    ${selectCellHtml}
                    ${codeCellHtml}
                    <span class="admin-product-col-badge">${catTag}</span>
                    <span class="admin-product-col-name">${statusTag} ${escHtml(product.name)}</span>
                    <span class="admin-product-col-price">定価: ¥${(product.basePrice || 0).toLocaleString()}</span>
                    ${remarksCell}
                </div>
                <div class="admin-product-row-actions">
                    ${rankBtnHtml}
                </div>
            `;

        const selectCb = row.querySelector(".admin-product-select-cb");
        if (selectCb && codeRaw.trim() !== "") {
            if (selectedProductCodes.has(codeRaw)) selectCb.checked = true;
            selectCb.addEventListener("change", function () {
                if (selectCb.checked) selectedProductCodes.add(codeRaw);
                else selectedProductCodes.delete(codeRaw);
            });
            selectCb.addEventListener("click", function (event) {
                event.stopPropagation();
            });
        }

        const rankBtn = row.querySelector(".btn-product-rank-toggle");
        if (rankBtn && hasRank) {
            const panel = document.createElement("div");
            panel.className = "admin-product-rank-panel";
            panel.innerHTML = `<div class="admin-product-rank-panel-inner"><span class="admin-product-rank-label">ランク別:</span> ${rankLine}</div>`;
            rankBtn.addEventListener("click", function (event) {
                event.stopPropagation();
                const open = !wrap.classList.contains("is-rank-open");
                wrap.classList.toggle("is-rank-open", open);
                rankBtn.setAttribute("aria-expanded", open ? "true" : "false");
            });
            wrap.appendChild(row);
            wrap.appendChild(panel);
        } else {
            wrap.appendChild(row);
        }

        parent.appendChild(wrap);
    }

    function renderProductListPage() {
        if (!productListContainer) return;

        const products = lastFilteredProducts;
        productListContainer.innerHTML = "";
        if (productListSummary) productListSummary.innerHTML = "";

        if (products.length === 0) {
            if (productListSummary) {
                productListSummary.innerHTML = "該当：<strong>0</strong> 件";
            }
            productListContainer.innerHTML = "<div style='padding:10px; color:#999;'>一致する商品はありません</div>";
            return;
        }

        const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PAGE_SIZE));
        if (productsCurrentPage > totalPages) productsCurrentPage = totalPages;
        const page = productsCurrentPage;
        const startIdx = (page - 1) * PRODUCTS_PAGE_SIZE;
        const limited = products.slice(startIdx, startIdx + PRODUCTS_PAGE_SIZE);
        const fromN = startIdx + 1;
        const toN = startIdx + limited.length;

        if (productListSummary) {
            if (totalPages > 1) {
                productListSummary.innerHTML = `該当：<strong>${products.length}</strong> 件 · <strong>${fromN}</strong>〜<strong>${toN}</strong> 件を表示`;
            } else {
                productListSummary.innerHTML = `該当：<strong>${products.length}</strong> 件`;
            }
        }

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "admin-product-list-items";
        limited.forEach((product) => appendProductRow(itemsWrap, product));
        productListContainer.appendChild(itemsWrap);

        if (totalPages > 1) {
            productListContainer.appendChild(buildProductsPaginationNav(totalPages, page));
        }
    }

    function renderProductList(products) {
        lastFilteredProducts = products ? [...products] : [];
        productsCurrentPage = 1;
        renderProductListPage();
    }

    if (csvFileInput) {
        csvFileInput.addEventListener("change", function () {
            const file = csvFileInput.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async function (event) {
                try {
                    const base64Data = event.target.result.split(",")[1];
                    if (btnProductUpload) btnProductUpload.disabled = true;
                    if (btnProductsMore) btnProductsMore.disabled = true;

                    const response = await adminApiFetch("/api/upload-product-data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileData: base64Data })
                    });
                    const data = await response.json();

                    if (data.success) {
                        toastSuccess(data.message, 4000);
                        fetchProductList();
                    } else {
                        toastError("取込失敗: " + data.message);
                    }
                } catch (error) {
                    console.error(error);
                    toastError("通信エラーまたはファイル形式エラー");
                } finally {
                    csvFileInput.value = "";
                    if (btnProductUpload) btnProductUpload.disabled = false;
                    if (btnProductsMore) btnProductsMore.disabled = false;
                }
            };
        });
    }

});
