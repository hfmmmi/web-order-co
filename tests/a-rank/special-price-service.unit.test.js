"use strict";

const fs = require("fs").promises;
const specialPriceService = require("../../services/specialPriceService");
const { dbPath } = require("../../dbPaths");

const EST = dbPath("estimates.json");

describe("specialPriceService 分岐", () => {
    let orig;

    beforeAll(async () => {
        orig = await fs.readFile(EST, "utf-8").catch(() => "[]");
    });

    afterAll(async () => {
        await fs.writeFile(EST, orig, "utf-8");
    });

    test("getSpecialPrices は先頭ゼロ正規化でマッチ", async () => {
        await fs.writeFile(
            EST,
            JSON.stringify(
                [{ estimateId: "00012", customerId: "C1", productCode: "P", unitPrice: 1, validUntil: null }],
                null,
                2
            ),
            "utf-8"
        );
        const r = await specialPriceService.getSpecialPrices("12", "C1");
        expect(r.length).toBe(1);
    });

    test("getSpecialPrices は他人の見積は空配列", async () => {
        await fs.writeFile(
            EST,
            JSON.stringify([{ estimateId: "X1", customerId: "OTHER", productCode: "P", unitPrice: 1 }], null, 2),
            "utf-8"
        );
        const r = await specialPriceService.getSpecialPrices("X1", "ME");
        expect(r).toEqual([]);
    });

    test("getSpecialPrices は期限切れを除外", async () => {
        const past = new Date(Date.now() - 86400000 * 5).toISOString().split("T")[0];
        await fs.writeFile(
            EST,
            JSON.stringify([{ estimateId: "E2", customerId: "C1", productCode: "P", unitPrice: 1, validUntil: past }], null, 2),
            "utf-8"
        );
        const r = await specialPriceService.getSpecialPrices("E2", "C1");
        expect(r.length).toBe(0);
    });

    test("getSpecialPrices は同一見積でも customerId 不一致行を除外", async () => {
        await fs.writeFile(
            EST,
            JSON.stringify(
                [
                    { estimateId: "E3", customerId: "C1", productCode: "A", unitPrice: 1 },
                    { estimateId: "E3", customerId: "C2", productCode: "B", unitPrice: 2 }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const r = await specialPriceService.getSpecialPrices("E3", "C1");
        expect(r.length).toBe(1);
        expect(r[0].productCode).toBe("A");
    });

    test("deleteEstimatesByManufacturer は部分一致で削除", async () => {
        await fs.writeFile(
            EST,
            JSON.stringify(
                [
                    { estimateId: "D1", customerId: "C", productCode: "P1", productName: "abc MakerX def" },
                    { estimateId: "D2", customerId: "C", productCode: "P2", productName: "keep" }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const { deletedCount } = await specialPriceService.deleteEstimatesByManufacturer("makerx");
        expect(deletedCount).toBe(1);
    });

    test("deleteEstimatesByProductCodes はコード一致で削除", async () => {
        await fs.writeFile(
            EST,
            JSON.stringify(
                [
                    { estimateId: "Z1", customerId: "C", productCode: "DEL1" },
                    { estimateId: "Z2", customerId: "C", productCode: "KEEP" }
                ],
                null,
                2
            ),
            "utf-8"
        );
        const { deletedCount } = await specialPriceService.deleteEstimatesByProductCodes(["DEL1"]);
        expect(deletedCount).toBe(1);
    });
});
