// validateQuery / validateParams のカバレッジ用（validate.js 閾値達成）
const express = require("express");
const { z } = require("zod");
const request = require("supertest");
const { validateQuery, validateParams } = require("../../middlewares/validate");

const querySchema = z.object({ page: z.coerce.number().int().min(1).optional() }).strict();
const paramsSchema = z.object({ id: z.string().min(1).max(50) }).strict();

const app = express();
app.use(express.json());
app.get("/with-query", validateQuery(querySchema), (req, res) => {
    res.json({ ok: true, page: req.query.page });
});
app.get("/with-params/:id", validateParams(paramsSchema), (req, res) => {
    res.json({ ok: true, id: req.params.id });
});

describe("Aランク: validate ミドルウェア（query/params）", () => {
    test("validateQuery: 有効な query で next", async () => {
        const res = await request(app).get("/with-query").query({ page: 1 });
        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(Number(res.body.page)).toBe(1);
    });

    test("validateQuery: query なし（optional）で next", async () => {
        const res = await request(app).get("/with-query");
        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    test("validateQuery: unknown key で 400", async () => {
        const res = await request(app).get("/with-query").query({ page: 1, extra: "x" });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("入力内容に誤りがあります");
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.some((e) => String(e.path).includes("extra"))).toBe(true);
    });

    test("validateQuery: 型不正で 400", async () => {
        const res = await request(app).get("/with-query").query({ page: "not-a-number" });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test("validateParams: 有効な params で next", async () => {
        const res = await request(app).get("/with-params/abc123");
        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.id).toBe("abc123");
    });

    test("validateParams: 空 id で 400", async () => {
        const res = await request(app).get("/with-params/");
        expect(res.statusCode).toBe(404);
    });

    test("validateParams: 不正な params（形式違反）で 400", async () => {
        const strictApp = express();
        const numericIdSchema = z.object({ id: z.string().regex(/^\d+$/, "数字のみ") }).strict();
        strictApp.get("/strict/:id", validateParams(numericIdSchema), (req, res) => {
            res.json({ ok: true });
        });
        const res = await request(strictApp).get("/strict/notnumeric");
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("入力内容に誤りがあります");
        expect(Array.isArray(res.body.errors)).toBe(true);
    });
});
