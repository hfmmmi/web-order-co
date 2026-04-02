"use strict";

jest.mock("../../utils/excelReader", () => {
    const actual = jest.requireActual("../../utils/excelReader");
    return { ...actual, readToRowArrays: jest.fn() };
});

const fs = require("fs").promises;
const { readToRowArrays } = require("../../utils/excelReader");
const settingsService = require("../../services/settingsService");
const csvService = require("../../services/csvService");
const { dbPath } = require("../../dbPaths");

const SETTINGS_PATH = dbPath("settings.json");

function csvLine(headers, row) {
    return `${headers}\n${row}\n`;
}

describe("branch-coverage-targeted-p3: settingsService", () => {
    let origSettings;

    beforeEach(async () => {
        origSettings = await fs.readFile(SETTINGS_PATH, "utf-8");
    });

    afterEach(async () => {
        await fs.writeFile(SETTINGS_PATH, origSettings, "utf-8");
        settingsService.invalidateSettingsCache();
    });

    test("updateSettings: cartShippingNotice 非文字は空文字", async () => {
        await settingsService.updateSettings({ cartShippingNotice: 123 });
        const s = JSON.parse(await fs.readFile(SETTINGS_PATH, "utf-8"));
        expect(s.cartShippingNotice).toBe("");
    });

    test("updateSettings: shippingRules オブジェクト差し替え", async () => {
        await settingsService.updateSettings({ shippingRules: { default: "送料A" } });
        const s = JSON.parse(await fs.readFile(SETTINGS_PATH, "utf-8"));
        expect(s.shippingRules.default).toBe("送料A");
    });

    test("updateSettings: announcements 配列は丸ごと置換", async () => {
        await settingsService.updateSettings({ announcements: [{ id: "1", text: "a" }] });
        const s = JSON.parse(await fs.readFile(SETTINGS_PATH, "utf-8"));
        expect(s.announcements).toEqual([{ id: "1", text: "a" }]);
    });

    test("updateSettings: smtp password 空はマージから除外", async () => {
        const before = JSON.parse(origSettings);
        const had = before.mail && before.mail.smtp && before.mail.smtp.password;
        await settingsService.updateSettings({ mail: { smtp: { password: "" } } });
        const after = JSON.parse(await fs.readFile(SETTINGS_PATH, "utf-8"));
        expect(after.mail.smtp.password).toBe(had);
    });

    test("getPriceListFormatConfig: 空の priceListCategories でも sortOrder 既定", async () => {
        await settingsService.updateSettings({ dataFormats: { priceListCategories: {} } });
        settingsService.invalidateSettingsCache();
        const c = await settingsService.getPriceListFormatConfig();
        expect(c.manufacturerSplitCategory).toBeTruthy();
        expect(c.csvHeaderLine).toContain("\n");
    });

    test("getLogisticsCsvImportConfig: memoFields 空配列は既定へ", async () => {
        await settingsService.updateSettings({
            dataFormats: { logisticsCsvImport: { memoFields: [] } }
        });
        settingsService.invalidateSettingsCache();
        const c = await settingsService.getLogisticsCsvImportConfig();
        expect(Array.isArray(c.memoFields)).toBe(true);
        expect(c.memoFields.length).toBeGreaterThan(0);
    });

    test("getLogisticsCsvImportConfig: publicIdPattern 空は既定", async () => {
        await settingsService.updateSettings({
            dataFormats: { logisticsCsvImport: { publicIdPattern: "   " } }
        });
        settingsService.invalidateSettingsCache();
        const c = await settingsService.getLogisticsCsvImportConfig();
        expect(String(c.publicIdPattern || "").length).toBeGreaterThan(0);
    });

    test("getPublicBranding: 未設定キーは deepMerge 既定", async () => {
        const b = await settingsService.getPublicBranding();
        expect(b).toBeTruthy();
        expect(typeof b).toBe("object");
    });

    test("getOrderCsvExportSpec: 解決結果に columns 相当", async () => {
        const spec = await settingsService.getOrderCsvExportSpec();
        expect(spec).toBeTruthy();
    });

    test("getLogisticsFixedColumnImportConfig: マージ", async () => {
        const c = await settingsService.getLogisticsFixedColumnImportConfig();
        expect(typeof c.orderId).toBe("number");
    });
});

