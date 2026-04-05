"use strict";

const RestAdapter = require("../../services/stockAdapters/restAdapter");
const { createAdapter } = require("../../services/stockAdapters");

describe("RestAdapter", () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock;
    });

    afterEach(() => {
        delete global.fetch;
    });

    test("createAdapter type rest は RestAdapter を返す", () => {
        const svc = { syncStocks: jest.fn().mockResolvedValue({}) };
        const adapter = createAdapter({ type: "rest", options: { endpoint: "http://example" } }, svc);
        expect(adapter).not.toBeNull();
        expect(adapter.constructor.name).toBe("RestAdapter");
    });

    test("pull は endpoint 未設定で throw する", async () => {
        const adapter = new RestAdapter({ options: {} }, { syncStocks: jest.fn() });
        await expect(adapter.pull({})).rejects.toThrow("RESTエンドポイントが設定されていません");
    });

    test("pull は引数省略で runOptions デフォルト（config の endpoint を使う）", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([])
        });
        const adapter = new RestAdapter({ options: { endpoint: "http://default-only" } }, { syncStocks: jest.fn() });
        await adapter.pull();
        expect(fetchMock).toHaveBeenCalledWith("http://default-only", expect.any(Object));
    });

    test("pull は runOptions.endpoint を優先する", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([{ code: "C1", qty: 3 }])
        });
        const adapter = new RestAdapter(
            { options: { endpoint: "http://ignored" } },
            { syncStocks: jest.fn() }
        );
        const data = await adapter.pull({ endpoint: "http://api/stock" });
        expect(data).toEqual([{ code: "C1", qty: 3 }]);
        expect(fetchMock).toHaveBeenCalledWith(
            "http://api/stock",
            expect.objectContaining({ method: "GET" })
        );
    });

    test("pull は method・headers・body をマージする", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue([])
        });
        const adapter = new RestAdapter(
            {
                options: {
                    endpoint: "http://x",
                    method: "post",
                    headers: { "X-Old": "1" },
                    body: { a: 1 }
                }
            },
            { syncStocks: jest.fn() }
        );
        await adapter.pull({
            method: "PUT",
            headers: { "X-New": "2" },
            body: { b: 2 }
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "http://x",
            expect.objectContaining({
                method: "PUT",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    "X-Old": "1",
                    "X-New": "2"
                }),
                body: JSON.stringify({ b: 2 })
            })
        );
    });

    test("pull は response.ok が false のとき throw する", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 503 });
        const adapter = new RestAdapter({ options: { endpoint: "http://x" } }, { syncStocks: jest.fn() });
        await expect(adapter.pull({})).rejects.toThrow("503");
    });

    test("_fetch は fetch が無いとき throw する", async () => {
        delete global.fetch;
        const adapter = new RestAdapter({ options: { endpoint: "http://x" } }, { syncStocks: jest.fn() });
        await expect(adapter.pull({})).rejects.toThrow("fetch API が利用できないため");
    });

    test("normalize は配列でないとき空配列", async () => {
        const adapter = new RestAdapter({}, { syncStocks: jest.fn() });
        expect(await adapter.normalize(null)).toEqual([]);
        expect(await adapter.normalize({})).toEqual([]);
    });

    test("normalize は引数省略でデフォルト空配列を処理する", async () => {
        const adapter = new RestAdapter({}, { syncStocks: jest.fn() });
        expect(await adapter.normalize()).toEqual([]);
    });

    test("normalize は productCode / code・qty・publish・manualLock 等を正規化する", async () => {
        const adapter = new RestAdapter({}, { syncStocks: jest.fn() });
        const rows = await adapter.normalize([
            { code: "A1", qty: "5", publish: false, manualLock: "1", warehouses: [{ x: 1 }] },
            { productCode: "B2", totalQty: 2, reservedQty: 1.5, hiddenMessage: "h", lastSyncedAt: "2020-01-01T00:00:00.000Z" },
            { productCode: "", totalQty: 1 },
            { productCode: "C3", totalQty: NaN, qty: "x" }
        ]);
        expect(rows.find((r) => r.productCode === "A1")).toMatchObject({
            productCode: "A1",
            totalQty: 5,
            reservedQty: 0,
            publish: false,
            manualLock: true,
            source: "rest"
        });
        expect(rows.find((r) => r.productCode === "B2")).toMatchObject({
            productCode: "B2",
            totalQty: 2,
            reservedQty: 1.5,
            publish: true,
            timestamp: "2020-01-01T00:00:00.000Z"
        });
        expect(rows.some((r) => r.productCode === "C3")).toBe(true);
    });

    test("normalize は totalQty 非有限かつ qty が数値 0 のとき totalQty は 0", async () => {
        const adapter = new RestAdapter({}, { syncStocks: jest.fn() });
        const rows = await adapter.normalize([{ productCode: "Z0", totalQty: Number.NaN, qty: 0 }]);
        expect(rows[0].totalQty).toBe(0);
    });

    test("normalize は totalQty 非有限かつ qty が非数文字列のとき Number 結果が falsy で totalQty 0", async () => {
        const adapter = new RestAdapter({}, { syncStocks: jest.fn() });
        const rows = await adapter.normalize([{ productCode: "ZSTR", totalQty: Number.NaN, qty: "not-a-number" }]);
        expect(rows[0].totalQty).toBe(0);
    });
});
