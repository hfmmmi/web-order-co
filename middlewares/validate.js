// middlewares/validate.js
// 役割: Zod スキーマに基づく入力検証を共通化する
const { ZodError } = require("zod");

const DEFAULT_MESSAGE = "入力内容に誤りがあります";

function formatZodErrors(issues, pathPrefix = "body") {
    const rows = [];
    issues.forEach((issue) => {
        const basePath = issue.path && issue.path.length ? issue.path.join(".") : pathPrefix;
        if (issue.code === "unrecognized_keys" && Array.isArray(issue.keys) && issue.keys.length > 0) {
            issue.keys.forEach((key) => {
                rows.push({
                    path: basePath === pathPrefix ? key : `${basePath}.${key}`,
                    message: "未定義の項目です"
                });
            });
            return;
        }
        rows.push({
            path: basePath,
            message: issue.message
        });
    });
    return rows;
}

function validateBody(schema) {
    return (req, res, next) => {
        try {
            const parsed = schema.parse(req.body || {});
            req.body = parsed;
            return next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: DEFAULT_MESSAGE,
                    errors: formatZodErrors(error.issues, "body")
                });
            }
            return res.status(400).json({
                success: false,
                message: DEFAULT_MESSAGE,
                errors: [{ path: "body", message: "不正なリクエストです" }]
            });
        }
    };
}

function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const parsed = schema.parse(req.query || {});
            req.query = parsed;
            return next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: DEFAULT_MESSAGE,
                    errors: formatZodErrors(error.issues, "query")
                });
            }
            return res.status(400).json({
                success: false,
                message: DEFAULT_MESSAGE,
                errors: [{ path: "query", message: "不正なリクエストです" }]
            });
        }
    };
}

function validateParams(schema) {
    return (req, res, next) => {
        try {
            const parsed = schema.parse(req.params || {});
            req.params = parsed;
            return next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: DEFAULT_MESSAGE,
                    errors: formatZodErrors(error.issues, "params")
                });
            }
            return res.status(400).json({
                success: false,
                message: DEFAULT_MESSAGE,
                errors: [{ path: "params", message: "不正なリクエストです" }]
            });
        }
    };
}

module.exports = {
    validateBody,
    validateQuery,
    validateParams,
    formatZodErrors
};
