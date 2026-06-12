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

const emailSchema = z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.string().email("メールアドレスの形式が不正です").max(254)
);

const customerLoginSchema = z
    .object({
        id: emailSchema,
        pass: z.string().min(1).max(200),
        captchaToken: optionalTrimmedString(4000)
    })
    .strict();

const adminLoginSchema = z
    .object({
        id: emailSchema,
        pass: z.string().min(1).max(200),
        captchaToken: optionalTrimmedString(4000)
    })
    .strict();

/** @deprecated 顧客ログインは customerLoginSchema を使用 */
const loginSchema = customerLoginSchema;

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
        contactName: optionalTrimmedString(100),
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
        deliveryInfo: deliveryInfoSchema,
        orderDate: z.preprocess(
            (v) => (v === undefined || v === null ? undefined : typeof v === "string" ? v.trim() : v),
            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        )
    })
    .strict();

/** 管理画面: 注文削除 */
const adminDeleteOrderSchema = z
    .object({
        orderId: z.preprocess(
            (v) => (v === undefined || v === null ? v : String(v).trim()),
            z.string().min(1).max(40)
        )
    })
    .strict();

/** 管理画面: 注文詳細（納品先・明細・備考等）の編集 */
const adminOrderDetailsDeliverySchema = z
    .object({
        date: optionalTrimmedString(50),
        zip: optionalTrimmedString(20),
        tel: optionalTrimmedString(30),
        address: optionalTrimmedString(300),
        name: optionalTrimmedString(100),
        contactName: optionalTrimmedString(100),
        note: optionalTrimmedString(1000),
        clientOrderNumber: optionalTrimmedString(100),
        shipper: shipperSchema.partial().optional()
    })
    .strict();

const adminUpdateOrderDetailsItemSchema = z
    .object({
        code: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(1).max(120)
        ),
        name: z.preprocess(
            (v) => (v === undefined || v === null ? "" : typeof v === "string" ? v.trim() : ""),
            z.string().max(300)
        ),
        price: z.coerce.number().int().min(0).max(999999999),
        quantity: z.coerce.number().int().min(1).max(9999)
    })
    .strict();

const adminRevertItemShipmentSchema = z
    .object({
        orderId: z.preprocess(
            (v) => (v === undefined || v === null ? v : String(v).trim()),
            z.string().min(1).max(40)
        ),
        itemCode: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(1).max(120)
        )
    })
    .strict();

const adminUpdateOrderDetailsSchema = z
    .object({
        orderId: z.preprocess(
            (v) => (v === undefined || v === null ? v : String(v).trim()),
            z.string().min(1).max(40)
        ),
        deliveryInfo: adminOrderDetailsDeliverySchema.optional(),
        items: z.array(adminUpdateOrderDetailsItemSchema).min(1).optional()
    })
    .strict()
    .refine((d) => d.deliveryInfo !== undefined || d.items !== undefined, {
        message: "deliveryInfo または items を指定してください",
        path: ["deliveryInfo"]
    });

const addCustomerSchema = z
    .object({
        customerId: customerIdSchema,
        customerName: trimmedString(1, 100),
        priceRank: z.preprocess(
            (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
            z.string().max(20).optional()
        ),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        ),
        deliveryName: optionalTrimmedString(100),
        deliveryZip: optionalTrimmedString(20),
        deliveryAddress: optionalTrimmedString(300),
        deliveryTel: optionalTrimmedString(30)
    })
    .strict();

const updateCustomerSchema = z
    .object({
        customerId: customerIdSchema,
        customerName: trimmedString(1, 100),
        priceRank: z.preprocess(
            (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
            z.string().max(20).optional()
        ),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        ),
        deliveryName: optionalTrimmedString(100),
        deliveryZip: optionalTrimmedString(20),
        deliveryAddress: optionalTrimmedString(300),
        deliveryTel: optionalTrimmedString(30)
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

const staffLoginIdSchema = z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/, "IDは英数字・ピリオド・アンダースコア・ハイフンのみ使用できます")
);

