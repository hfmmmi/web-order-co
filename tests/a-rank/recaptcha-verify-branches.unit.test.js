"use strict";

/**
 * routes/auth/recaptcha.js の https 応答・parse 失敗・error・timeout 分岐
 */
describe("verifyRecaptcha 分岐", () => {
    let https;
    let verifyRecaptcha;

    beforeEach(() => {
        jest.resetModules();
        https = require("https");
        ({ verifyRecaptcha } = require("../../routes/auth/recaptcha"));
    });

    test("token または secret が空なら false（短絡）", async () => {
        await expect(verifyRecaptcha("", "sec")).resolves.toBe(false);
        await expect(verifyRecaptcha("tok", "")).resolves.toBe(false);
        await expect(verifyRecaptcha(null, "s")).resolves.toBe(false);
    });

    test("レスポンス body が不正 JSON なら false", async () => {
        jest.spyOn(https, "request").mockImplementation((opts, cb) => {
            const res = {
                on(ev, fn) {
                    if (ev === "data") fn(Buffer.from("{not-json"));
                    if (ev === "end") fn();
                }
            };
            setImmediate(() => cb(res));
            return {
                on() {},
                setTimeout() {},
                write() {},
                end() {}
            };
        });
        await expect(verifyRecaptcha("t", "secret")).resolves.toBe(false);
    });

    test("レスポンス JSON で success true なら true", async () => {
        jest.spyOn(https, "request").mockImplementation((opts, cb) => {
            const res = {
                on(ev, fn) {
                    if (ev === "data") fn(Buffer.from('{"success":true}'));
                    if (ev === "end") fn();
                }
            };
            setImmediate(() => cb(res));
            return {
                on() {},
                setTimeout() {},
                write() {},
                end() {}
            };
        });
        await expect(verifyRecaptcha("tok", "sec")).resolves.toBe(true);
    });

    test("req error イベントで false", async () => {
        jest.spyOn(https, "request").mockImplementation(() => {
            const req = {
                on(ev, fn) {
                    if (ev === "error") setImmediate(() => fn(new Error("net")));
                },
                setTimeout() {},
                write() {},
                end() {}
            };
            return req;
        });
        await expect(verifyRecaptcha("t", "k")).resolves.toBe(false);
    });

    test("setTimeout で destroy し false", async () => {
        jest.useFakeTimers();
        try {
            jest.spyOn(https, "request").mockImplementation(() => {
                const req = {
                    destroyed: false,
                    on() {},
                    setTimeout(ms, fn) {
                        setTimeout(() => fn(), 0);
                    },
                    destroy() {
                        this.destroyed = true;
                    },
                    write() {},
                    end() {}
                };
                return req;
            });
            const p = verifyRecaptcha("t", "k");
            jest.runAllTimers();
            await expect(p).resolves.toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });
});
