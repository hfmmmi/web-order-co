/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testTimeout: 30000,
    globalSetup: "<rootDir>/tests/jestGlobalSetup.js",
    setupFiles: ["<rootDir>/tests/setupJestDataDir.js"],
    testMatch: ["**/tests/**/*.test.js"],
    collectCoverageFrom: [
        "routes/**/*.js",
        "services/**/*.js",
        "middlewares/**/*.js",
        "utils/priceCalc.js",
        "utils/excelReader.js"
    ],
    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/tests/"
    ],
    coverageThreshold: {
        // 分岐カバレッジの最低ライン（global・branches 80%）。手順・目標値は docs/branch-coverage-90-index.md 等を参照。
        // validate.js / priceCalc.js への個別閾値は付けない（Jest が global 集計から除外し、global 分岐%が全体合算より数%低く見えるため）。
        global: {
            lines: 85,
            branches: 80
        }
    }
};
