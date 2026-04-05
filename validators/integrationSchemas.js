const { z } = require("zod");

const customerIdSchema = z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/, "顧客IDの形式が不正です")
);

/** 販管 → WEB 顧客パッチ（パスワード不可） */
const integrationCustomerPatchSchema = z
    .object({
        customerId: customerIdSchema,
        customerName: z.preprocess(
            (v) => (v === undefined ? undefined : typeof v === "string" ? v.trim() : v),
            z.string().min(1).max(100).optional()
        ),
        email: z.preprocess(
            (v) => (v === undefined ? undefined : typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        ),
        priceRank: z.preprocess(
            (v) => (v === undefined ? undefined : typeof v === "string" ? v.trim().toUpperCase() : v),
            z.string().max(20).optional()
        ),
        idempotencyKey: z.preprocess(
            (v) => (v === undefined || v === null ? undefined : String(v).trim()),
            z.string().min(1).max(200).optional()
        ),
        syncVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
    })
    .strict()
    .superRefine((data, ctx) => {
        if (
            data.customerName === undefined &&
            data.email === undefined &&
            data.priceRank === undefined
        ) {
            ctx.addIssue({
                code: "custom",
                message: "customerName / email / priceRank のいずれかを指定してください",
                path: ["customerName"]
            });
        }
    });

module.exports = {
    integrationCustomerPatchSchema
};
