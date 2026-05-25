"use strict";

const {
    formatPrefixedSequentialId,
    buildPrefixedDisplayIdMap,
    nextPrefixedSequentialId
} = require("../utils/sequentialPrefixedId");

describe("sequentialPrefixedId", () => {
    test("formatPrefixedSequentialId は PREFIX-0001 形式", () => {
        expect(formatPrefixedSequentialId("SP", 1)).toBe("SP-0001");
        expect(formatPrefixedSequentialId("ks", 12)).toBe("KS-0012");
    });

    test("申請日が古い順に連番を割り当て", () => {
        const records = [
            { ticketId: "legacy-b", timestamp: "2026-02-01T00:00:00.000Z" },
            { ticketId: "legacy-a", timestamp: "2026-01-01T00:00:00.000Z" }
        ];
        const map = buildPrefixedDisplayIdMap(records, {
            prefix: "SP",
            dateField: "timestamp",
            idField: "ticketId"
        });
        expect(map["legacy-a"]).toBe("SP-0001");
        expect(map["legacy-b"]).toBe("SP-0002");
    });

    test("nextPrefixedSequentialId は既存件数の次番号", () => {
        const records = [{ ticketId: "SP-0003", timestamp: "2026-01-01" }];
        expect(nextPrefixedSequentialId(records, { prefix: "KS", dateField: "timestamp", idField: "ticketId" })).toBe(
            "KS-0002"
        );
    });
});
