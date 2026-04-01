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
        "utils/excelReader.js"
    ],
    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/tests/"
    ],
    coverageThreshold: {
        // 分岐85%を長期目標とする。現状は ~79% 前後（2026-04 時点）。ブレ対策でやや下げめに設定。
        global: {
            lines: 85,
            branches: 78
        },
        "middlewares/validate.js": { lines: 90, branches: 70 },
        "utils/priceCalc.js": { lines: 99, branches: 99 }
    }
};