describe("branch-coverage-targeted-p3: csvService.parseEstimatesData CSV", () => {
    test("必須列のみ 得意先コード+商品コード+単価", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価", "TEST001,P001,500"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r.length).toBe(1);
        expect(r[0].unitPrice).toBe(500);
    });

    test("見積番号 列", async () => {
        const buf = Buffer.from(
            csvLine("見積番号,得意先コード,商品コード,単価", "E1,TEST001,P001,1"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].estimateId).toBe("E1");
    });

    test("見積No 列", async () => {
        const buf = Buffer.from(
            csvLine("見積No,得意先コード,商品コード,単価", "N1,TEST001,P001,2"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].estimateId).toBe("N1");
    });

    test("EstimateNo 列", async () => {
        const buf = Buffer.from(
            csvLine("EstimateNo,得意先コード,商品コード,単価", "EN,TEST001,P001,3"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].estimateId).toBe("EN");
    });

    test("見積ID 列", async () => {
        const buf = Buffer.from(
            csvLine("見積ID,得意先コード,商品コード,単価", "ID,TEST001,P001,4"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].estimateId).toBe("ID");
    });

    test("得意先CD 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先CD,商品コード,単価", "TEST002,P001,5"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].customerId).toBe("TEST002");
    });

    test("CustomerCode 列", async () => {
        const buf = Buffer.from(
            csvLine("CustomerCode,商品コード,単価", "TEST001,P001,6"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].customerId).toBe("TEST001");
    });

    test("顧客コード 列", async () => {
        const buf = Buffer.from(
            csvLine("顧客コード,商品コード,単価", "TEST001,P001,7"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].customerId).toBe("TEST001");
    });

    test("商品CD 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品CD,単価", "TEST001,P002,8"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productCode).toBe("P002");
    });

    test("品番 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,品番,単価", "TEST001,P001,9"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productCode).toBe("P001");
    });

    test("決定単価 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,決定単価", "TEST001,P001,10"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].price).toBe(10);
    });

    test("特価 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,特価", "TEST001,P001,11"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].unitPrice).toBe(11);
    });

    test("売価 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,売価", "TEST001,P001,12"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].unitPrice).toBe(12);
    });

    test("商品名 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,商品名", "TEST001,P001,13,名前"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productName).toBe("名前");
    });

    test("名称 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,名称", "TEST001,P001,14,名2"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].productName).toBe("名2");
    });

    test("有効期限 列 + cellToDateString フォールバック文字列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,有効期限", "TEST001,P001,15,2026-01-15"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].validUntil).toBeTruthy();
    });

    test("期限 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,期限", "TEST001,P001,16,2026/02/01"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].validUntil).toBeTruthy();
    });

    test("納期 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,納期", "TEST001,P001,17,2026-03-10"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].validUntil).toBeTruthy();
    });

    test("メーカー 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,メーカー", "TEST001,P001,18,Canon"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].manufacturer).toBe("Canon");
    });

    test("メーカ 列（別名）", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,メーカ", "TEST001,P001,19,Epson"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].manufacturer).toBe("Epson");
    });

    test("Manufacturer 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,Manufacturer", "TEST001,P001,20,HP"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].manufacturer).toBe("HP");
    });

    test("ブランド 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,ブランド", "TEST001,P001,21,B"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].manufacturer).toBe("B");
    });

    test("件名 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,件名", "TEST001,P001,22,件"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].subject).toBe("件");
    });

    test("Subject 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,Subject", "TEST001,P001,23,Sj"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].subject).toBe("Sj");
    });

    test("物件名 列", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価,物件名", "TEST001,P001,24,ビル"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].subject).toBe("ビル");
    });

    test("金額 列エイリアス", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,金額", "TEST001,P001,1234"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r[0].unitPrice).toBe(1234);
    });

    test("行が短すぎるはスキップ", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価\nTEST001\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r.length).toBe(0);
    });

    test("顧客コード 0000 はスキップ", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価", "0000,P001,1"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r.length).toBe(0);
    });

    test("顧客コード FREE はスキップ", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価", "FREE,P001,1"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r.length).toBe(0);
    });

    test("単価 NaN 行はスキップ", async () => {
        const buf = Buffer.from(
            csvLine("得意先コード,商品コード,単価", "TEST001,P001,abc"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r.length).toBe(0);
    });

    test("1行のみは []", async () => {
        const buf = Buffer.from("得意先コード,商品コード,単価\n", "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r).toEqual([]);
    });

    test("必須列不足は []", async () => {
        const buf = Buffer.from(csvLine("foo,bar", "1,2"), "utf-8");
        const r = await csvService.parseEstimatesData(buf, "e.csv");
        expect(r).toEqual([]);
    });

    test("estimateImportAliasesOverride で追加別名", async () => {
        const buf = Buffer.from(
            csvLine("見積カスタム,得意先コード,商品コード,単価", "CUST,TEST001,P001,30"),
            "utf-8"
        );
        const r = await csvService.parseEstimatesData(buf, "e.csv", {
            estimateId: ["見積カスタム"]
        });
        expect(r[0].estimateId).toBe("CUST");
    });
});

