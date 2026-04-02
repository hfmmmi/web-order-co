"use strict";

const request = require("supertest");
const { app } = require("../../server");

describe("branch coverage 100 P3: catalog / kaitori / validate", () => {
    test("GET /products は未ログイン 401", async () => {
        const res = await request(app).get("/products");
        expect(res.statusCode).toBe(401);
    });

    test("GET /products/frequent は未ログイン 401", async () => {
        const res = await request(app).get("/products/frequent");
        expect(res.statusCode).toBe(401);
    });

    test("GET /my-kaitori-history は未ログイン 401", async () => {
        const res = await request(app).get("/my-kaitori-history");
        expect(res.statusCode).toBe(401);
    });

    test("GET /admin/kaitori-list は未認証 401", async () => {
        const res = await request(app).get("/admin/kaitori-list");
        expect(res.statusCode).toBe(401);
    });

    test("POST /admin/kaitori-master/import は未認証 401", async () => {
        const res = await request(app).post("/admin/kaitori-master/import");
        expect(res.statusCode).toBe(401);
    });

    test("POST /place-order は未知キーで 400", async () => {
        const res = await request(app)
            .post("/place-order")
            .send({
                cart: [{ code: "P001", quantity: 1, price: 100 }],
                deliveryInfo: { name: "a", address: "b", zip: "1", tel: "t" },
                unknownKey: true
            });
        expect(res.statusCode).toBe(400);
    });

    test("GET /download-my-pricelist は未ログイン 401", async () => {
        const res = await request(app).get("/download-my-pricelist");
        expect(res.statusCode).toBe(401);
    });

    test("POST /kaitori-request は未ログイン 401", async () => {
        const res = await request(app).post("/kaitori-request").send({});
        expect(res.statusCode).toBe(401);
    });
});
