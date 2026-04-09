const ExcelJS = require("exceljs");
const { readToRowArrays, normalizeExcelCellValue } = require("../../utils/excelReader");

describe("excelReader リッチテキスト・数式 result", () => {
    test("normalizeExcelCellValue は richText を連結する", () => {
        const v = {
            richText: [
                { text: "ランク" },
                { text: "A" }
            ]
        };
        expect(normalizeExcelCellValue(v)).toBe("ランクA");
    });

    test("normalizeExcelCellValue は formula の result を展開する", () => {
        expect(normalizeExcelCellValue({ formula: "1+1", result: 2 })).toBe(2);
    });

    test("write→read でリッチテキストヘッダーがプレーン文字列になる", async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("upload");
        ws.getCell("A1").value = "商品コード";
        ws.getCell("B1").value = "商品名";
        ws.getCell("C1").value = {
            richText: [{ font: { name: "Arial" }, text: "ランク" }, { font: { name: "Arial" }, text: "A" }]
        };
        ws.getCell("A2").value = "X1";
        ws.getCell("B2").value = "テスト";
        ws.getCell("C2").value = 100;
        const buf = await wb.xlsx.writeBuffer();
        const rows = await readToRowArrays(Buffer.from(buf), { sheetName: "Upload" });
        expect(rows[0][2]).toBe("ランクA");
        expect(rows[1][2]).toBe(100);
    });
});