describe("branch-coverage-targeted-p3: parseEstimatesData Excel", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("xlsx 拡張子で readToRowArrays 成功", async () => {
        readToRowArrays.mockResolvedValue([
            ["得意先コード", "商品コード", "単価"],
            ["TEST001", "P001", "40"]
        ]);
        const buf = Buffer.from([1, 2]);
        const r = await csvService.parseEstimatesData(buf, "z.xlsx");
        expect(r.length).toBe(1);
        expect(r[0].unitPrice).toBe(40);
    });

    test("Excel 読込例外は []", async () => {
        readToRowArrays.mockRejectedValue(new Error("bad"));
        const buf = Buffer.from([0x50, 0x4b]);
        const r = await csvService.parseEstimatesData(buf, "bad.xlsx");
        expect(r).toEqual([]);
    });

    test("Excel 1行のみは []", async () => {
        readToRowArrays.mockResolvedValue([["a"]]);
        const buf = Buffer.from([0x50, 0x4b]);
        const r = await csvService.parseEstimatesData(buf, "one.xlsx");
        expect(r).toEqual([]);
    });
});

describe("branch-coverage-targeted-p3: parseExternalOrdersCsv", () => {
    test("伝票まとめ番号 ヘッダ", () => {
        const csv =
            "伝票まとめ番号,得意先コード,得意先名,商品コード,商品名,単価,数量,受注日\n" +
            "OID1,C1,顧客,PC1,品,100,2,2026-01-01\n";
        const r = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(r.length).toBe(1);
        expect(r[0].orderId).toBe("OID1");
    });

    test("数量0は明細追加されず除外", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "OID2,C1,N,PC1,P1,10,0,2026-01-01\n";
        const r = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(r.length).toBe(0);
    });

    test("商品コード空は明細スキップ", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "OID3,C1,N,,P1,10,1,2026-01-01\n";
        const r = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(r.length).toBe(0);
    });

    test("受注日空は ISO フォールバック", () => {
        const csv =
            "orderId,customerId,customerName,productCode,productName,price,quantity,orderDate\n" +
            "OID4,C1,N,PC1,P1,10,1,\n";
        const r = csvService.parseExternalOrdersCsv(Buffer.from(csv, "utf-8"));
        expect(r[0].orderDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe("branch-coverage-targeted-p3: parseShippingCsv", () => {
    test("ヘッダ動的キーでレコード化", () => {
        const csv = "社内メモ,送り状番号\nOID1,12345\n";
        const r = csvService.parseShippingCsv(Buffer.from(csv, "utf-8"));
        expect(r[0]["社内メモ"]).toBe("OID1");
        expect(r[0]["送り状番号"]).toBe("12345");
    });
});

describe("branch-coverage-targeted-p3: importFlamData", () => {
    const idx8 = {
        orderId: 0,
        orderDate: 1,
        customerId: 2,
        customerName: 3,
        productCode: 4,
        productName: 5,
        unitPrice: 6,
        quantity: 7
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("日付セルが空なら当日付フォーマット", async () => {
        readToRowArrays.mockResolvedValue([
            ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"],
            ["OIDX", "", "C1", "顧客", "P1", "商品", "100", "1"]
        ]);
        const r = await csvService.importFlamData(Buffer.from([1]), idx8);
        expect(r.length).toBe(1);
        expect(r[0].orderDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("cellToDateString 失敗時はスラッシュ置換", async () => {
        readToRowArrays.mockResolvedValue([
            ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"],
            ["OIDY", "2026/04/02", "C1", "顧客", "P1", "商品", "50", "1"]
        ]);
        const r = await csvService.importFlamData(Buffer.from([1]), idx8);
        expect(r[0].orderDate).toBe("2026-04-02");
    });

    test("indicesOverride で列ずらし", async () => {
        readToRowArrays.mockResolvedValue([
            ["a", "b", "c", "d", "e", "f", "g", "h"],
            ["OIDZ", "2026-01-01", "C2", "名", "PX", "名X", "200", "2"]
        ]);
        const r = await csvService.importFlamData(Buffer.from([1]), idx8);
        expect(r[0].customerId).toBe("C2");
        expect(r[0].items[0].quantity).toBe(2);
    });
});
