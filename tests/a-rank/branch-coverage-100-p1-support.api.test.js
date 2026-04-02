"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue(true),
    sendSupportNotification: jest.fn().mockResolvedValue(true),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue(true)
}));

const request = require("supertest");
const { app } = require("../../server");

describe("branch coverage 100 P1: support-api", () => {
    test("GET /support/my-tickets は未ログイン 401", async () => {
        const res = await request(app).get("/support/my-tickets");
        expect(res.statusCode).toBe(401);
    });

    test("POST /request-support は未ログイン 401", async () => {
        const res = await request(app).post("/request-support").send({ category: "support", detail: "x" });
        expect(res.statusCode).toBe(401);
    });

    test("GET /support/attachment は ticketId 不正で 400", async () => {
        const res = await request(app).get("/support/attachment/bad-id/1_2_deadbeef00.pdf");
        expect(res.statusCode).toBe(400);
    });

    test("GET /support/attachment は storedName 不正で 400", async () => {
        const res = await request(app).get("/support/attachment/T-ABC123/notvalid");
        expect(res.statusCode).toBe(400);
    });

    test("GET /admin/support-tickets は未ログイン 401", async () => {
        const res = await request(app).get("/admin/support-tickets");
        expect(res.statusCode).toBe(401);
    });
});
