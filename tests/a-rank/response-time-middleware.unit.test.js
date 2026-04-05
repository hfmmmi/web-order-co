"use strict";

const express = require("express");
const request = require("supertest");

describe("responseTime middleware 分岐", () => {
    const origPerf = process.env.ENABLE_PERF_LOG;
    const origThresh = process.env.PERF_LOG_THRESHOLD_MS;

    afterEach(() => {
        if (origPerf === undefined) delete process.env.ENABLE_PERF_LOG;
        else process.env.ENABLE_PERF_LOG = origPerf;
        if (origThresh === undefined) delete process.env.PERF_LOG_THRESHOLD_MS;
        else process.env.PERF_LOG_THRESHOLD_MS = origThresh;
        jest.resetModules();
    });

    test("X-Response-Time ヘッダが付与される", async () => {
        const { createResponseTimeMiddleware } = require("../../middlewares/responseTime");
        const app = express();
        app.use(createResponseTimeMiddleware());
        app.get("/t", (req, res) => res.send("ok"));
        const res = await request(app).get("/t");
        expect(String(res.headers["x-response-time"] || "")).toMatch(/ms$/);
    });

    test("ENABLE_PERF_LOG=true かつ閾値以上でコンソールログ分岐", async () => {
        process.env.ENABLE_PERF_LOG = "true";
        process.env.PERF_LOG_THRESHOLD_MS = "1";
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        const { createResponseTimeMiddleware } = require("../../middlewares/responseTime");
        const app = express();
        app.use(createResponseTimeMiddleware());
        app.get("/slow", (req, res) => {
            setTimeout(() => res.send("ok"), 15);
        });
        await request(app).get("/slow");
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[PERF\]/));
        logSpy.mockRestore();
    });

    test("ヘッダ送信済みのとき X-Response-Time を付けない", async () => {
        const { createResponseTimeMiddleware } = require("../../middlewares/responseTime");
        const app = express();
        app.use(createResponseTimeMiddleware());
        app.get("/early", (req, res) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("x");
        });
        const res = await request(app).get("/early");
        expect(res.headers["x-response-time"]).toBeUndefined();
    });

    test("ENABLE_PERF_LOG=true でも処理時間が閾値未満なら PERF ログを出さない", async () => {
        process.env.ENABLE_PERF_LOG = "true";
        process.env.PERF_LOG_THRESHOLD_MS = "999999";
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        const { createResponseTimeMiddleware } = require("../../middlewares/responseTime");
        const app = express();
        app.use(createResponseTimeMiddleware());
        app.get("/fast", (req, res) => res.send("ok"));
        await request(app).get("/fast");
        expect(logSpy).not.toHaveBeenCalled();
        logSpy.mockRestore();
    });

    test("PERF ログは originalUrl が無いとき req.url を使う", async () => {
        process.env.ENABLE_PERF_LOG = "true";
        process.env.PERF_LOG_THRESHOLD_MS = "1";
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        const { createResponseTimeMiddleware } = require("../../middlewares/responseTime");
        const app = express();
        app.use((req, res, next) => {
            delete req.originalUrl;
            next();
        });
        app.use(createResponseTimeMiddleware());
        app.get("/only-url", (req, res) => {
            setTimeout(() => res.send("ok"), 15);
        });
        await request(app).get("/only-url");
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/only-url"));
        logSpy.mockRestore();
    });
});
