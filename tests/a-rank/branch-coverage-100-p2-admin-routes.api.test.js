"use strict";

const request = require("supertest");
const { app } = require("../../server");

describe("branch coverage 100 P2: admin stocks/settings 401", () => {
    test("GET /admin/stocks/settings は未認証で 401", async () => {
        const res = await request(app).get("/api/admin/stocks/settings");
        expect(res.statusCode).toBe(401);
    });

    test("PUT /admin/stocks/settings は未認証で 401", async () => {
        const res = await request(app).put("/api/admin/stocks/settings").send({});
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/stocks は未認証で 401", async () => {
        const res = await request(app).get("/api/admin/stocks");
        expect(res.statusCode).toBe(401);
    });

    test("POST /admin/stocks/import は未認証で 401", async () => {
        const res = await request(app).post("/api/admin/stocks/import");
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/stocks/template は未認証で 401", async () => {
        const res = await request(app).get("/api/admin/stocks/template");
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/stocks/history は未認証で 401", async () => {
        const res = await request(app).get("/api/admin/stocks/history");
        expect(res.statusCode).toBe(401);
    });

    test("POST /admin/stocks/manual-adjust は未認証で 401", async () => {
        const res = await request(app).post("/api/admin/stocks/manual-adjust").send({});
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/settings は未認証で 401", async () => {
        const res = await request(app).get("/api/admin/settings");
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/account は未認証で 401", async () => {
        const res = await request(app).get("/api/admin/account");
        expect(res.statusCode).toBe(401);
    });

    test("POST /api/login は不正パスワードで失敗", async () => {
        const res = await request(app).post("/api/login").send({ id: "TEST001", pass: "WrongPass!!!" });
        expect(res.body.success === false || res.statusCode >= 400).toBe(true);
    });
});
