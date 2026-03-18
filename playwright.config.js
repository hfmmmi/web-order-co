const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests/e2e/specs",
    timeout: 60_000,
    expect: {
        timeout: 10_000
    },
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: "http://127.0.0.1:3000",
        headless: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    globalTeardown: require.resolve("./tests/e2e/scripts/global-teardown.js"),
    webServer: {
        command: "node tests/e2e/scripts/prepare-e2e-db.js && node server.js",
        url: "http://127.0.0.1:3000",
        timeout: 120_000,
        env: {
            NODE_ENV: "test",
            DATA_DIR: "tests/e2e/.e2e_data"
        },
        reuseExistingServer: false
    }
});
