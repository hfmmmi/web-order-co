/**
 * システム設定「データ形式」タブの読み書き（admin-settings.html）
 */
(function () {
    function dfCommaToArray(str) {
        return String(str || "")
            .split(/[,、]/)
            .map((x) => x.trim())
            .filter(Boolean);
    }

    function loadDataFormatsTab(dataFormats) {
        const df = dataFormats || {};
        const pb = df.publicBranding || {};
        const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v != null ? String(v) : "";
        };
        setVal("df-pb-company", pb.companyName);
        setVal("df-pb-logo", pb.logoText);
        setVal("df-pb-zip", pb.zip);
        setVal("df-pb-address", pb.address);
        setVal("df-pb-tel", pb.tel);
        setVal("df-pb-fax", pb.fax);
        setVal("df-pb-contact", pb.estimateContactLabel);
        setVal("df-pb-subject", pb.estimateSubjectLine);
        setVal("df-pb-payment", pb.estimatePaymentTerms);
        setVal("df-pb-valid", pb.estimateValidPeriod);
        setVal("df-pb-footer", pb.estimateFooterNotes);

        const plc = df.priceListCategories || {};
        setVal("df-pl-sort", Array.isArray(plc.sortOrder) ? plc.sortOrder.join(",") : "");
        setVal("df-pl-split", plc.manufacturerSplitCategory);
        setVal("df-pl-sortsheet", plc.sheetManufacturerSortCategory);
        const sn = plc.sheetNamesByCategory;
        setVal(
            "df-pl-sheetnames",
            sn && typeof sn === "object" && !Array.isArray(sn) && Object.keys(sn).length
                ? JSON.stringify(sn, null, 2)
                : ""
        );

        const plcCsv = df.priceListCsv || {};
        setVal("df-pl-csv-h", plcCsv.headerLine);
        setVal("df-pl-strip", plcCsv.productNameStripFromDisplay);

        const pex = df.priceListExcel || {};
        setVal("df-pl-xlsx-h", Array.isArray(pex.headerRow) ? pex.headerRow.join(",") : "");

        const oce = df.orderCsvExport || {};
        setVal("df-order-csv-h", oce.headerLine && String(oce.headerLine).trim() ? oce.headerLine : "");
        setVal(
            "df-order-csv-keys",
            Array.isArray(oce.columnKeys) && oce.columnKeys.length ? JSON.stringify(oce.columnKeys, null, 2) : ""
        );

        const li = df.logisticsCsvImport || {};
        setVal("df-li-memo", Array.isArray(li.memoFields) ? li.memoFields.join(",") : "");
        setVal("df-li-pattern", li.publicIdPattern);
        setVal("df-li-ordno", Array.isArray(li.orderNumber) ? li.orderNumber.join(",") : "");
        setVal("df-li-cust", Array.isArray(li.customerName) ? li.customerName.join(",") : "");
        setVal("df-li-total", Array.isArray(li.orderTotal) ? li.orderTotal.join(",") : "");
        setVal("df-li-odate", Array.isArray(li.orderDate) ? li.orderDate.join(",") : "");
        setVal("df-li-ddate", Array.isArray(li.deliveryDate) ? li.deliveryDate.join(",") : "");
        setVal("df-li-src", li.importSourceLabel);

        const est = df.estimateImportAliases || {};
        setVal(
            "df-est-aliases",
            est && typeof est === "object" && !Array.isArray(est) && Object.keys(est).length
                ? JSON.stringify(est, null, 2)
                : ""
        );

        const fix = df.logisticsFixedColumnImport || {};
        setVal(
            "df-fixed-cols",
            fix && typeof fix === "object" && !Array.isArray(fix) && Object.keys(fix).length
                ? JSON.stringify(fix, null, 2)
                : ""
        );
    }

    function collectDataFormats() {
        let sheetNamesByCategory = {};
        const snRaw = document.getElementById("df-pl-sheetnames")?.value.trim();
        if (snRaw) {
            try {
                sheetNamesByCategory = JSON.parse(snRaw);
            } catch (e) {
                sheetNamesByCategory = {};
            }
        }
        if (
            typeof sheetNamesByCategory !== "object" ||
            sheetNamesByCategory === null ||
            Array.isArray(sheetNamesByCategory)
        ) {
            sheetNamesByCategory = {};
        }

        let columnKeys = null;
        const keysRaw = document.getElementById("df-order-csv-keys")?.value.trim();
        if (keysRaw) {
            try {
                const parsed = JSON.parse(keysRaw);
                if (Array.isArray(parsed)) {
                    columnKeys = parsed.map((k) => String(k || "").trim() || "empty");
                }
            } catch (e) {
                columnKeys = null;
            }
        }

        const headerRaw = document.getElementById("df-order-csv-h")?.value.trim() || "";

        let estimateImportAliases = {};
        const estRaw = document.getElementById("df-est-aliases")?.value.trim();
        if (estRaw) {
            try {
                estimateImportAliases = JSON.parse(estRaw);
            } catch (e) {
                estimateImportAliases = {};
            }
        }
        if (
            typeof estimateImportAliases !== "object" ||
            estimateImportAliases === null ||
            Array.isArray(estimateImportAliases)
        ) {
            estimateImportAliases = {};
        }

        let logisticsFixedColumnImport = null;
        const fixRaw = document.getElementById("df-fixed-cols")?.value.trim();
        if (fixRaw) {
            try {
                logisticsFixedColumnImport = JSON.parse(fixRaw);
            } catch (e) {
                logisticsFixedColumnImport = null;
            }
        }

        const excelRaw = document.getElementById("df-pl-xlsx-h")?.value.trim();
        const excelHeaderRow = excelRaw ? dfCommaToArray(excelRaw) : null;

        const out = {
            publicBranding: {
                companyName: document.getElementById("df-pb-company")?.value.trim() || "",
                zip: document.getElementById("df-pb-zip")?.value.trim() || "",
                address: document.getElementById("df-pb-address")?.value.trim() || "",
                tel: document.getElementById("df-pb-tel")?.value.trim() || "",
                fax: document.getElementById("df-pb-fax")?.value.trim() || "",
                logoText: document.getElementById("df-pb-logo")?.value.trim() || "",
                estimateContactLabel: document.getElementById("df-pb-contact")?.value.trim() || "",
                estimateSubjectLine: document.getElementById("df-pb-subject")?.value.trim() || "",
                estimatePaymentTerms: document.getElementById("df-pb-payment")?.value.trim() || "",
                estimateValidPeriod: document.getElementById("df-pb-valid")?.value.trim() || "",
                estimateFooterNotes: document.getElementById("df-pb-footer")?.value || ""
            },
            priceListCategories: {
                sortOrder: dfCommaToArray(document.getElementById("df-pl-sort")?.value),
                manufacturerSplitCategory: document.getElementById("df-pl-split")?.value.trim() || "",
                sheetManufacturerSortCategory: document.getElementById("df-pl-sortsheet")?.value.trim() || "",
                sheetNamesByCategory
            },
            priceListCsv: {
                headerLine: document.getElementById("df-pl-csv-h")?.value.trim() || "",
                productNameStripFromDisplay: document.getElementById("df-pl-strip")?.value.trim() || ""
            },
            priceListExcel: excelHeaderRow && excelHeaderRow.length ? { headerRow: excelHeaderRow } : {},
            orderCsvExport: {
                headerLine: headerRaw ? headerRaw : null,
                columnKeys
            },
            logisticsCsvImport: {
                memoFields: dfCommaToArray(document.getElementById("df-li-memo")?.value),
                publicIdPattern: document.getElementById("df-li-pattern")?.value.trim() || "",
                orderNumber: dfCommaToArray(document.getElementById("df-li-ordno")?.value),
                customerName: dfCommaToArray(document.getElementById("df-li-cust")?.value),
                orderTotal: dfCommaToArray(document.getElementById("df-li-total")?.value),
                orderDate: dfCommaToArray(document.getElementById("df-li-odate")?.value),
                deliveryDate: dfCommaToArray(document.getElementById("df-li-ddate")?.value),
                importSourceLabel: document.getElementById("df-li-src")?.value.trim() || ""
            },
            estimateImportAliases
        };
        if (
            logisticsFixedColumnImport &&
            typeof logisticsFixedColumnImport === "object" &&
            !Array.isArray(logisticsFixedColumnImport)
        ) {
            out.logisticsFixedColumnImport = logisticsFixedColumnImport;
        }
        return out;
    }

    window.AdminSettingsDataFormats = {
        dfCommaToArray,
        loadDataFormatsTab,
        collectDataFormats
    };
})();
