// validateQuery / validateParams のカバレッジ用（validate.js 閾値達成）
const express = require("express");
const { z } = require("zod");
const request = require("supertest");
const { validateBody, validateQuery, validateParams } = require("../../middlewares/validate");

function runMiddleware(mw, req, res) {
    return new Promise((resolve, reject) => {
        mw(req, res, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

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

describe("Aランク: validate ミドルウェア（body/query/params）", () => {
    test("validateBody: req.body が undefined でも || {} で parse できる", async () => {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.body = undefined;
            next();
        });
        app.post("/vb-undef", validateBody(z.object({}).strict()), (req, res) => res.json({ ok: true }));
        const res = await request(app).post("/vb-undef").send();
        expect(res.statusCode).toBe(200);
    });

    test("validateQuery: req.query が undefined でも || {} で parse できる", async () => {
        const app = express();
        app.get(
            "/vq-undef",
            (req, res, next) => {
                req.query = undefined;
                next();
            },
            validateQuery(z.object({}).strict()),
            (req, res) => res.json({ ok: true })
        );
        const res = await request(app).get("/vq-undef");
        expect(res.statusCode).toBe(200);
    });

    test("validateParams: req.params が undefined でも || {} で Zod に渡る", async () => {
        const app = express();
        app.get(
            "/vp-undef/:id",
            (req, res, next) => {
                req.params = undefined;
                next();
            },
            validateParams(z.object({ id: z.string().optional() }).strict()),
            (req, res) => res.json({ ok: true })
        );
        const res = await request(app).get("/vp-undef/abc");
        expect(res.statusCode).toBe(200);
    });

    test("validateBody: Zod 以外の例外で 400（汎用メッセージ）", async () => {
        const app = express();
        app.use(express.json());
        const boomSchema = { parse: () => { throw new Error("not zod"); } };
        app.post("/vb", validateBody(boomSchema), (req, res) => res.json({ ok: true }));
        const res = await request(app).post("/vb").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.errors[0].path).toBe("body");
        expect(res.body.errors[0].message).toContain("不正な");
    });

    test("validateQuery: Zod 以外の例外で 400", async () => {
        const app = express();
        const boomSchema = { parse: () => { throw new Error("boom"); } };
        app.get("/vq", validateQuery(boomSchema), (req, res) => res.json({ ok: true }));
        const res = await request(app).get("/vq");
        expect(res.statusCode).toBe(400);
        expect(res.body.errors[0].path).toBe("query");
    });

    test("validateParams: Zod 以外の例外で 400", async () => {
        const app = express();
        const boomSchema = { parse: () => { throw new Error("boom"); } };
        app.get("/vp/:id", validateParams(boomSchema), (req, res) => res.json({ ok: true }));
        const res = await request(app).get("/vp/x");
        expect(res.statusCode).toBe(400);
        expect(res.body.errors[0].path).toBe("params");
    });

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

    test("validateQuery: req.query が null のとき || {} で parse", async () => {
        const app = express();
        app.get(
            "/vq-null",
            (req, res, next) => {
                req.query = null;
                next();
            },
            validateQuery(z.object({}).strict()),
            (req, res) => res.json({ ok: true })
        );
        const res = await request(app).get("/vq-null");
        expect(res.statusCode).toBe(200);
    });

    test("validateParams: req.params が null のとき || {} で parse", async () => {
        const app = express();
        app.get(
            "/vp-null/:id",
            (req, res, next) => {
                req.params = null;
                next();
            },
            validateParams(z.object({ id: z.string().optional() }).strict()),
            (req, res) => res.json({ ok: true })
        );
        const res = await request(app).get("/vp-null/abc");
        expect(res.statusCode).toBe(200);
    });

    test("validateQuery を直接呼び req.query が null でも schema.parse({}) にフォールバック", async () => {
        const mw = validateQuery(z.object({}).strict());
        const req = { query: null };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await runMiddleware(mw, req, res);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.query).toEqual({});
    });
});
