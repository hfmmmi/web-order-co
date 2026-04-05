/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testTimeout: 30000,
    setupFiles: ["<rootDir>/tests/setupJestDataDir.js"],
    testMatch: ["**/tests/**/*.test.js"],
    collectCoverageFrom: [
        "routes/**/*.js",
        "services/**/*.js",
        "middlewares/**/*.js",
        "utils/priceCalc.js",
        "utils/excelReader.js",
        "utils/rankPriceImportBuffer.js"
    ],
    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/tests/"
    ],
    coverageThreshold: {
        // 分岐90%を長期目標。手順一覧: docs/branch-coverage-90-index.md（計測・閾値は phase1 / phase8）。
        // 実測は coverage:baseline の total.branches.pct（2026-04-05 時点 ~90.0% 前後）。閾値は collectCoverageFrom 全体の分岐。
        // validate.js / priceCalc.js への個別閾値は付けない（Jest が global 集計から除外し、global 分岐%が全体合算より数%低く見えるため）。
        global: {
            lines: 85,
            branches: 90
        }
    }
};
