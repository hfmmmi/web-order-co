/**
 * utils/excelReader.js のユニットテスト（正常・空・壊れ境界）
 * npm run test:api / test:all で実行
 */
const {
    readToRowArrays,
    readToObjects,
    excelSerialToDateString,
    cellToDateString,
    ExcelJS
} = require("../../utils/excelReader");

describe("Aランク: excelReader ユニット", () => {
    jest.setTimeout(30000);

    test("readToRowArrays は正常なバッファを行配列で返す", async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Sheet1");
        ws.getCell("A1").value = "A";
        ws.getCell("B1").value = "B";
        ws.getCell("A2").value = 1;
        ws.getCell("B2").value = 2;
        const buffer = await wb.xlsx.writeBuffer();
        const rows = await readToRowArrays(buffer);
        expect(Array.isArray(rows)).toBe(true);
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(rows[0]).toEqual(["A", "B"]);
        expect(rows[1]).toEqual([1, 2]);
    });

    test("readToObjects は先頭行をキーにしたオブジェクト配列を返す", async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Sheet1");
        ws.getCell("A1").value = "code";
        ws.getCell("B1").value = "name";
        ws.getCell("A2").value = "P001";
        ws.getCell("B2").value = "商品A";
        const buffer = await wb.xlsx.writeBuffer();
        const objs = await readToObjects(buffer);
        expect(Array.isArray(objs)).toBe(true);
        expect(objs.length).toBe(1);
        expect(objs[0].code).toBe("P001");
        expect(objs[0].name).toBe("商品A");
    });

    test("readToRowArrays は空ブックで空配列を返す", async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet("Sheet1");
        const buffer = await wb.xlsx.writeBuffer();
        const rows = await readToRowArrays(buffer);
        expect(Array.isArray(rows)).toBe(true);
        expect(rows.length).toBe(0);
    });

    test("readToObjects は1行以下で空配列を返す", async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Sheet1");
        ws.getCell("A1").value = "only";
        const buffer = await wb.xlsx.writeBuffer();
        const objs = await readToObjects(buffer);
        expect(Array.isArray(objs)).toBe(true);
        expect(objs.length).toBe(0);
    });

    test("excelSerialToDateString は 25569 で 1970-01-01", () => {
        expect(excelSerialToDateString(25569)).toBe("1970-01-01");
    });

    test("excelSerialToDateString は非数で null", () => {
        expect(excelSerialToDateString(NaN)).toBeNull();
        expect(excelSerialToDateString("x")).toBeNull();
    });

    test("cellToDateString は Date を YYYY-MM-DD に", () => {
        expect(cellToDateString(new Date("2025-02-17T00:00:00Z"))).toBe("2025-02-17");
    });

    test("cellToDateString は数値で Excel シリアルとして解釈", () => {
        expect(cellToDateString(25569)).toBe("1970-01-01");
    });

    test("cellToDateString は Date/数値以外で null を返す", () => {
        expect(cellToDateString("2025-01-01")).toBeNull();
        expect(cellToDateString(null)).toBeNull();
        expect(cellToDateString(undefined)).toBeNull();
    });

    test("壊れたバッファで readToRowArrays は例外", async () => {
        await expect(readToRowArrays(Buffer.from("not excel"))).rejects.toThrow();
    });
});
