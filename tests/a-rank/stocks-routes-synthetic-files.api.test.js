/**
 * stocksRoutes: 合成 req.files で Buffer 以外の data / 空ファイル名 / userId フォールバックを通す
 */
"use strict";

jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const express = require("express");
const fileUpload = require("express-fileupload");
const request = require("supertest");
const stocksRoutes = require("../../routes/admin/stocksRoutes");
const stockService = require("../../services/stockService");

jest.mock("../../services/stockAdapters", () => ({
    createAdapter: jest.fn(() => ({
        run: jest.fn().mockResolvedValue({ summary: { rows: 1 } })
    }))
}));

function appWithFiles(patchFiles) {
    const app = express();
    app.use((req, res, next) => {
        req.session = { isAdmin: true, adminId: "aid", adminName: "" };
        next();
    });
    app.use(
        fileUpload({
            limits: { fileSize: 50 * 1024 * 1024 },
            useTempFiles: false
        })
    );
    app.use((req, res, next) => {
        patchFiles(req);
        next();
    });
    app.use("/api", stocksRoutes);
    return app;
}

function jsonAppWithSession(session) {
    const app = express();
    app.use((req, res, next) => {
        req.session = session;
        next();
    });
    app.use(express.json());
    app.use("/api", stocksRoutes);
    return app;
}

describe("Aランク: stocksRoutes 合成ファイルオブジェクト", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("POST import は file.data が Uint8Array でも成功", async () => {
        const app = appWithFiles((req) => {
            if (req.path === "/api/admin/stocks/import" && req.method === "POST") {
                req.files = {
                    stockFile: {
                        data: new Uint8Array([80, 44]),
                        name: "x.csv",
                        size: 2
                    }
                };
            }
        });
        const res = await request(app).post("/api/admin/stocks/import");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("POST import は file.name 空でも成功", async () => {
        const app = appWithFiles((req) => {
            if (req.path === "/api/admin/stocks/import" && req.method === "POST") {
                req.files = {
                    stockFile: {
                        data: Buffer.from("a,b\n1,2"),
                        name: "",
                        size: 8
                    }
                };
            }
        });
        const res = await request(app).post("/api/admin/stocks/import");
        expect(res.statusCode).toBe(200);
    });

    test("POST import は userId が adminName 無しのとき adminId または admin", async () => {
        const { createAdapter } = require("../../services/stockAdapters");
        const run = jest.fn().mockResolvedValue({ summary: {} });
        createAdapter.mockReturnValueOnce({ run });
        const app = express();
        app.use((req, res, next) => {
            req.session = { isAdmin: true, adminName: "", adminId: "IMPID" };
            next();
        });
        app.use(
            fileUpload({
                limits: { fileSize: 50 * 1024 * 1024 },
                useTempFiles: false
            })
        );
        app.use((req, res, next) => {
            if (req.path === "/api/admin/stocks/import" && req.method === "POST") {
                req.files = {
                    stockFile: { data: Buffer.from("x"), name: "a.csv", size: 1 }
                };
            }
            next();
        });
        app.use("/api", stocksRoutes);
        await request(app).post("/api/admin/stocks/import");
        expect(run).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "IMPID", filename: "a.csv" })
        );

        createAdapter.mockReturnValueOnce({ run });
        const app2 = express();
        app2.use((req, res, next) => {
            req.session = { isAdmin: true };
            next();
        });
        app2.use(
            fileUpload({
                limits: { fileSize: 50 * 1024 * 1024 },
                useTempFiles: false
            })
        );
        app2.use((req, res, next) => {
            if (req.path === "/api/admin/stocks/import" && req.method === "POST") {
                req.files = {
                    stockFile: { data: Buffer.from("y"), name: "b.csv", size: 1 }
                };
            }
            next();
        });
        app2.use("/api", stocksRoutes);
        await request(app2).post("/api/admin/stocks/import");
        expect(run).toHaveBeenCalledWith(expect.objectContaining({ userId: "admin" }));
    });

    test("POST manual-reserve は userId が adminId または admin にフォールバック", async () => {
        const reserveSpy = jest.spyOn(stockService, "reserve").mockResolvedValue(undefined);
        const appOnlyId = jsonAppWithSession({ isAdmin: true, adminName: "", adminId: "RID" });
        await request(appOnlyId)
            .post("/api/admin/stocks/manual-reserve")
            .send({ items: [{ productCode: "P001", quantity: 1 }] });
        expect(reserveSpy).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ userId: "RID", silent: true })
        );

        const appFallback = jsonAppWithSession({ isAdmin: true });
        await request(appFallback)
            .post("/api/admin/stocks/manual-reserve")
            .send({ items: [{ productCode: "P001", quantity: 1 }] });
        expect(reserveSpy).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ userId: "admin", silent: true })
        );
    });

    test("POST manual-release は session に管理者名が無ければ userId が adminId または admin", async () => {
        const releaseSpy = jest.spyOn(stockService, "release").mockResolvedValue(undefined);
        const appOnlyId = jsonAppWithSession({ isAdmin: true, adminName: "", adminId: "ONLYID" });
        await request(appOnlyId)
            .post("/api/admin/stocks/manual-release")
            .send({ items: [{ productCode: "P001", quantity: 1 }] });
        expect(releaseSpy).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ userId: "ONLYID" })
        );
        releaseSpy.mockRestore();

        const releaseSpy2 = jest.spyOn(stockService, "release").mockResolvedValue(undefined);
        const appFallback = jsonAppWithSession({ isAdmin: true });
        await request(appFallback)
            .post("/api/admin/stocks/manual-release")
            .send({ items: [{ productCode: "P001", quantity: 1 }] });
        expect(releaseSpy2).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ userId: "admin" })
        );
    });

    test("POST kaitori/parse-excel は excelFile.data が Uint8Array でも成功", async () => {
        const excelReader = require("../../utils/excelReader");
        jest.spyOn(excelReader, "readToObjects").mockResolvedValueOnce([{ a: 1 }]);
        const app = appWithFiles((req) => {
            if (req.path === "/api/admin/kaitori/parse-excel" && req.method === "POST") {
                req.files = {
                    excelFile: {
                        data: new Uint8Array([1, 2, 3]),
                        name: "z.xlsx",
                        size: 3
                    }
                };
            }
        });
        const res = await request(app).post("/api/admin/kaitori/parse-excel");
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
