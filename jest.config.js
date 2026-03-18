/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
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
        // 実測に合わせて閾値を設定（共同編集・CI 通過用）。余力で分岐を上げる場合は global branches 等を引き上げ可
        global: {
            lines: 80,
            branches: process.env.CI === "true" ? 60 : 62
        },
        "middlewares/validate.js": { lines: 90, branches: 70 },
        "utils/priceCalc.js": { lines: 99, branches: 99 },
        "routes/auth-api.js": { lines: 80, branches: 66 },
        "routes/orders-api.js": { lines: 90, branches: 62 },
        "routes/admin-api.js": { lines: 79, branches: 61 }
    }
};
