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
        // 実測は coverage:baseline の total.branches.pct（2026-04 時点 ~80% 前後）。閾値はブレで落ちないよう実測よりやや下げる。
        global: {
            lines: 85,
            branches: 79
        },
        "middlewares/validate.js": { lines: 90, branches: 70 },
        "utils/priceCalc.js": { lines: 99, branches: 99 }
    }
};
