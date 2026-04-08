// validators/requestSchemas.js
// 役割: 主要APIのリクエストスキーマを定義する
const { z } = require("zod");

const trimmedString = (min, max) =>
    z.preprocess(
        (v) => (typeof v === "string" ? v.trim() : v),
        z.string().min(min).max(max)
    );

const optionalTrimmedString = (max) =>
    z.preprocess(
        (v) => (v === undefined || v === null ? undefined : (typeof v === "string" ? v.trim() : v)),
        z.string().max(max).optional()
    );

const customerIdSchema = z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/, "顧客IDの形式が不正です")
);

const loginSchema = z
    .object({
        id: trimmedString(1, 100),
        pass: z.string().min(1).max(200),
        captchaToken: optionalTrimmedString(4000)
    })
    .strict();

const cartItemSchema = z
    .object({
        code: optionalTrimmedString(120),
        productCode: optionalTrimmedString(120),
        id: optionalTrimmedString(120),
        name: optionalTrimmedString(300),
        price: z.coerce.number().min(0).max(999999999).optional(),
        quantity: z.coerce.number().int().min(1).max(9999)
    })
    .strict()
    .superRefine((val, ctx) => {
        const hasCode = [val.code, val.productCode, val.id].some((x) => typeof x === "string" && x.length > 0);
        if (!hasCode) {
            ctx.addIssue({
                code: "custom",
                message: "商品コード(code/productCode/id)が必要です",
                path: ["code"]
            });
        }
    });

const shipperSchema = z
    .object({
        zip: optionalTrimmedString(20),
        address: optionalTrimmedString(300),
        name: optionalTrimmedString(100),
        tel: optionalTrimmedString(30)
    })
    .strict();

const deliveryInfoSchema = z
    .object({
        date: optionalTrimmedString(50),
        zip: optionalTrimmedString(20),
        tel: optionalTrimmedString(30),
        address: optionalTrimmedString(300),
        name: optionalTrimmedString(100),
        note: optionalTrimmedString(1000),
        clientOrderNumber: optionalTrimmedString(100),
        shipper: shipperSchema.optional()
    })
    .strict();

const placeOrderSchema = z
    .object({
        cart: z.array(cartItemSchema).min(1),
        deliveryInfo: deliveryInfoSchema
    })
    .strict();

/** 管理画面からの手動受注作成（顧客を明示） */
const adminCreateOrderSchema = z
    .object({
        customerId: customerIdSchema,
        cart: z.array(cartItemSchema).min(1),
        deliveryInfo: deliveryInfoSchema
    })
    .strict();

const addCustomerSchema = z
    .object({
        customerId: customerIdSchema,
        customerName: trimmedString(1, 100),
        password: z.string().min(1).max(200),
        priceRank: z.preprocess(
            (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
            z.string().max(20).optional()
        ),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        )
    })
    .strict();

const updateCustomerSchema = z
    .object({
        customerId: customerIdSchema,
        customerName: trimmedString(1, 100),
        password: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().max(200).optional()
        ),
        priceRank: z.preprocess(
            (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
            z.string().max(20).optional()
        ),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        )
    })
    .strict();

const featuresSchema = z
    .object({
        orders: z.boolean().optional(),
        kaitori: z.boolean().optional(),
        support: z.boolean().optional(),
        cart: z.boolean().optional(),
        history: z.boolean().optional(),
        collection: z.boolean().optional(),
        announcements: z.boolean().optional(),
        adminKaitori: z.boolean().optional(),
        adminOrders: z.boolean().optional(),
        adminProducts: z.boolean().optional(),
        adminCustomers: z.boolean().optional(),
        adminPrices: z.boolean().optional(),
        adminSupport: z.boolean().optional()
    })
    .strict();

const mailTemplatesSchema = z
    .object({
        orderSubject: optionalTrimmedString(300),
        orderBody: optionalTrimmedString(10000),
        supportSubject: optionalTrimmedString(300),
        supportBody: optionalTrimmedString(10000),
        inviteSubject: optionalTrimmedString(300),
        inviteBody: optionalTrimmedString(10000),
        passwordResetSubject: optionalTrimmedString(300),
        passwordResetBody: optionalTrimmedString(10000),
        passwordChangedSubject: optionalTrimmedString(300),
        passwordChangedBody: optionalTrimmedString(10000),
        loginFailureAlertSubject: optionalTrimmedString(300),
        loginFailureAlertBody: optionalTrimmedString(10000),
        loginFailureAlertAdminSubject: optionalTrimmedString(300),
        loginFailureAlertAdminBody: optionalTrimmedString(10000)
    })
    .strict();

const mailSchema = z
    .object({
        smtp: z
            .object({
                service: optionalTrimmedString(100),
                user: optionalTrimmedString(255),
                host: optionalTrimmedString(255),
                port: z.coerce.number().int().min(1).max(65535).optional(),
                secure: z.boolean().optional(),
                password: optionalTrimmedString(500)
            })
            .strict()
            .optional(),
        from: optionalTrimmedString(300),
        orderNotifyTo: optionalTrimmedString(300),
        supportNotifyTo: optionalTrimmedString(300),
        templates: mailTemplatesSchema.optional()
    })
    .strict();

const announcementSchema = z
    .object({
        id: optionalTrimmedString(100),
        title: trimmedString(1, 200),
        body: trimmedString(1, 5000),
        type: z.enum(["info", "warning", "error", "success"]).optional(),
        target: z.enum(["all", "customer", "admin"]).optional(),
        category: z.enum(["order", "general"]).optional(),
        enabled: z.boolean().optional(),
        startDate: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
        endDate: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
        linkUrl: optionalTrimmedString(1000),
        linkText: optionalTrimmedString(200)
    })
    .strict();

const adminAccountUpdateSchema = z
    .object({
        adminId: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/, "管理者IDは英数字・ピリオド・アンダースコア・ハイフンのみ使用できます")
        ),
        name: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().max(100)
        ).optional(),
        password: z.string().min(0).max(200).optional(),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        )
    })
    .strict();

const adminSettingsUpdateSchema = z
    .object({
        blockedManufacturers: z.array(z.string().max(200)).optional(),
        blockedProductCodes: z.array(z.string().max(200)).optional(),
        mail: mailSchema.optional(),
        features: featuresSchema.optional(),
        announcements: z.array(announcementSchema).optional(),
        recaptcha: z
            .object({
                siteKey: optionalTrimmedString(500),
                secretKey: optionalTrimmedString(500)
            })
            .strict()
            .optional(),
        productSchema: z.any().optional(),
        rankCount: z.number().int().min(1).max(26).optional(),
        rankNames: z.record(z.string().max(10), z.string().max(100)).optional(),
        shippingRules: z.record(z.string().max(100), z.string().max(5000)).optional(),
        cartShippingNotice: z.string().max(10000).optional(),
        dataFormats: z.any().optional()
    })
    .strict();

module.exports = {
    loginSchema,
    placeOrderSchema,
    adminCreateOrderSchema,
    addCustomerSchema,
    updateCustomerSchema,
    adminAccountUpdateSchema,
    adminSettingsUpdateSchema
};
