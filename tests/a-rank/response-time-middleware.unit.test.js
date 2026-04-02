"use strict";

const express = require("express");
const request = require("supertest");

describe("responseTime middleware 分岐", () => {
    test("X-Response-Time ヘッダが付与される", async () => {
        const { createResponseTimeMiddleware } = require("../../middlewares/responseTime");
        const app = express();
        app.use(createResponseTimeMiddleware());
        app.get("/t", (req, res) => res.send("ok"));
        const res = await request(app).get("/t");
        expect(String(res.headers["x-response-time"] || "")).toMatch(/ms$/);
    });
});
