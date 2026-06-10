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
        // 分岐カバレッジの最低ライン。80% は docs/branch-coverage-80-plan.md の目標（閾値は実測が安定してから引き上げ）。
        // validate.js / priceCalc.js への個別閾値は付けない（Jest が global 集計から除外し、global 分岐%が全体合算より数%低く見えるため）。
        global: {
            lines: 85,
            branches: 77
        }
    }
};