const adminAccountUpdateSchema = z
    .object({
        adminId: staffLoginIdSchema,
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

const adminAccountItemSchema = z
    .object({
        adminId: staffLoginIdSchema,
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

const adminAccountsSaveSchema = z
    .object({
        accounts: z.array(adminAccountItemSchema).max(100)
    })
    .strict();

const customerUserItemSchema = z
    .object({
        userId: staffLoginIdSchema,
        contactName: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().max(100)
        ).optional(),
        customerId: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(1).max(50)
        ),
        password: z.string().min(0).max(200).optional(),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        )
    })
    .strict();

const customerUsersSaveSchema = z
    .object({
        users: z.array(customerUserItemSchema).max(500)
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

/** 顧客本人: アカウント設定（担当者・会社共通で現在PW必須） */
const updateAccountProfileSchema = z
    .object({
        contactName: optionalTrimmedString(100),
        email: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.union([z.literal(""), z.string().email().max(254)]).optional()
        ),
        currentPassword: z.string().min(1).max(200),
        password: z.string().min(0).max(200).optional()
    })
    .strict()
    .superRefine((val, ctx) => {
        if (val.password && val.password.length > 0 && val.password.length < 4) {
            ctx.addIssue({
                code: "custom",
                message: "新しいパスワードは4文字以上にしてください",
                path: ["password"]
            });
        }
    });

/** 顧客本人: 既定納品先の更新 */
const updateAccountDeliverySchema = z
    .object({
        deliveryName: optionalTrimmedString(100),
        deliveryZip: optionalTrimmedString(20),
        deliveryAddress: optionalTrimmedString(300),
        deliveryTel: optionalTrimmedString(30)
    })
    .strict();

const customerUserRoleSchema = z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.enum(["admin", "user"]).optional()
);

const addCustomerUserSchema = z
    .object({
        customerId: customerIdSchema.optional(),
        email: emailSchema,
        displayName: optionalTrimmedString(100),
        role: customerUserRoleSchema,
        password: z.string().min(4).max(200),
        active: z.boolean().optional()
    })
    .strict();

const updateCustomerUserSchema = z
    .object({
        email: emailSchema.optional(),
        displayName: optionalTrimmedString(100),
        role: customerUserRoleSchema,
        password: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(4).max(200).optional()
        ),
        active: z.boolean().optional()
    })
    .strict();

const customerUserInviteSchema = z
    .object({
        userId: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(1).max(80)
        )
    })
    .strict();

const addAdminUserSchema = z
    .object({
        email: emailSchema,
        displayName: optionalTrimmedString(100),
        role: customerUserRoleSchema,
        password: z.string().min(4).max(200),
        active: z.boolean().optional()
    })
    .strict();

const updateAdminUserSchema = z
    .object({
        email: emailSchema.optional(),
        displayName: optionalTrimmedString(100),
        role: customerUserRoleSchema,
        password: z.preprocess(
            (v) => (typeof v === "string" ? v.trim() : v),
            z.string().min(4).max(200).optional()
        ),
        active: z.boolean().optional()
    })
    .strict();

const adminUserInviteSchema = customerUserInviteSchema;

module.exports = {
    loginSchema,
    customerLoginSchema,
    adminLoginSchema,
    placeOrderSchema,
    adminCreateOrderSchema,
    adminDeleteOrderSchema,
    adminUpdateOrderDetailsSchema,
    adminRevertItemShipmentSchema,
    addCustomerSchema,
    updateCustomerSchema,
    updateAccountProfileSchema,
    addCustomerUserSchema,
    updateCustomerUserSchema,
    customerUserInviteSchema,
    addAdminUserSchema,
    updateAdminUserSchema,
    adminUserInviteSchema,
    updateAccountDeliverySchema,
    adminAccountUpdateSchema,
    adminAccountsSaveSchema,
    customerUserItemSchema,
    customerUsersSaveSchema,
    adminSettingsUpdateSchema
};
