"use strict";

const {
    getActorNameFromSession,
    applyAuditOnCreate,
    applyAuditOnUpdate,
    pickAuditFields
} = require("../../utils/auditMeta");

describe("auditMeta", () => {
    test("getActorNameFromSession は管理者名を優先する", () => {
        expect(
            getActorNameFromSession({ isAdmin: true, adminName: "平林　みなと", adminId: "admin" })
        ).toBe("平林　みなと");
    });

    test("getActorNameFromSession は担当者名を返す", () => {
        expect(
            getActorNameFromSession({
                customerUserId: "u1",
                contactName: "担当 太郎",
                customerName: "株式会社テスト"
            })
        ).toBe("担当 太郎");
    });

    test("applyAuditOnCreate / applyAuditOnUpdate が監査フィールドを設定する", () => {
        const row = { id: "A" };
        applyAuditOnCreate(row, "登録者A");
        expect(row.createdBy).toBe("登録者A");
        expect(row.updatedBy).toBe("登録者A");
        expect(row.createdAt).toEqual(expect.any(String));
        expect(row.updatedAt).toEqual(expect.any(String));

        const beforeUpdatedBy = row.updatedBy;
        applyAuditOnUpdate(row, "更新者B");
        expect(row.createdBy).toBe("登録者A");
        expect(row.updatedBy).toBe("更新者B");
        expect(row.updatedBy).not.toBe(beforeUpdatedBy);
        expect(row.updatedAt).toEqual(expect.any(String));
    });

    test("pickAuditFields は監査フィールドのみ返す", () => {
        expect(
            pickAuditFields({
                customerId: "C1",
                createdBy: "A",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedBy: "B",
                updatedAt: "2026-01-02T00:00:00.000Z"
            })
        ).toEqual({
            createdBy: "A",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedBy: "B",
            updatedAt: "2026-01-02T00:00:00.000Z"
        });
    });
});
